import { Command, InvalidOptionArgumentError, Option } from "@commander-js/extra-typings";
import { jsonUtil } from "@patricktree/commons-ecma/util/json";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import {
  extractErrorMessageFromParseResponseError,
  isParseResponseError,
  parseOkResponse,
  RpcClient,
} from "@content-relay/client";
import {
  assertValidAbsoluteUrl,
  deliveryListStates,
  devicePlatforms,
  isMobileDevicePlatform,
  type DevicePlatform,
  type PushRegistration,
} from "@content-relay/contracts";
import {
  LocalDeviceProfileStore,
  type LocalDeviceProfile,
} from "@content-relay/profile-store-node";
import * as numberUtils from "@content-relay/utils-ecma/number.utils";

import { openDelivery } from "#pkg/use-cases/open-delivery.ts";
import { receivePendingDeliveries } from "#pkg/use-cases/receive-pending-deliveries.ts";
import { writeDownloadedDelivery } from "#pkg/use-cases/write-downloaded-delivery.ts";

const profileStore = new LocalDeviceProfileStore(process.env["RELAY_CONFIG_DIR"]);

{
  const program = new Command()
    .name("relay")
    .description("CLI for content-relay")
    .showHelpAfterError()
    .addOption(new Option("--json", "emit JSON responses"))
    .addOption(
      new Option("--relay-hub-base-url <url>", "Relay Hub base URL for registration").argParser(
        (value) => assertValidAbsoluteUrl(value),
      ),
    )
    .addOption(new Option("--device <profile>", "profile id, device id, or nickname to use"));

  const inviteCommand = program.command("invite").description("Manage invites");
  const deviceCommand = program.command("device").description("Manage local device profiles");
  const devicePushTokenCommand = deviceCommand
    .command("push-token")
    .description("Manage device push tokens");
  const sendCommand = program.command("send").description("Send content");
  const receiveCommand = program.command("receive").description("Receive deliveries");
  const deliveryCommand = program.command("delivery").description("Inspect and manage deliveries");
  const itemCommand = program.command("item").description("Inspect sent items");

  inviteCommand
    .command("create")
    .description("Create an invite")
    .option(
      "--expires-in <seconds>",
      "invite expiration in seconds",
      numberUtils.parsePositiveInteger,
    )
    .action(async (options) => {
      const relayHubBaseUrl = program.opts().relayHubBaseUrl;

      if (relayHubBaseUrl === undefined) {
        throw new Error("Missing required --relay-hub-base-url <url> option.");
      }

      const invite = await parseOkResponse(
        new RpcClient(relayHubBaseUrl).createInvite({ expiresInSeconds: options.expiresIn ?? 900 }),
      );

      await writeSuccess(invite, Boolean(program.opts().json));
    });

  deviceCommand
    .command("register")
    .description("Register a new device profile")
    .requiredOption("--name <nickname>", "device nickname")
    .addOption(
      new Option("--platform <platform>", "device platform")
        .choices([...devicePlatforms])
        .makeOptionMandatory(true),
    )
    .option("--push-token <token>", "push token override for simulated mobile registration")
    .requiredOption("--invite <inviteCode>", "invite code")
    .action(async (options) => {
      const relayHubBaseUrl = program.opts().relayHubBaseUrl;

      if (relayHubBaseUrl === undefined) {
        throw new Error("Missing required --relay-hub-base-url <url> option.");
      }

      const pushRegistration = buildCliPushRegistration({
        nickname: options.name,
        platform: options.platform,
        pushTokenOverride: options.pushToken,
      });
      const registration = await parseOkResponse(
        new RpcClient(relayHubBaseUrl).registerDevice({
          nickname: options.name,
          platform: options.platform,
          invite: options.invite,
          ...(pushRegistration === undefined ? {} : { pushRegistration }),
        }),
      );

      const profile = await profileStore.createProfile(registration, { makeActive: true });
      await writeSuccess(
        serializeProfile(profile, profile.profileId),
        Boolean(program.opts().json),
      );
    });

  deviceCommand
    .command("current")
    .description("Show the active device profile")
    .action(async () => {
      const activeProfile = await profileStore.requireActiveProfile();
      const activeProfileId = await loadActiveProfileId();

      await writeSuccess(
        serializeProfile(activeProfile, activeProfileId),
        Boolean(program.opts().json),
      );
    });

  deviceCommand
    .command("use")
    .description("Set the active device profile")
    .argument("<profile>", "profile id, device id, or nickname")
    .action(async (profileIdOrName: string) => {
      const profile = await profileStore.resolveProfile(profileIdOrName);
      await profileStore.setActiveProfile(profile.profileId);

      await writeSuccess(
        serializeProfile(profile, profile.profileId),
        Boolean(program.opts().json),
      );
    });

  deviceCommand
    .command("list")
    .description("List registered devices from the Relay Hub")
    .action(async () => {
      const profile = await resolveSelectedProfile(program.opts().device);
      const devices = await parseOkResponse(
        new RpcClient(profile.relayHubBaseUrl)
          .createDeviceRpcClient(profile.deviceId)
          .listDevices(),
      );

      await writeSuccess(devices, Boolean(program.opts().json));
    });

  deviceCommand
    .command("rename")
    .description("Rename the selected device")
    .argument("<nickname>", "new device nickname")
    .action(async (nickname: string) => {
      const profile = await resolveSelectedProfile(program.opts().device);
      await parseOkResponse(
        new RpcClient(profile.relayHubBaseUrl)
          .createDeviceRpcClient(profile.deviceId)
          .renameDevice({ nickname }),
      );
      const renamedProfile = await profileStore.renameProfile(profile.profileId, nickname);
      const activeProfileId = await loadActiveProfileId();

      await writeSuccess(
        serializeProfile(renamedProfile, activeProfileId),
        Boolean(program.opts().json),
      );
    });

  deviceCommand
    .command("delete")
    .description("Delete the selected device")
    .requiredOption("--yes", "confirm device deletion")
    .action(async () => {
      const profile = await resolveSelectedProfile(program.opts().device);
      await parseOkResponse(
        new RpcClient(profile.relayHubBaseUrl)
          .createDeviceRpcClient(profile.deviceId)
          .deleteDevice(),
      );
      await profileStore.removeProfile(profile.profileId);

      await writeSuccess(
        {
          deleted: true,
          deviceId: profile.deviceId,
          profileId: profile.profileId,
        } as const,
        Boolean(program.opts().json),
      );
    });

  devicePushTokenCommand
    .command("set")
    .description("Set the push token for the selected device")
    .argument("<token>", "push token")
    .action(async (token: string) => {
      const profile = await resolveSelectedProfile(program.opts().device);
      await parseOkResponse(
        new RpcClient(profile.relayHubBaseUrl)
          .createDeviceRpcClient(profile.deviceId)
          .setPushToken({ token }),
      );

      await writeSuccess(
        {
          deviceId: profile.deviceId,
          pushTokenUpdated: true,
        } as const,
        Boolean(program.opts().json),
      );
    });

  sendCommand
    .command("text")
    .description("Send a text item")
    .argument("<text>", "text to send")
    .requiredOption("--to <device...>", "target profile ids, device ids, or nicknames")
    .option("--title <title>", "optional title")
    .action(async (text: string, options) => {
      const profile = await resolveSelectedProfile(program.opts().device);
      const targetDeviceIds = await resolveTargetDeviceIds(options.to);
      const response = await parseOkResponse(
        new RpcClient(profile.relayHubBaseUrl).createDeviceRpcClient(profile.deviceId).sendText({
          text,
          targetDeviceIds,
          ...(options.title !== undefined ? { title: options.title } : {}),
        }),
      );

      await profileStore.rememberTargets(profile.profileId, targetDeviceIds);
      await writeSuccess(response, Boolean(program.opts().json));
    });

  sendCommand
    .command("url")
    .description("Send a URL item")
    .argument("<url>", "URL to send")
    .requiredOption("--to <device...>", "target profile ids, device ids, or nicknames")
    .option("--title <title>", "optional title")
    .action(async (url: string, options) => {
      const profile = await resolveSelectedProfile(program.opts().device);
      const targetDeviceIds = await resolveTargetDeviceIds(options.to);
      const response = await parseOkResponse(
        new RpcClient(profile.relayHubBaseUrl).createDeviceRpcClient(profile.deviceId).sendUrl({
          url,
          targetDeviceIds,
          ...(options.title !== undefined ? { title: options.title } : {}),
        }),
      );

      await profileStore.rememberTargets(profile.profileId, targetDeviceIds);
      await writeSuccess(response, Boolean(program.opts().json));
    });

  sendCommand
    .command("file")
    .description("Send one or more files")
    .argument("<filePaths...>", "paths of files to upload")
    .requiredOption("--to <device...>", "target profile ids, device ids, or nicknames")
    .option("--title <title>", "optional title")
    .action(async (filePaths: string[], options) => {
      const profile = await resolveSelectedProfile(program.opts().device);
      const targetDeviceIds = await resolveTargetDeviceIds(options.to);
      const files = await Promise.all(
        filePaths.map(async (filePath) => {
          const content = await fs.promises.readFile(filePath);

          return {
            content,
            basename: path.basename(filePath),
          };
        }),
      );
      const response = await parseOkResponse(
        new RpcClient(profile.relayHubBaseUrl).createDeviceRpcClient(profile.deviceId).sendFiles({
          files,
          targetDeviceIds,
          ...(options.title !== undefined ? { title: options.title } : {}),
        }),
      );

      await profileStore.rememberTargets(profile.profileId, targetDeviceIds);
      await writeSuccess(response, Boolean(program.opts().json));
    });

  receiveCommand
    .command("once")
    .description("Fetch pending deliveries once")
    .action(async () => {
      const profile = await resolveSelectedProfile(program.opts().device);
      const receivedDeliveries = await receivePendingDeliveries(profile, profileStore);

      await writeSuccess(receivedDeliveries, Boolean(program.opts().json));
    });

  deliveryCommand
    .command("list")
    .description("List deliveries")
    .addOption(
      new Option("--state <state>", "delivery state filter")
        .choices([...deliveryListStates])
        .default("pending"),
    )
    .option(
      "--limit <count>",
      "maximum number of deliveries to return",
      numberUtils.parsePositiveInteger,
    )
    .action(async (options) => {
      const profile = await resolveSelectedProfile(program.opts().device);
      const deliveries = await parseOkResponse(
        new RpcClient(profile.relayHubBaseUrl)
          .createDeviceRpcClient(profile.deviceId)
          .listDeliveries({
            state: options.state,
            limit: options.limit ?? 50,
          }),
      );

      await writeSuccess(deliveries, Boolean(program.opts().json));
    });

  deliveryCommand
    .command("show")
    .description("Show a delivery")
    .argument("<deliveryId>", "delivery id")
    .action(async (deliveryId: string) => {
      const profile = await resolveSelectedProfile(program.opts().device);
      const delivery = await parseOkResponse(
        new RpcClient(profile.relayHubBaseUrl)
          .createDeviceRpcClient(profile.deviceId)
          .getDelivery({ deliveryId: deliveryId }),
      );

      await writeSuccess(delivery.delivery, Boolean(program.opts().json));
    });

  deliveryCommand
    .command("ack")
    .description("Acknowledge a delivery")
    .argument("<deliveryId>", "delivery id")
    .action(async (deliveryId: string) => {
      const profile = await resolveSelectedProfile(program.opts().device);
      const response = await parseOkResponse(
        new RpcClient(profile.relayHubBaseUrl)
          .createDeviceRpcClient(profile.deviceId)
          .acknowledgeDelivery({ deliveryId: deliveryId }),
      );

      await writeSuccess(response, Boolean(program.opts().json));
    });

  deliveryCommand
    .command("viewed")
    .description("Mark a delivery as viewed")
    .argument("<deliveryId>", "delivery id")
    .action(async (deliveryId: string) => {
      const profile = await resolveSelectedProfile(program.opts().device);
      const response = await parseOkResponse(
        new RpcClient(profile.relayHubBaseUrl)
          .createDeviceRpcClient(profile.deviceId)
          .markDeliveryViewed({ deliveryId: deliveryId }),
      );

      await writeSuccess(response, Boolean(program.opts().json));
    });

  deliveryCommand
    .command("open")
    .description("Open a delivery and mark it viewed")
    .argument("<deliveryId>", "delivery id")
    .action(async (deliveryId: string) => {
      const profile = await resolveSelectedProfile(program.opts().device);
      const response = await openDelivery(profile, deliveryId, profileStore);

      await writeSuccess(response, Boolean(program.opts().json));
    });

  deliveryCommand
    .command("download")
    .description("Download files from a delivery")
    .argument("<deliveryId>", "delivery id")
    .option("--out <path>", "output file or directory")
    .action(async (deliveryId: string, options) => {
      const profile = await resolveSelectedProfile(program.opts().device);
      const download = await parseOkResponse(
        new RpcClient(profile.relayHubBaseUrl)
          .createDeviceRpcClient(profile.deviceId)
          .downloadDelivery({ deliveryId: deliveryId }),
      );
      const outputPaths = await writeDownloadedDelivery(download, options.out);

      await writeSuccess(
        {
          itemId: download.item.itemId,
          outputPaths,
        },
        Boolean(program.opts().json),
      );
    });

  itemCommand
    .command("list")
    .description("List sent items")
    .option(
      "--limit <count>",
      "maximum number of items to return",
      numberUtils.parsePositiveInteger,
    )
    .action(async (options) => {
      const profile = await resolveSelectedProfile(program.opts().device);
      const items = await parseOkResponse(
        new RpcClient(profile.relayHubBaseUrl)
          .createDeviceRpcClient(profile.deviceId)
          .listItems({ limit: options.limit ?? 50 }),
      );

      await writeSuccess(items, Boolean(program.opts().json));
    });

  itemCommand
    .command("show")
    .description("Show a sent item")
    .argument("<itemId>", "item id")
    .action(async (itemId: string) => {
      const profile = await resolveSelectedProfile(program.opts().device);
      const item = await parseOkResponse(
        new RpcClient(profile.relayHubBaseUrl)
          .createDeviceRpcClient(profile.deviceId)
          .getItem({ itemId: itemId }),
      );

      await writeSuccess(item, Boolean(program.opts().json));
    });

  try {
    await program.parseAsync(process.argv);
  } catch (error) {
    writeError(error, Boolean(program.opts().json));
  }
}

