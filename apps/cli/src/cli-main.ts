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
    .requiredOption("--device-id <device-id>", "device id")
    .argument("<nickname>", "new device nickname")
    .action(async (nickname: string, options) => {
      const { relayHubBaseUrl } = program.opts();
      const response = await parseOkResponse(
        new RpcClient(relayHubBaseUrl)
          .createDeviceRpcClient(options.deviceId)
          .renameDevice({ nickname }),
      );

      await writeSuccess(response, Boolean(program.opts().json));
    });

  deviceCommand
    .command("delete")
    .description("Delete a device")
    .requiredOption("--device-id <device-id>", "device id")
    .requiredOption("--yes", "confirm device deletion")
    .action(async (options) => {
      const { relayHubBaseUrl } = program.opts();
      await parseOkResponse(
        new RpcClient(relayHubBaseUrl).createDeviceRpcClient(options.deviceId).deleteDevice(),
      );

      await writeSuccess(
        {
          deleted: true,
          deviceId: options.deviceId,
        } as const,
        Boolean(program.opts().json),
      );
    });

  devicePushTokenCommand
    .command("set")
    .description("Set the push token for a device")
    .requiredOption("--device-id <device-id>", "device id")
    .argument("<token>", "push token")
    .action(async (token: string, options) => {
      const { relayHubBaseUrl } = program.opts();
      await parseOkResponse(
        new RpcClient(relayHubBaseUrl)
          .createDeviceRpcClient(options.deviceId)
          .setPushToken({ token }),
      );

      await writeSuccess(
        {
          deviceId: options.deviceId,
          pushTokenUpdated: true,
        } as const,
        Boolean(program.opts().json),
      );
    });

  sendCommand
    .command("text")
    .description("Send a text item")
    .argument("<text>", "text to send")
    .requiredOption("--source-device-id <device-id>", "source device id")
    .requiredOption("--target-device-id <device...>", "target device ids")
    .option("--title <title>", "optional title")
    .action(async (text: string, options) => {
      const { relayHubBaseUrl } = program.opts();
      const response = await parseOkResponse(
        new RpcClient(relayHubBaseUrl).createDeviceRpcClient(options.sourceDeviceId).sendText({
          text,
          targetDeviceIds: uniqueValues(options.targetDeviceId),
          ...(options.title !== undefined ? { title: options.title } : {}),
        }),
      );

      await writeSuccess(response, Boolean(program.opts().json));
    });

  sendCommand
    .command("url")
    .description("Send a URL item")
    .argument("<url>", "URL to send")
    .requiredOption("--source-device-id <device-id>", "source device id")
    .requiredOption("--target-device-id <device...>", "target device ids")
    .option("--title <title>", "optional title")
    .action(async (url: string, options) => {
      const { relayHubBaseUrl } = program.opts();
      const response = await parseOkResponse(
        new RpcClient(relayHubBaseUrl).createDeviceRpcClient(options.sourceDeviceId).sendUrl({
          url,
          targetDeviceIds: uniqueValues(options.targetDeviceId),
          ...(options.title !== undefined ? { title: options.title } : {}),
        }),
      );

      await writeSuccess(response, Boolean(program.opts().json));
    });

  sendCommand
    .command("file")
    .description("Send one or more files")
    .argument("<filePaths...>", "paths of files to upload")
    .requiredOption("--source-device-id <device-id>", "source device id")
    .requiredOption("--target-device-id <device...>", "target device ids")
    .option("--title <title>", "optional title")
    .action(async (filePaths: string[], options) => {
      const { relayHubBaseUrl } = program.opts();
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
        new RpcClient(relayHubBaseUrl).createDeviceRpcClient(options.sourceDeviceId).sendFiles({
          files,
          targetDeviceIds: uniqueValues(options.targetDeviceId),
          ...(options.title !== undefined ? { title: options.title } : {}),
        }),
      );

      await writeSuccess(response, Boolean(program.opts().json));
    });

  receiveCommand
    .command("once")
    .description("Fetch pending deliveries once")
    .requiredOption("--target-device-id <device-id>", "target device id")
    .action(async (options) => {
      const { relayHubBaseUrl } = program.opts();
      const devices = await parseOkResponse(new RpcClient(relayHubBaseUrl).listDevices());
      const targetDevice = devices.find((device) => device.deviceId === options.targetDeviceId);

      if (targetDevice === undefined) {
        throw new Error(
          `Target device does not exist or is not visible: ${options.targetDeviceId}`,
        );
      }

      const receivedDeliveries = await receivePendingDeliveries({
        relayHubBaseUrl,
        deviceId: options.targetDeviceId,
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
    .requiredOption("--target-device-id <device-id>", "target device id")
    .action(async (options) => {
      const { relayHubBaseUrl } = program.opts();
      const deliveries = await parseOkResponse(
        new RpcClient(relayHubBaseUrl)
          .createDeviceRpcClient(options.targetDeviceId)
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
    .requiredOption("--target-device-id <device-id>", "target device id")
    .argument("<deliveryId>", "delivery id")
    .action(async (deliveryId: string, options) => {
      const { relayHubBaseUrl } = program.opts();
      const delivery = await parseOkResponse(
        new RpcClient(relayHubBaseUrl)
          .createDeviceRpcClient(options.targetDeviceId)
          .getDelivery({ deliveryId: deliveryId }),
      );

      await writeSuccess(delivery.delivery, Boolean(program.opts().json));
    });

  deliveryCommand
    .command("ack")
    .description("Acknowledge a delivery")
    .requiredOption("--target-device-id <device-id>", "target device id")
    .argument("<deliveryId>", "delivery id")
    .action(async (deliveryId: string, options) => {
      const { relayHubBaseUrl } = program.opts();
      const response = await parseOkResponse(
        new RpcClient(relayHubBaseUrl)
          .createDeviceRpcClient(options.targetDeviceId)
          .acknowledgeDelivery({ deliveryId: deliveryId }),
      );

      await writeSuccess(response, Boolean(program.opts().json));
    });

  deliveryCommand
    .command("viewed")
    .description("Mark a delivery as viewed")
    .requiredOption("--target-device-id <device-id>", "target device id")
    .argument("<deliveryId>", "delivery id")
    .action(async (deliveryId: string, options) => {
      const { relayHubBaseUrl } = program.opts();
      const response = await parseOkResponse(
        new RpcClient(relayHubBaseUrl)
          .createDeviceRpcClient(options.targetDeviceId)
          .markDeliveryViewed({ deliveryId: deliveryId }),
      );

      await writeSuccess(response, Boolean(program.opts().json));
    });

  deliveryCommand
    .command("open")
    .description("Open a delivery and mark it viewed")
    .requiredOption("--target-device-id <device-id>", "target device id")
    .argument("<deliveryId>", "delivery id")
    .action(async (deliveryId: string, options) => {
      const { relayHubBaseUrl } = program.opts();
      const response = await openDelivery(
        { relayHubBaseUrl, deviceId: options.targetDeviceId },
        deliveryId,
      );

      await writeSuccess(response, Boolean(program.opts().json));
    });

  deliveryCommand
    .command("download")
    .description("Download files from a delivery")
    .requiredOption("--target-device-id <device-id>", "target device id")
    .argument("<deliveryId>", "delivery id")
    .option("--out <path>", "output file or directory")
    .action(async (deliveryId: string, options) => {
      const { relayHubBaseUrl } = program.opts();
      const download = await parseOkResponse(
        new RpcClient(relayHubBaseUrl)
          .createDeviceRpcClient(options.targetDeviceId)
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
    .requiredOption("--source-device-id <device-id>", "source device id")
    .action(async (options) => {
      const { relayHubBaseUrl } = program.opts();
      const items = await parseOkResponse(
        new RpcClient(relayHubBaseUrl)
          .createDeviceRpcClient(options.sourceDeviceId)
          .listItems({ limit: options.limit ?? 50 }),
      );

      await writeSuccess(items, Boolean(program.opts().json));
    });

  itemCommand
    .command("show")
    .description("Show a sent item")
    .requiredOption("--source-device-id <device-id>", "source device id")
    .argument("<itemId>", "item id")
    .action(async (itemId: string, options) => {
      const { relayHubBaseUrl } = program.opts();
      const item = await parseOkResponse(
        new RpcClient(relayHubBaseUrl)
          .createDeviceRpcClient(options.sourceDeviceId)
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
