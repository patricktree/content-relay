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
  type DeviceListResponse,
  type DevicePlatform,
  type PushRegistration,
} from "@content-relay/contracts";
import * as numberUtils from "@content-relay/utils-ecma/number.utils";

import { openDelivery } from "#pkg/use-cases/open-delivery.ts";
import { receivePendingDeliveries } from "#pkg/use-cases/receive-pending-deliveries.ts";
import { writeDownloadedDelivery } from "#pkg/use-cases/write-downloaded-delivery.ts";

{
  const program = new Command()
    .name("relay")
    .description("CLI for content-relay")
    .showHelpAfterError()
    .addOption(new Option("--json", "emit JSON responses"))
    .addOption(
      new Option("--relay-hub-base-url <url>", "Relay Hub base URL")
        .env("RELAY_HUB_BASE_URL")
        .makeOptionMandatory()
        .argParser((value) => assertValidAbsoluteUrl(value)),
    );

  const deviceCommand = program.command("device").description("Manage devices");
  const devicePushTokenCommand = deviceCommand
    .command("push-token")
    .description("Manage device push tokens");
  const sendCommand = program.command("send").description("Send content");
  const receiveCommand = program.command("receive").description("Receive deliveries");
  const deliveryCommand = program.command("delivery").description("Inspect and manage deliveries");
  const itemCommand = program.command("item").description("Inspect sent items");

  deviceCommand
    .command("register")
    .description("Register a device")
    .requiredOption("--name <nickname>", "device nickname")
    .addOption(
      new Option("--platform <platform>", "device platform")
        .choices([...devicePlatforms])
        .makeOptionMandatory(true),
    )
    .option("--push-token <token>", "push token override for simulated mobile registration")
    .action(async (options) => {
      const { relayHubBaseUrl } = program.opts();
      const pushRegistration = buildCliPushRegistration({
        nickname: options.name,
        platform: options.platform,
        pushTokenOverride: options.pushToken,
      });
      const registration = await parseOkResponse(
        new RpcClient(relayHubBaseUrl).registerDevice({
          nickname: options.name,
          platform: options.platform,
          ...(pushRegistration === undefined ? {} : { pushRegistration }),
        }),
      );

      await writeSuccess(registration, Boolean(program.opts().json));
    });

  deviceCommand
    .command("list")
    .description("List registered devices from the Relay Hub")
    .action(async () => {
      const { relayHubBaseUrl } = program.opts();
      const devices = await parseOkResponse(new RpcClient(relayHubBaseUrl).listDevices());

      await writeSuccess(devices, Boolean(program.opts().json));
    });

  deviceCommand
    .command("rename")
    .description("Rename a device")
    .option("--device-id <device-id>", "device id")
    .option("--device-nickname <nickname>", "device nickname")
    .argument("<nickname>", "new device nickname")
    .action(async (nickname: string, options) => {
      const { relayHubBaseUrl } = program.opts();
      const rpcClient = new RpcClient(relayHubBaseUrl);
      const deviceId = await resolveDeviceId(rpcClient, options, "Device");
      const response = await parseOkResponse(
        rpcClient.createDeviceRpcClient(deviceId).renameDevice({ nickname }),
      );

      await writeSuccess(response, Boolean(program.opts().json));
    });

  deviceCommand
    .command("delete")
    .description("Delete a device")
    .option("--device-id <device-id>", "device id")
    .option("--device-nickname <nickname>", "device nickname")
    .requiredOption("--yes", "confirm device deletion")
    .action(async (options) => {
      const { relayHubBaseUrl } = program.opts();
      const rpcClient = new RpcClient(relayHubBaseUrl);
      const deviceId = await resolveDeviceId(rpcClient, options, "Device");
      await parseOkResponse(rpcClient.createDeviceRpcClient(deviceId).deleteDevice());

      await writeSuccess(
        {
          deleted: true,
          deviceId,
        } as const,
        Boolean(program.opts().json),
      );
    });

  devicePushTokenCommand
    .command("set")
    .description("Set the push token for a device")
    .option("--device-id <device-id>", "device id")
    .option("--device-nickname <nickname>", "device nickname")
    .argument("<token>", "push token")
    .action(async (token: string, options) => {
      const { relayHubBaseUrl } = program.opts();
      const rpcClient = new RpcClient(relayHubBaseUrl);
      const deviceId = await resolveDeviceId(rpcClient, options, "Device");
      await parseOkResponse(rpcClient.createDeviceRpcClient(deviceId).setPushToken({ token }));

      await writeSuccess(
        {
          deviceId,
          pushTokenUpdated: true,
        } as const,
        Boolean(program.opts().json),
      );
    });

  sendCommand
    .command("text")
    .description("Send a text item")
    .argument("<text>", "text to send")
    .option("--source-device-id <device-id>", "source device id")
    .option("--source-device-nickname <nickname>", "source device nickname")
    .option("--target-device-id <device...>", "target device ids")
    .option("--target-device-nickname <nickname...>", "target device nicknames")
    .option("--title <title>", "optional title")
    .action(async (text: string, options) => {
      const { relayHubBaseUrl } = program.opts();
      const rpcClient = new RpcClient(relayHubBaseUrl);
      const sourceDeviceId = await resolveSourceDeviceId(rpcClient, options);
      const targetDeviceIds = await resolveTargetDeviceIds(rpcClient, options);
      const response = await parseOkResponse(
        rpcClient.createDeviceRpcClient(sourceDeviceId).sendText({
          text,
          targetDeviceIds,
          ...(options.title !== undefined ? { title: options.title } : {}),
        }),
      );

      await writeSuccess(response, Boolean(program.opts().json));
    });

  sendCommand
    .command("url")
    .description("Send a URL item")
    .argument("<url>", "URL to send")
    .option("--source-device-id <device-id>", "source device id")
    .option("--source-device-nickname <nickname>", "source device nickname")
    .option("--target-device-id <device...>", "target device ids")
    .option("--target-device-nickname <nickname...>", "target device nicknames")
    .option("--title <title>", "optional title")
    .action(async (url: string, options) => {
      const { relayHubBaseUrl } = program.opts();
      const rpcClient = new RpcClient(relayHubBaseUrl);
      const sourceDeviceId = await resolveSourceDeviceId(rpcClient, options);
      const targetDeviceIds = await resolveTargetDeviceIds(rpcClient, options);
      const response = await parseOkResponse(
        rpcClient.createDeviceRpcClient(sourceDeviceId).sendUrl({
          url,
          targetDeviceIds,
          ...(options.title !== undefined ? { title: options.title } : {}),
        }),
      );

      await writeSuccess(response, Boolean(program.opts().json));
    });

  sendCommand
    .command("file")
    .description("Send one or more files")
    .argument("<filePaths...>", "paths of files to upload")
    .option("--source-device-id <device-id>", "source device id")
    .option("--source-device-nickname <nickname>", "source device nickname")
    .option("--target-device-id <device...>", "target device ids")
    .option("--target-device-nickname <nickname...>", "target device nicknames")
    .option("--title <title>", "optional title")
    .action(async (filePaths: string[], options) => {
      const { relayHubBaseUrl } = program.opts();
      const rpcClient = new RpcClient(relayHubBaseUrl);
      const sourceDeviceId = await resolveSourceDeviceId(rpcClient, options);
      const targetDeviceIds = await resolveTargetDeviceIds(rpcClient, options);
      const files = await Promise.all(
        filePaths.map(async (filePath) => {
          const content = await fs.promises.readFile(filePath);

          return {
            content: new Uint8Array(content),
            basename: path.basename(filePath),
          };
        }),
      );
      const response = await parseOkResponse(
        rpcClient.createDeviceRpcClient(sourceDeviceId).sendFiles({
          files,
          targetDeviceIds,
          ...(options.title !== undefined ? { title: options.title } : {}),
        }),
      );

      await writeSuccess(response, Boolean(program.opts().json));
    });

  receiveCommand
    .command("once")
    .description("Fetch pending deliveries once")
    .option("--target-device-id <device-id>", "target device id")
    .option("--target-device-nickname <nickname>", "target device nickname")
    .action(async (options) => {
      const { relayHubBaseUrl } = program.opts();
      const rpcClient = new RpcClient(relayHubBaseUrl);
      const targetDevice = await resolveTargetDevice(rpcClient, options);

      const receivedDeliveries = await receivePendingDeliveries({
        relayHubBaseUrl,
        deviceId: targetDevice.deviceId,
        platform: targetDevice.platform,
      });

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
    .option("--target-device-id <device-id>", "target device id")
    .option("--target-device-nickname <nickname>", "target device nickname")
    .action(async (options) => {
      const { relayHubBaseUrl } = program.opts();
      const rpcClient = new RpcClient(relayHubBaseUrl);
      const targetDeviceId = await resolveTargetDeviceId(rpcClient, options);
      const deliveries = await parseOkResponse(
        rpcClient.createDeviceRpcClient(targetDeviceId).listDeliveries({
          state: options.state,
          limit: options.limit ?? 50,
        }),
      );

      await writeSuccess(deliveries, Boolean(program.opts().json));
    });

  deliveryCommand
    .command("show")
    .description("Show a delivery")
    .option("--target-device-id <device-id>", "target device id")
    .option("--target-device-nickname <nickname>", "target device nickname")
    .argument("<deliveryId>", "delivery id")
    .action(async (deliveryId: string, options) => {
      const { relayHubBaseUrl } = program.opts();
      const rpcClient = new RpcClient(relayHubBaseUrl);
      const targetDeviceId = await resolveTargetDeviceId(rpcClient, options);
      const delivery = await parseOkResponse(
        rpcClient.createDeviceRpcClient(targetDeviceId).getDelivery({ deliveryId: deliveryId }),
      );

      await writeSuccess(delivery.delivery, Boolean(program.opts().json));
    });

  deliveryCommand
    .command("ack")
    .description("Acknowledge a delivery")
    .option("--target-device-id <device-id>", "target device id")
    .option("--target-device-nickname <nickname>", "target device nickname")
    .argument("<deliveryId>", "delivery id")
    .action(async (deliveryId: string, options) => {
      const { relayHubBaseUrl } = program.opts();
      const rpcClient = new RpcClient(relayHubBaseUrl);
      const targetDeviceId = await resolveTargetDeviceId(rpcClient, options);
      const response = await parseOkResponse(
        rpcClient
          .createDeviceRpcClient(targetDeviceId)
          .acknowledgeDelivery({ deliveryId: deliveryId }),
      );

      await writeSuccess(response, Boolean(program.opts().json));
    });

  deliveryCommand
    .command("viewed")
    .description("Mark a delivery as viewed")
    .option("--target-device-id <device-id>", "target device id")
    .option("--target-device-nickname <nickname>", "target device nickname")
    .argument("<deliveryId>", "delivery id")
    .action(async (deliveryId: string, options) => {
      const { relayHubBaseUrl } = program.opts();
      const rpcClient = new RpcClient(relayHubBaseUrl);
      const targetDeviceId = await resolveTargetDeviceId(rpcClient, options);
      const response = await parseOkResponse(
        rpcClient
          .createDeviceRpcClient(targetDeviceId)
          .markDeliveryViewed({ deliveryId: deliveryId }),
      );

      await writeSuccess(response, Boolean(program.opts().json));
    });

  deliveryCommand
    .command("open")
    .description("Open a delivery and mark it viewed")
    .option("--target-device-id <device-id>", "target device id")
    .option("--target-device-nickname <nickname>", "target device nickname")
    .argument("<deliveryId>", "delivery id")
    .action(async (deliveryId: string, options) => {
      const { relayHubBaseUrl } = program.opts();
      const rpcClient = new RpcClient(relayHubBaseUrl);
      const targetDeviceId = await resolveTargetDeviceId(rpcClient, options);
      const response = await openDelivery(
        { relayHubBaseUrl, deviceId: targetDeviceId },
        deliveryId,
      );

      await writeSuccess(response, Boolean(program.opts().json));
    });

  deliveryCommand
    .command("download")
    .description("Download files from a delivery")
    .option("--target-device-id <device-id>", "target device id")
    .option("--target-device-nickname <nickname>", "target device nickname")
    .argument("<deliveryId>", "delivery id")
    .option("--out <path>", "output file or directory")
    .action(async (deliveryId: string, options) => {
      const { relayHubBaseUrl } = program.opts();
      const rpcClient = new RpcClient(relayHubBaseUrl);
      const targetDeviceId = await resolveTargetDeviceId(rpcClient, options);
      const download = await parseOkResponse(
        rpcClient
          .createDeviceRpcClient(targetDeviceId)
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
    .option("--source-device-id <device-id>", "source device id")
    .option("--source-device-nickname <nickname>", "source device nickname")
    .action(async (options) => {
      const { relayHubBaseUrl } = program.opts();
      const rpcClient = new RpcClient(relayHubBaseUrl);
      const sourceDeviceId = await resolveSourceDeviceId(rpcClient, options);
      const items = await parseOkResponse(
        rpcClient.createDeviceRpcClient(sourceDeviceId).listItems({ limit: options.limit ?? 50 }),
      );

      await writeSuccess(items, Boolean(program.opts().json));
    });

  itemCommand
    .command("show")
    .description("Show a sent item")
    .option("--source-device-id <device-id>", "source device id")
    .option("--source-device-nickname <nickname>", "source device nickname")
    .argument("<itemId>", "item id")
    .action(async (itemId: string, options) => {
      const { relayHubBaseUrl } = program.opts();
      const rpcClient = new RpcClient(relayHubBaseUrl);
      const sourceDeviceId = await resolveSourceDeviceId(rpcClient, options);
      const item = await parseOkResponse(
        rpcClient.createDeviceRpcClient(sourceDeviceId).getItem({ itemId: itemId }),
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

type DeviceSummary = DeviceListResponse[number];

type DeviceIdentityOptions = {
  deviceId?: string | undefined;
  deviceNickname?: string | undefined;
};

type SourceDeviceIdentityOptions = {
  sourceDeviceId?: string | undefined;
  sourceDeviceNickname?: string | undefined;
};

type TargetDeviceIdentityOptions = {
  targetDeviceId?: string[] | string | undefined;
  targetDeviceNickname?: string[] | string | undefined;
};

async function resolveDeviceId(
  rpcClient: RpcClient,
  options: DeviceIdentityOptions,
  label: string,
): Promise<string> {
  const device = await resolveDevice(rpcClient, {
    id: options.deviceId,
    nickname: options.deviceNickname,
    label,
  });

  return device.deviceId;
}

async function resolveSourceDeviceId(
  rpcClient: RpcClient,
  options: SourceDeviceIdentityOptions,
): Promise<string> {
  const device = await resolveDevice(rpcClient, {
    id: options.sourceDeviceId,
    nickname: options.sourceDeviceNickname,
    label: "Source device",
  });

  return device.deviceId;
}

async function resolveTargetDevice(
  rpcClient: RpcClient,
  options: TargetDeviceIdentityOptions,
): Promise<DeviceSummary> {
  return await resolveDevice(rpcClient, {
    id: singleOptionalValue(options.targetDeviceId, "--target-device-id"),
    nickname: singleOptionalValue(options.targetDeviceNickname, "--target-device-nickname"),
    label: "Target device",
  });
}

async function resolveTargetDeviceId(
  rpcClient: RpcClient,
  options: TargetDeviceIdentityOptions,
): Promise<string> {
  const device = await resolveTargetDevice(rpcClient, options);

  return device.deviceId;
}

async function resolveTargetDeviceIds(
  rpcClient: RpcClient,
  options: TargetDeviceIdentityOptions,
): Promise<string[]> {
  const deviceIds = arrayOptionValues(options.targetDeviceId);
  const deviceNicknames = arrayOptionValues(options.targetDeviceNickname);

  if (deviceIds.length === 0 && deviceNicknames.length === 0) {
    throw new Error(
      "Provide at least one target device with --target-device-id or --target-device-nickname.",
    );
  }

  if (deviceNicknames.length === 0) {
    return uniqueValues(deviceIds);
  }

  const devices = await parseOkResponse(rpcClient.listDevices());
  const targetDeviceIdsFromNicknames = deviceNicknames.map((nickname) => {
    return findDeviceByNickname(devices, nickname, "Target device").deviceId;
  });

  return uniqueValues([...deviceIds, ...targetDeviceIdsFromNicknames]);
}

async function resolveDevice(
  rpcClient: RpcClient,
  input: { id?: string | undefined; nickname?: string | undefined; label: string },
): Promise<DeviceSummary> {
  if (input.id !== undefined && input.nickname !== undefined) {
    throw new Error(`${input.label} must be specified by id or nickname, not both.`);
  }

  if (input.id === undefined && input.nickname === undefined) {
    throw new Error(`${input.label} must be specified by id or nickname.`);
  }

  const devices = await parseOkResponse(rpcClient.listDevices());

  if (input.id !== undefined) {
    const device = devices.find((candidate) => candidate.deviceId === input.id);

    if (device === undefined) {
      throw new Error(`${input.label} does not exist or is not visible: ${input.id}`);
    }

    return device;
  }

  return findDeviceByNickname(devices, input.nickname, input.label);
}

function findDeviceByNickname(
  devices: DeviceListResponse,
  nickname: string | undefined,
  label: string,
): DeviceSummary {
  if (nickname === undefined) {
    throw new Error(`${label} nickname is required.`);
  }

  const device = devices.find((candidate) => candidate.nickname === nickname);

  if (device === undefined) {
    throw new Error(`${label} does not exist or is not visible: ${nickname}`);
  }

  return device;
}

function singleOptionalValue(
  value: string[] | string | undefined,
  optionName: string,
): string | undefined {
  const values = arrayOptionValues(value);

  if (values.length > 1) {
    throw new Error(`${optionName} accepts exactly one value for this command.`);
  }

  return values[0];
}

function arrayOptionValues(value: string[] | string | undefined): string[] {
  if (value === undefined) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function uniqueValues(values: string[]): string[] {
  return [...new Set(values)];
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
