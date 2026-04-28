import { Command, CommanderError } from "@commander-js/extra-typings";
import { assertIsUnreachable } from "@patricktree/commons-ecma/util/assert";
import { processUtil } from "@patricktree/commons-node/utils/process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import {
  LocalDeviceProfileStore,
  RelayRpcClient,
  type LocalDeviceProfile,
} from "@content-relay/client";
import { createLogger } from "@content-relay/o11y.logs";
import {
  assertValidAbsoluteUrl,
  deliveryListStateSchema,
  devicePlatformSchema,
  isValidAbsoluteUrl,
  type DeliveryListState,
  type DeliveryResource,
  type DevicePlatform,
} from "@content-relay/shared";

import { instrumentationScopeFromModuleURL } from "#pkg/observability/instrumentation-scope.ts";

const RELAY_CLI_NAME = "relay";

type GlobalOptions = {
  server?: string;
  device?: string;
  json?: boolean;
  plain?: boolean;
  quiet?: boolean;
  verbose?: boolean;
  noInput?: boolean;
  noColor?: boolean;
};

type OutputMode = "human" | "json" | "plain";

const EXIT_CODES = {
  success: 0,
  genericFailure: 1,
  invalidUsage: 2,
  localConfigProblem: 3,
  authenticationFailure: 4,
  networkFailure: 5,
  notFound: 6,
} as const;

const logger = createLogger(instrumentationScopeFromModuleURL(import.meta.url));

const program = new Command()
  .name(RELAY_CLI_NAME)
  .description("Headless content-relay client and test harness")
  .version(readVersion())
  .option("--server <url>", "server base URL")
  .option("--device <name-or-id>", "local device profile to act as")
  .option("--json", "emit machine-readable JSON")
  .option("--plain", "emit stable line-oriented text")
  .option("-q, --quiet", "suppress non-essential human output")
  .option("-v, --verbose", "include extra diagnostics on stderr")
  .option("--no-input", "disable prompts and confirmations")
  .option("--no-color", "disable ANSI color")
  .showHelpAfterError();

program.exitOverride();

program
  .command("device")
  .description("Manage local device profiles")
  .addCommand(
    new Command("register")
      .requiredOption("--name <nickname>", "nickname")
      .requiredOption("--platform <platform>", "platform profile")
      .requiredOption("--invite <invite>", "invite URL or code")
      .option("--make-active", "make the registered profile active", true)
      .action(async (options) => {
        const context = createExecutionContext();
        const client = new RelayRpcClient();
        const store = createProfileStore();
        const serverBaseUrl = resolveServerBaseUrl(context);
        const platform = devicePlatformSchema.parse(options.platform);
        const registration = await client.registerDevice(serverBaseUrl, {
          nickname: options.name,
          platform,
          invite: options.invite,
        });
        const profile = await store.createProfile(registration, {
          makeActive: options.makeActive,
        });

        emit(context, {
          profileId: profile.profileId,
          deviceId: profile.deviceId,
          nickname: profile.nickname,
          platform: profile.platform,
          serverBaseUrl: profile.serverBaseUrl,
        });
      }),
  )
  .addCommand(
    new Command("list").action(async () => {
      const context = createExecutionContext();
      const store = createProfileStore();
      const profiles = await store.listProfiles();
      const activeProfile = await store.getActiveProfile();

      if (context.outputMode === "plain") {
        logger.info(
          profiles
            .map(
              (profile) =>
                `${profile.profileId}\t${profile.nickname}\t${profile.platform}\t${profile.deviceId}\t${activeProfile?.profileId === profile.profileId ? "active" : "inactive"}`,
            )
            .join("\n"),
        );

        return;
      }

      emit(context, {
        profiles: profiles.map((profile) => ({
          profileId: profile.profileId,
          deviceId: profile.deviceId,
          nickname: profile.nickname,
          platform: profile.platform,
          isActive: activeProfile?.profileId === profile.profileId,
        })),
      });
    }),
  )
  .addCommand(
    new Command("show").argument("[device]", "profile name or id").action(async (device) => {
      const context = createExecutionContext();
      const store = createProfileStore();
      const profile = await store.resolveProfile(device ?? context.globalOptions.device);
      const client = new RelayRpcClient();
      const devices = await client.listDevices(profile);
      const serverDevice = devices.find((entry) => entry.deviceId === profile.deviceId) ?? null;

      emit(context, { profile, serverDevice });
    }),
  )
  .addCommand(
    new Command("use").argument("<device>", "profile name or id").action(async (device) => {
      const context = createExecutionContext();
      const store = createProfileStore();
      const profile = await store.resolveProfile(device);
      await store.setActiveProfile(profile.profileId);
      emit(context, { activeProfileId: profile.profileId, nickname: profile.nickname });
    }),
  )
  .addCommand(
    new Command("rename")
      .argument("<device>", "profile name or id")
      .requiredOption("--name <nickname>", "new nickname")
      .action(async (device, options) => {
        const context = createExecutionContext();
        const store = createProfileStore();
        const client = new RelayRpcClient();
        const profile = await store.resolveProfile(device);
        const renamedDevice = await client.renameDevice(profile, options.name);
        const updatedProfile = await store.renameProfile(profile.profileId, renamedDevice.nickname);

        emit(context, { profile: updatedProfile, serverDevice: renamedDevice });
      }),
  )
  .addCommand(
    new Command("remove")
      .argument("<device>", "profile name or id")
      .option("--forget-only", "remove the local profile only", false)
      .option("--force", "skip confirmation", false)
      .action(async (device, options) => {
        const context = createExecutionContext();
        const store = createProfileStore();
        const profile = await store.resolveProfile(device);
        ensureConfirmationAllowed(context, options.force, "device remove");
        const client = new RelayRpcClient();

        if (!options.forgetOnly) {
          await client.removeDevice(profile);
        }
        await store.removeProfile(profile.profileId);

        emit(context, { removedProfileId: profile.profileId, forgetOnly: options.forgetOnly });
      }),
  )
  .addCommand(
    new Command("current").action(async () => {
      const context = createExecutionContext();
      const store = createProfileStore();
      const profile = await store.requireActiveProfile();

      emit(context, profile);
    }),
  );