type BuildCliPushRegistrationInput = {
  nickname: string;
  platform: DevicePlatform;
  pushTokenOverride?: string | undefined;
};

function buildCliPushRegistration(
  input: BuildCliPushRegistrationInput,
): PushRegistration | undefined {
  if (!isMobileDevicePlatform(input.platform)) {
    if (input.pushTokenOverride !== undefined) {
      throw new Error("--push-token is only supported for ios and android simulated profiles.");
    }

    return undefined;
  }

  return {
    token:
      input.pushTokenOverride ??
      `simulated-${input.platform}-${input.nickname.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-token`,
  };
}

async function resolveSelectedProfile(
  requestedProfile: string | undefined,
): Promise<LocalDeviceProfile> {
  return await profileStore.resolveProfile(requestedProfile);
}

async function loadActiveProfileId(): Promise<string | null> {
  const activeProfile = await profileStore.getActiveProfile();

  return activeProfile?.profileId ?? null;
}

async function resolveTargetDeviceIds(deviceSelectors: string[]): Promise<string[]> {
  const targetDeviceIds: string[] = [];

  for (const deviceSelector of deviceSelectors) {
    const profile = await profileStore.getProfileByIdOrName(deviceSelector);

    if (profile === null) {
      throw new Error(
        `Unknown target device: ${deviceSelector}. Register it first or use \`relay device use <device>\` to inspect configured profiles.`,
      );
    }

    if (!targetDeviceIds.includes(profile.deviceId)) {
      targetDeviceIds.push(profile.deviceId);
    }
  }

  return targetDeviceIds;
}

