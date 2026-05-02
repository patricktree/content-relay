import { Command, InvalidOptionArgumentError, Option } from "@commander-js/extra-typings";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import {
  rpcClient,
  simulatePlatformDelivery,
  type SimulatedDeliveryResult,
  parseOkResponse,
} from "@content-relay/client";
import {
  LocalDeviceProfileStore,
  type LocalDeviceProfile,
} from "@content-relay/profile-store-node";
import {
  assertValidAbsoluteUrl,
  deliveryListStates,
  devicePlatforms,
  isMobileDevicePlatform,
  type DeliveryResource,
  type DevicePlatform,
  type DownloadDeliveryResponse,
  type PushRegistration,
} from "@content-relay/shared";

type ReceivedDeliveryResult = {
  delivery: DeliveryResource;
  wasDuplicate: boolean;
  simulation: SimulatedDeliveryResult | null;
};

type OpenDeliveryResponse = {
  delivery: DeliveryResource;
  action: string;
};

type DownloadDeliveryCommandResponse = {
  itemId: string;
  outputPaths: string[];
};

type BuildCliPushRegistrationInput = {
  nickname: string;
  platform: DevicePlatform;
  pushTokenOverride?: string | undefined;
};

type SerializedProfile = Pick<
  LocalDeviceProfile,
  | "profileId"
  | "nickname"
  | "platform"
  | "deviceId"
  | "serverBaseUrl"
  | "createdAt"
  | "updatedAt"
  | "lastUsedTargetDeviceIds"
> & {
  isActive: boolean;
  handledDeliveryCount: number;
};

const profileStore = new LocalDeviceProfileStore(process.env["RELAY_CONFIG_DIR"]);