program
  .command("send")
  .description("Send items")
  .addCommand(
    new Command("text")
      .argument("[text]", "text payload")
      .option("--stdin", "read text from stdin")
      .option("--title <title>", "optional custom title")
      .option("--to <device...>", "one or more target devices")
      .option("--no-remember-targets", "do not update last-used targets")
      .action(async (textArgument, options) => {
        const context = createExecutionContext();
        const store = createProfileStore();
        const client = new RelayRpcClient();
        const profile = await resolveActingProfile(store, context.globalOptions.device);
        const text = await resolveTextPayload(textArgument, Boolean(options.stdin));

        if (textArgument !== undefined && options.stdin) {
          throw new Error("Cannot provide both inline text and --stdin.");
        }

        if (text.trim().includes("\n") === false && isValidAbsoluteUrl(text.trim())) {
          throw new Error(
            "The text payload is a single-line valid URL. Use `relay send url <url>` instead.",
          );
        }

        const targetDeviceIds = await resolveTargetDeviceIds(store, profile, options.to);
        const payload = await client.sendText(profile, {
          text,
          title: options.title,
          targetDeviceIds,
        });

        if (options.rememberTargets) {
          await store.rememberTargets(profile.profileId, targetDeviceIds);
        }

        emit(context, payload);
      }),
  )
  .addCommand(
    new Command("url")
      .argument("<url>", "absolute URL")
      .option("--title <title>", "optional custom title")
      .option("--to <device...>", "one or more target devices")
      .option("--no-remember-targets", "do not update last-used targets")
      .action(async (url, options) => {
        const context = createExecutionContext();
        const store = createProfileStore();
        const client = new RelayRpcClient();
        const profile = await resolveActingProfile(store, context.globalOptions.device);
        const targetDeviceIds = await resolveTargetDeviceIds(store, profile, options.to);
        const payload = await client.sendUrl(profile, {
          url: assertValidAbsoluteUrl(url),
          title: options.title,
          targetDeviceIds,
        });

        if (options.rememberTargets) {
          await store.rememberTargets(profile.profileId, targetDeviceIds);
        }

        emit(context, payload);
      }),
  )
  .addCommand(
    new Command("file")
      .argument("<path...>", "one or more file paths")
      .option("--title <title>", "optional custom title")
      .option("--to <device...>", "one or more target devices")
      .option("--no-remember-targets", "do not update last-used targets")
      .action(async (filePaths, options) => {
        const context = createExecutionContext();
        const store = createProfileStore();
        const client = new RelayRpcClient();
        const profile = await resolveActingProfile(store, context.globalOptions.device);
        const files = await Promise.all(
          filePaths.map(async (filePath) => {
            const fileStats = await fs.promises.stat(filePath);
            if (!fileStats.isFile()) {
              throw new Error(`Expected a regular file but received: ${filePath}`);
            }

            return {
              filePath,
              fileName: path.basename(filePath),
            };
          }),
        );
        const targetDeviceIds = await resolveTargetDeviceIds(store, profile, options.to);
        const payload = await client.sendFiles(profile, {
          files,
          ...(options.title !== undefined ? { title: options.title } : {}),
          targetDeviceIds,
        });

        if (options.rememberTargets) {
          await store.rememberTargets(profile.profileId, targetDeviceIds);
        }

        emit(context, payload);
      }),
  );