type SerializedProfile = Pick<
  LocalDeviceProfile,
  | "profileId"
  | "nickname"
  | "platform"
  | "deviceId"
  | "relayHubBaseUrl"
  | "createdAt"
  | "updatedAt"
  | "lastUsedTargetDeviceIds"
> & {
  isActive: boolean;
  handledDeliveryCount: number;
};

function serializeProfile(
  profile: LocalDeviceProfile,
  activeProfileId: string | null,
): SerializedProfile {
  return {
    profileId: profile.profileId,
    nickname: profile.nickname,
    platform: profile.platform,
    deviceId: profile.deviceId,
    relayHubBaseUrl: profile.relayHubBaseUrl,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
    lastUsedTargetDeviceIds: profile.lastUsedTargetDeviceIds,
    isActive: activeProfileId === profile.profileId,
    handledDeliveryCount: profile.handledDeliveryIds.length,
  };
}

async function writeSuccess(payload: unknown, isJson: boolean): Promise<void> {
  if (isJson) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);

    return;
  }

  if (typeof payload === "string") {
    process.stdout.write(`${payload}\n`);

    return;
  }

  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

function writeError(error: unknown, isJson: boolean): void {
  const message = formatErrorMessage(error);

  if (isJson) {
    process.stderr.write(`${JSON.stringify({ error: message })}\n`);
  } else {
    process.stderr.write(`${message}\n`);
  }

  process.exitCode = 1;
}

function formatErrorMessage(error: unknown): string {
  if (isParseResponseError(error)) {
    const errorMessage = extractErrorMessageFromParseResponseError(error);

    if (errorMessage !== undefined) {
      return errorMessage;
    }

    if (typeof error.statusCode === "number" || typeof error.statusCode === "string") {
      return `Request failed with status ${error.statusCode}.`;
    }

    return "Request failed.";
  }

  if (error instanceof InvalidOptionArgumentError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return `Unexpected error: ${jsonUtil.safeStringify(error)}`;
}