const program = new Command()
  .name("relay")
  .description("CLI for content-relay")
  .showHelpAfterError()
  .addOption(new Option("--json", "emit JSON responses"))
  .addOption(
    new Option("--server <url>", "server base URL for registration").argParser((value) =>
      assertValidAbsoluteUrl(value),
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
  .option("--expires-in <seconds>", "invite expiration in seconds", parsePositiveInteger)
  .action(async (options) => {
    const serverBaseUrl = program.opts().server;

    if (serverBaseUrl === undefined) {
      throw new Error("Missing required --server <url> option.");
    }

    const invite = await parseOkResponse(
      rpcClient.createInvite(serverBaseUrl, { expiresInSeconds: options.expiresIn ?? 900 }),
    );

    await writeSuccess(invite);
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
    const serverBaseUrl = program.opts().server;

    if (serverBaseUrl === undefined) {
      throw new Error("Missing required --server <url> option.");
    }

    const pushRegistration = buildCliPushRegistration({
      nickname: options.name,
      platform: options.platform,
      pushTokenOverride: options.pushToken,
    });
    const registration = await parseOkResponse(
      rpcClient.registerDevice(serverBaseUrl, {
        nickname: options.name,
        platform: options.platform,
        invite: options.invite,
        ...(pushRegistration === undefined ? {} : { pushRegistration }),
      }),
    );

    const profile = await profileStore.createProfile(registration, { makeActive: true });
    await writeSuccess(serializeProfile(profile, profile.profileId));
  });

deviceCommand
  .command("current")
  .description("Show the active device profile")
  .action(async () => {
    const activeProfile = await profileStore.requireActiveProfile();
    const activeProfileId = await loadActiveProfileId();

    await writeSuccess(serializeProfile(activeProfile, activeProfileId));
  });

deviceCommand
  .command("use")
  .description("Set the active device profile")
  .argument("<profile>", "profile id, device id, or nickname")
  .action(async (profileIdOrName: string) => {
    const profile = await profileStore.resolveProfile(profileIdOrName);
    await profileStore.setActiveProfile(profile.profileId);

    await writeSuccess(serializeProfile(profile, profile.profileId));
  });

deviceCommand
  .command("list")
  .description("List registered devices from the server")
  .action(async () => {
    const profile = await resolveSelectedProfile();
    const devices = await parseOkResponse(rpcClient.listDevices(profile));

    await writeSuccess(devices);
  });

deviceCommand
  .command("rename")
  .description("Rename the selected device")
  .argument("<nickname>", "new device nickname")
  .action(async (nickname: string) => {
    const profile = await resolveSelectedProfile();
    await parseOkResponse(rpcClient.renameDevice(profile, nickname));
    const renamedProfile = await profileStore.renameProfile(profile.profileId, nickname);
    const activeProfileId = await loadActiveProfileId();

    await writeSuccess(serializeProfile(renamedProfile, activeProfileId));
  });

deviceCommand
  .command("delete")
  .description("Delete the selected device")
  .requiredOption("--yes", "confirm device deletion")
  .action(async () => {
    const profile = await resolveSelectedProfile();
    await parseOkResponse(rpcClient.deleteDevice(profile));
    await profileStore.removeProfile(profile.profileId);

    await writeSuccess({
      deleted: true,
      deviceId: profile.deviceId,
      profileId: profile.profileId,
    } as const);
  });

devicePushTokenCommand
  .command("set")
  .description("Set the push token for the selected device")
  .argument("<token>", "push token")
  .action(async (token: string) => {
    const profile = await resolveSelectedProfile();
    await parseOkResponse(rpcClient.setPushToken(profile, token));

    await writeSuccess({
      deviceId: profile.deviceId,
      pushTokenUpdated: true,
    } as const);
  });

sendCommand
  .command("text")
  .description("Send a text item")
  .argument("<text>", "text to send")
  .requiredOption("--to <device...>", "target profile ids, device ids, or nicknames")
  .option("--title <title>", "optional title")
  .action(async (text: string, options) => {
    const profile = await resolveSelectedProfile();
    const targetDeviceIds = await resolveTargetDeviceIds(options.to);
    const response = await parseOkResponse(
      rpcClient.sendText(profile, {
        text,
        targetDeviceIds,
        ...(options.title !== undefined ? { title: options.title } : {}),
      }),
    );

    await profileStore.rememberTargets(profile.profileId, targetDeviceIds);
    await writeSuccess(response);
  });

sendCommand
  .command("url")
  .description("Send a URL item")
  .argument("<url>", "URL to send")
  .requiredOption("--to <device...>", "target profile ids, device ids, or nicknames")
  .option("--title <title>", "optional title")
  .action(async (url: string, options) => {
    const profile = await resolveSelectedProfile();
    const targetDeviceIds = await resolveTargetDeviceIds(options.to);
    const response = await parseOkResponse(
      rpcClient.sendUrl(profile, {
        url,
        targetDeviceIds,
        ...(options.title !== undefined ? { title: options.title } : {}),
      }),
    );

    await profileStore.rememberTargets(profile.profileId, targetDeviceIds);
    await writeSuccess(response);
  });

sendCommand
  .command("file")
  .description("Send one or more files")
  .argument("<filePaths...>", "paths of files to upload")
  .requiredOption("--to <device...>", "target profile ids, device ids, or nicknames")
  .option("--title <title>", "optional title")
  .action(async (filePaths: string[], options) => {
    const profile = await resolveSelectedProfile();
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
      rpcClient.sendFiles(profile, {
        files,
        targetDeviceIds,
        ...(options.title !== undefined ? { title: options.title } : {}),
      }),
    );

    await profileStore.rememberTargets(profile.profileId, targetDeviceIds);
    await writeSuccess(response);
  });

receiveCommand
  .command("once")
  .description("Fetch pending deliveries once")
  .action(async () => {
    const profile = await resolveSelectedProfile();
    const receivedDeliveries = await receivePendingDeliveries(profile);

    await writeSuccess(receivedDeliveries);
  });

deliveryCommand
  .command("list")
  .description("List deliveries")
  .addOption(
    new Option("--state <state>", "delivery state filter")
      .choices([...deliveryListStates])
      .default("pending"),
  )
  .option("--limit <count>", "maximum number of deliveries to return", parsePositiveInteger)
  .action(async (options) => {
    const profile = await resolveSelectedProfile();
    const deliveries = await parseOkResponse(
      rpcClient.listDeliveries(profile, { state: options.state, limit: options.limit ?? 50 }),
    );

    await writeSuccess(deliveries);
  });

deliveryCommand
  .command("show")
  .description("Show a delivery")
  .argument("<deliveryId>", "delivery id")
  .action(async (deliveryId: string) => {
    const profile = await resolveSelectedProfile();
    const delivery = await parseOkResponse(rpcClient.getDelivery(profile, deliveryId));

    await writeSuccess(delivery.delivery);
  });

deliveryCommand
  .command("ack")
  .description("Acknowledge a delivery")
  .argument("<deliveryId>", "delivery id")
  .action(async (deliveryId: string) => {
    const profile = await resolveSelectedProfile();
    const response = await parseOkResponse(rpcClient.acknowledgeDelivery(profile, deliveryId));

    await writeSuccess(response);
  });

deliveryCommand
  .command("viewed")
  .description("Mark a delivery as viewed")
  .argument("<deliveryId>", "delivery id")
  .action(async (deliveryId: string) => {
    const profile = await resolveSelectedProfile();
    const response = await parseOkResponse(rpcClient.markDeliveryViewed(profile, deliveryId));

    await writeSuccess(response);
  });

deliveryCommand
  .command("open")
  .description("Open a delivery and mark it viewed")
  .argument("<deliveryId>", "delivery id")
  .action(async (deliveryId: string) => {
    const profile = await resolveSelectedProfile();
    const response = await openDelivery(profile, deliveryId);

    await writeSuccess(response);
  });

deliveryCommand
  .command("download")
  .description("Download files from a delivery")
  .argument("<deliveryId>", "delivery id")
  .option("--out <path>", "output file or directory")
  .action(async (deliveryId: string, options) => {
    const profile = await resolveSelectedProfile();
    const download = await parseOkResponse(rpcClient.downloadDelivery(profile, deliveryId));
    const outputPaths = await writeDownloadedDelivery(download, options.out);

    await writeSuccess({
      itemId: download.item.itemId,
      outputPaths,
    } satisfies DownloadDeliveryCommandResponse);
  });

itemCommand
  .command("list")
  .description("List sent items")
  .option("--limit <count>", "maximum number of items to return", parsePositiveInteger)
  .action(async (options) => {
    const profile = await resolveSelectedProfile();
    const items = await parseOkResponse(
      rpcClient.listItems(profile, { limit: options.limit ?? 50 }),
    );

    await writeSuccess(items);
  });

itemCommand
  .command("show")
  .description("Show a sent item")
  .argument("<itemId>", "item id")
  .action(async (itemId: string) => {
    const profile = await resolveSelectedProfile();
    const item = await parseOkResponse(rpcClient.getItem(profile, itemId));

    await writeSuccess(item);
  });

try {
  await program.parseAsync(process.argv);
} catch (error) {
  writeError(error);
}

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

async function resolveSelectedProfile(): Promise<LocalDeviceProfile> {
  const requestedProfile = program.opts().device;

  return await profileStore.resolveProfile(requestedProfile);
}

async function loadActiveProfileId(): Promise<string | null> {
  const activeProfile = await profileStore.getActiveProfile();

  return activeProfile?.profileId ?? null;
}

async function receivePendingDeliveries(
  profile: LocalDeviceProfile,
): Promise<ReceivedDeliveryResult[]> {
  const pending = await parseOkResponse(rpcClient.fetchPendingDeliveries(profile));
  const results: ReceivedDeliveryResult[] = [];

  for (const delivery of pending.deliveries) {
    const wasDuplicate = await profileStore.hasHandledDelivery(
      profile.profileId,
      delivery.deliveryId,
    );
    const simulation = simulatePlatformDelivery(profile.platform, delivery);

    if (!wasDuplicate) {
      await profileStore.recordHandledDelivery(profile.profileId, delivery.deliveryId);
    }

    let currentDelivery = await transitionDeliveryToDelivered(profile, delivery.deliveryId);

    if (simulation.shouldMarkViewed && !wasDuplicate) {
      const viewed = await parseOkResponse(
        rpcClient.markDeliveryViewed(profile, delivery.deliveryId),
      );
      currentDelivery = viewed.delivery;
    }

    results.push({
      delivery: currentDelivery,
      wasDuplicate,
      simulation,
    });
  }

  return results;
}

async function openDelivery(
  profile: LocalDeviceProfile,
  deliveryId: string,
): Promise<OpenDeliveryResponse> {
  let delivery = (await parseOkResponse(rpcClient.getDelivery(profile, deliveryId))).delivery;

  if (delivery.state === "pending") {
    delivery = await transitionDeliveryToDelivered(profile, deliveryId);
  }

  if (delivery.state !== "viewed") {
    delivery = (await parseOkResponse(rpcClient.markDeliveryViewed(profile, deliveryId))).delivery;
  }

  await profileStore.recordHandledDelivery(profile.profileId, deliveryId);

  return {
    delivery,
    action: describeOpenAction(delivery),
  };
}

function describeOpenAction(delivery: DeliveryResource): string {
  switch (delivery.item.type) {
    case "text":
      return `Opened text delivery ${delivery.deliveryId}`;
    case "url":
      return `Opened URL delivery ${delivery.deliveryId}`;
    case "file":
      return `Opened file delivery ${delivery.deliveryId}`;
    default:
      return assertUnreachable(delivery.item.type);
  }
}

async function transitionDeliveryToDelivered(
  profile: LocalDeviceProfile,
  deliveryId: string,
): Promise<DeliveryResource> {
  const acknowledged = await parseOkResponse(rpcClient.acknowledgeDelivery(profile, deliveryId));

  return acknowledged.delivery;
}

async function writeDownloadedDelivery(
  download: DownloadDeliveryResponse,
  outPath?: string,
): Promise<string[]> {
  const outputPaths: string[] = [];
  const isSingleFile = download.files.length === 1;
  const baseOutputPath =
    outPath ?? (isSingleFile ? process.cwd() : path.join(process.cwd(), download.item.itemId));

  if (isSingleFile) {
    const file = download.files[0];

    if (file === undefined) {
      throw new Error("Expected a single file in the delivery download response.");
    }

    const filePath =
      outPath !== undefined && path.extname(outPath) !== ""
        ? outPath
        : path.join(baseOutputPath, file.fileName);

    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(filePath, Buffer.from(file.base64Content, "base64"));
    outputPaths.push(filePath);

    return outputPaths;
  }

  await fs.promises.mkdir(baseOutputPath, { recursive: true });
  for (const file of download.files) {
    const filePath = path.join(baseOutputPath, file.fileName);
    await fs.promises.writeFile(filePath, Buffer.from(file.base64Content, "base64"));
    outputPaths.push(filePath);
  }

  return outputPaths;
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

function serializeProfile(
  profile: LocalDeviceProfile,
  activeProfileId: string | null,
): SerializedProfile {
  return {
    profileId: profile.profileId,
    nickname: profile.nickname,
    platform: profile.platform,
    deviceId: profile.deviceId,
    serverBaseUrl: profile.serverBaseUrl,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
    lastUsedTargetDeviceIds: profile.lastUsedTargetDeviceIds,
    isActive: activeProfileId === profile.profileId,
    handledDeliveryCount: profile.handledDeliveryIds.length,
  };
}

async function writeSuccess(payload: unknown): Promise<void> {
  if (program.opts().json) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);

    return;
  }

  if (typeof payload === "string") {
    process.stdout.write(`${payload}\n`);

    return;
  }

  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

function writeError(error: unknown): void {
  const message = formatErrorMessage(error);

  if (program.opts().json) {
    process.stderr.write(`${JSON.stringify({ error: message })}\n`);
  } else {
    process.stderr.write(`${message}\n`);
  }

  process.exitCode = 1;
}

function parsePositiveInteger(value: string): number {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new InvalidOptionArgumentError(`Expected a positive integer but received: ${value}`);
  }

  return parsed;
}

function formatErrorMessage(error: unknown): string {
  if (isDetailedError(error)) {
    const detailData =
      typeof error.detail === "object" && error.detail !== null && "data" in error.detail
        ? error.detail?.data
        : undefined;

    if (typeof detailData === "string") {
      return detailData;
    }

    if (
      detailData !== null &&
      typeof detailData === "object" &&
      "error" in detailData &&
      typeof detailData.error === "string"
    ) {
      return detailData.error;
    }

    return `Request failed with status ${error.statusCode}.`;
  }

  if (error instanceof InvalidOptionArgumentError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return `Unexpected error: ${String(error)}`;
}

function isDetailedError(error: unknown): error is {
  statusCode: number;
  detail?: unknown;
} {
  return (
    error !== null &&
    typeof error === "object" &&
    "statusCode" in error &&
    typeof error.statusCode === "number"
  );
}

function assertUnreachable(value: never): never {
  throw new Error(`Unexpected value: ${JSON.stringify(value)}`);
}