program
  .command("receive")
  .description("Receive pending deliveries")
  .addCommand(
    new Command("once")
      .option("--no-ack", "inspect without acknowledging delivery")
      .option("--simulate-platform", "apply platform-profile receive behavior", true)
      .action(async (options) => {
        const context = createExecutionContext();
        const store = createProfileStore();
        const profile = await resolveActingProfile(store, context.globalOptions.device);
        const client = new RelayRpcClient();
        const deliveries = await client.receivePendingDeliveries(profile, store, {
          acknowledge: options.ack,
          simulatePlatform: options.simulatePlatform,
          deduplicate: true,
        });

        emit(context, {
          deliveries: deliveries.map((entry) => ({
            delivery: entry.delivery,
            wasDuplicate: entry.wasDuplicate,
            simulation: entry.simulation,
          })),
        });
      }),
  )
  .addCommand(
    new Command("watch")
      .option("--interval <duration>", "poll interval", "10s")
      .option("--no-ack", "inspect without acknowledging delivery")
      .option("--simulate-platform", "apply platform-profile receive behavior", true)
      .action(async (options) => {
        const context = createExecutionContext();
        const store = createProfileStore();
        const profile = await resolveActingProfile(store, context.globalOptions.device);
        const client = new RelayRpcClient();
        const intervalMs = parseDurationToMilliseconds(options.interval);

        for (;;) {
          const deliveries = await client.receivePendingDeliveries(profile, store, {
            acknowledge: options.ack,
            simulatePlatform: options.simulatePlatform,
            deduplicate: true,
          });

          if (deliveries.length > 0) {
            emit(context, {
              deliveries: deliveries.map((entry) => ({
                delivery: entry.delivery,
                wasDuplicate: entry.wasDuplicate,
                simulation: entry.simulation,
              })),
            });
          } else if (context.globalOptions.verbose) {
            logger.info(`No pending deliveries for ${profile.nickname}.`);
          }

          await new Promise((resolve) => setTimeout(resolve, intervalMs));
        }
      }),
  );

program
  .command("delivery")
  .description("Inspect and manage deliveries")
  .addCommand(
    new Command("list")
      .option("--state <state>", "delivery state", "pending")
      .option("--limit <n>", "max rows to render", "50")
      .action(async (options) => {
        const context = createExecutionContext();
        const store = createProfileStore();
        const profile = await resolveActingProfile(store, context.globalOptions.device);
        const client = new RelayRpcClient();
        const state = deliveryListStateSchema.parse(options.state) as DeliveryListState;
        const limit = Number.parseInt(options.limit, 10);
        const payload = await client.listDeliveries(profile, state, limit);

        emit(context, payload);
      }),
  )
  .addCommand(
    new Command("show").argument("<delivery-id>").action(async (deliveryId) => {
      const context = createExecutionContext();
      const store = createProfileStore();
      const profile = await resolveActingProfile(store, context.globalOptions.device);
      const client = new RelayRpcClient();
      const delivery = await client.getDelivery(profile, deliveryId);

      emit(context, { delivery });
    }),
  )
  .addCommand(
    new Command("ack").argument("<delivery-id>").action(async (deliveryId) => {
      const context = createExecutionContext();
      const store = createProfileStore();
      const profile = await resolveActingProfile(store, context.globalOptions.device);
      const client = new RelayRpcClient();
      const payload = await client.acknowledgeDelivery(profile, deliveryId);

      emit(context, payload);
    }),
  )
  .addCommand(
    new Command("view").argument("<delivery-id>").action(async (deliveryId) => {
      const context = createExecutionContext();
      const store = createProfileStore();
      const profile = await resolveActingProfile(store, context.globalOptions.device);
      const client = new RelayRpcClient();
      const payload = await client.markDeliveryViewed(profile, deliveryId);

      emit(context, payload);
    }),
  )
  .addCommand(
    new Command("open").argument("<delivery-id>").action(async (deliveryId) => {
      const context = createExecutionContext();
      const store = createProfileStore();
      const profile = await resolveActingProfile(store, context.globalOptions.device);
      const client = new RelayRpcClient();
      const delivery = await client.getDelivery(profile, deliveryId);
      const summary = buildDeliveryOpenSummary(profile.platform, delivery);
      const viewed = await client.markDeliveryViewed(profile, deliveryId);

      emit(context, { opened: summary, delivery: viewed.delivery });
    }),
  )
  .addCommand(
    new Command("download")
      .argument("<delivery-id>")
      .option("--out <path>", "output file or directory path")
      .action(async (deliveryId, options) => {
        const context = createExecutionContext();
        const store = createProfileStore();
        const profile = await resolveActingProfile(store, context.globalOptions.device);
        const client = new RelayRpcClient();
        const download = await client.downloadDelivery(profile, deliveryId);
        const outputPaths = await client.writeDownloadedDelivery(download, options.out);

        emit(context, { itemId: download.item.itemId, outputPaths });
      }),
  );

program
  .command("item")
  .description("Inspect sent items")
  .addCommand(
    new Command("list")
      .option("--limit <n>", "max rows to render", "50")
      .action(async (options) => {
        const context = createExecutionContext();
        const store = createProfileStore();
        const profile = await resolveActingProfile(store, context.globalOptions.device);
        const client = new RelayRpcClient();
        const payload = await client.listItems(profile, Number.parseInt(options.limit, 10));

        emit(context, payload);
      }),
  )
  .addCommand(
    new Command("show").argument("<item-id>").action(async (itemId) => {
      const context = createExecutionContext();
      const store = createProfileStore();
      const profile = await resolveActingProfile(store, context.globalOptions.device);
      const client = new RelayRpcClient();
      const item = await client.getItem(profile, itemId);

      emit(context, { item });
    }),
  );

void main().then((exitCode) => {
  processUtil.gracefulExit(exitCode);
});

async function main(): Promise<number> {
  try {
    await program.parseAsync(process.argv);

    return EXIT_CODES.success;
  } catch (error) {
    if (error instanceof CommanderError) {
      logger.error(error.message);

      return error.exitCode === 0 ? EXIT_CODES.success : EXIT_CODES.invalidUsage;
    }

    const exitCode = inferExitCode(error);
    logger.error(formatErrorMessage(error));

    return exitCode;
  }
}

function createExecutionContext(): {
  globalOptions: GlobalOptions;
  outputMode: OutputMode;
} {
  const globalOptions = program.opts() as GlobalOptions;
  const outputMode = globalOptions.json ? "json" : globalOptions.plain ? "plain" : "human";

  return {
    globalOptions,
    outputMode,
  };
}

function createProfileStore(): LocalDeviceProfileStore {
  return new LocalDeviceProfileStore(process.env["RELAY_CONFIG_DIR"]);
}

async function resolveActingProfile(
  store: LocalDeviceProfileStore,
  deviceFlagValue: string | undefined,
): Promise<LocalDeviceProfile> {
  const envDevice = process.env["RELAY_DEVICE"];

  return await store.resolveProfile(deviceFlagValue ?? envDevice);
}

function resolveServerBaseUrl(context: { globalOptions: GlobalOptions }): string {
  const serverBaseUrl =
    context.globalOptions.server ?? process.env["RELAY_SERVER_URL"] ?? undefined;

  if (serverBaseUrl === undefined) {
    throw new Error("No server base URL configured. Use --server <url> or set RELAY_SERVER_URL.");
  }

  return serverBaseUrl.replace(/\/$/, "");
}

async function resolveTargetDeviceIds(
  store: LocalDeviceProfileStore,
  profile: LocalDeviceProfile,
  explicitTargets: string[] | undefined,
): Promise<string[]> {
  if (explicitTargets === undefined || explicitTargets.length === 0) {
    return await store.resolveTargetDeviceIds(profile.profileId, undefined);
  }

  const resolvedTargets = await Promise.all(
    explicitTargets.map(async (target) => {
      const knownProfile = await store.getProfileByIdOrName(target);

      return knownProfile?.deviceId ?? target;
    }),
  );

  return await store.resolveTargetDeviceIds(profile.profileId, resolvedTargets);
}

async function resolveTextPayload(
  textArgument: string | undefined,
  shouldReadStdin: boolean,
): Promise<string> {
  if (textArgument !== undefined) {
    return textArgument;
  }

  if (shouldReadStdin || !process.stdin.isTTY) {
    const chunks: Buffer[] = [];

    for await (const chunk of process.stdin) {
      chunks.push(Buffer.from(chunk));
    }

    const value = Buffer.concat(chunks).toString("utf8");
    if (value.length === 0) {
      throw new Error("No text payload provided on stdin.");
    }

    return value;
  }

  throw new Error("No text payload provided. Pass inline text or pipe stdin.");
}

function emit(
  context: { globalOptions: GlobalOptions; outputMode: OutputMode },
  value: unknown,
): void {
  if (context.outputMode === "json") {
    logger.info(JSON.stringify(value, null, 2));

    return;
  }

  if (context.outputMode === "plain") {
    emitPlainValue(value);

    return;
  }

  if (context.globalOptions.quiet) {
    logger.info(JSON.stringify(value));

    return;
  }

  logger.info(JSON.stringify(value, null, 2));
}

function emitPlainValue(value: unknown): void {
  if (typeof value === "string") {
    logger.info(value);

    return;
  }

  if (Array.isArray(value)) {
    logger.info(value.map((entry) => JSON.stringify(entry)).join("\n"));

    return;
  }

  logger.info(JSON.stringify(value));
}

function buildDeliveryOpenSummary(platform: DevicePlatform, delivery: DeliveryResource): string {
  switch (delivery.item.type) {
    case "text":
      return `Opened text on ${platform}: ${delivery.item.text ?? ""}`;
    case "url":
      return `Opened URL on ${platform}: ${delivery.item.url ?? ""}`;
    case "file":
      return `Opened file detail on ${platform}: ${delivery.item.files.map((file) => file.fileName).join(", ")}`;
    default:
      return assertIsUnreachable(delivery.item.type);
  }
}

function parseDurationToMilliseconds(value: string): number {
  const match = /^(\d+)(ms|s|m)$/.exec(value.trim());
  if (match === null) {
    throw new Error(`Invalid duration: ${value}. Use values like 500ms, 10s, or 2m.`);
  }

  const amountText = match[1];
  const unit = match[2];
  if (amountText === undefined || unit === undefined) {
    throw new Error(`Invalid duration: ${value}.`);
  }

  const amount = Number.parseInt(amountText, 10);
  switch (unit) {
    case "ms":
      return amount;
    case "s":
      return amount * 1000;
    case "m":
      return amount * 60 * 1000;
    default:
      throw new Error(`Unsupported duration unit: ${unit}`);
  }
}

function ensureConfirmationAllowed(
  context: { globalOptions: GlobalOptions },
  force: boolean,
  commandName: string,
): void {
  if (force) {
    return;
  }

  if (context.globalOptions.noInput || !process.stdin.isTTY) {
    throw new Error(`Refusing to run ${commandName} without --force in non-interactive mode.`);
  }

  throw new Error(
    `Interactive confirmations are not implemented yet for ${commandName}. Re-run with --force.`,
  );
}

function inferExitCode(error: unknown): number {
  const message = formatErrorMessage(error).toLowerCase();

  if (
    message.includes("unknown local device profile") ||
    message.includes("no active device profile") ||
    message.includes("no server base url configured") ||
    message.includes("no target devices provided")
  ) {
    return EXIT_CODES.localConfigProblem;
  }

  if (message.includes("authentication") || message.includes("401")) {
    return EXIT_CODES.authenticationFailure;
  }

  if (
    message.includes("fetch failed") ||
    message.includes("network") ||
    message.includes("econnrefused") ||
    message.includes("enotfound")
  ) {
    return EXIT_CODES.networkFailure;
  }

  if (message.includes("not found") || message.includes("404")) {
    return EXIT_CODES.notFound;
  }

  if (
    message.includes("expected") ||
    message.includes("invalid") ||
    message.includes("cannot provide both") ||
    message.includes("looks like a url")
  ) {
    return EXIT_CODES.invalidUsage;
  }

  return EXIT_CODES.genericFailure;
}

function formatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function readVersion(): string {
  const packageJsonPath = new URL("../package.json", import.meta.url);
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as {
    version?: string;
  };

  return packageJson.version ?? "0.0.0";
}
