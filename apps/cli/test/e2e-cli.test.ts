import assert from "node:assert";
import child_process from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { expect, test } from "vitest";
import { z } from "zod";

import {
  createItemResponseSchema,
  deliveryActionResponseSchema,
  deliveryListResponseSchema,
  deliveryResourceSchema,
  deviceListResponseSchema,
  itemListEntrySchema,
  itemListResponseSchema,
  registerDeviceResponseSchema,
  relayItemTypeSchema,
  type DevicePlatform,
  type RegisterDeviceResponse,
} from "@content-relay/contracts";
import { withRelayHubTestEnvironment } from "@content-relay/relay-hub-test-utils";

const cliPackageDirectory = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..");
const workspaceRootDirectory = path.resolve(cliPackageDirectory, "../..");
const cliEntrypointPath = path.join(cliPackageDirectory, "src", "cli.ts");

type CliInvocationResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

const pushTokenResultSchema = z.object({
  deviceId: z.string(),
  pushTokenUpdated: z.literal(true),
});

const deleteResultSchema = z.object({
  deviceId: z.string(),
  deleted: z.literal(true),
});

const simulatedDeliveryActionSchema = z.enum([
  "printed",
  "notification-created",
  "auto-opened-browser",
  "auto-opened-text-window",
  "file-detail-available",
]);

const simulatedDeliveryResultSchema = z.object({
  delivery: deliveryResourceSchema,
  itemType: relayItemTypeSchema,
  action: simulatedDeliveryActionSchema,
  shouldMarkViewed: z.boolean(),
  summary: z.string(),
});

const cliReceivedDeliveryResultSchema = z.object({
  delivery: deliveryResourceSchema,
  wasDuplicate: z.literal(false),
  simulation: simulatedDeliveryResultSchema.nullable(),
});

const cliReceivedDeliveryResultsSchema = z.array(cliReceivedDeliveryResultSchema);

const cliOpenedDeliveryResponseSchema = deliveryActionResponseSchema.extend({
  action: z.string(),
});

const cliDownloadDeliveryResponseSchema = z.object({
  itemId: z.string(),
  outputPaths: z.array(z.string()),
});

test("device register returns a device registration", async () => {
  await withRelayHubTestEnvironment(async ({ relayHubBaseUrl }) => {
    const registerResult = await runCli([
      "--json",
      "--relay-hub-base-url",
      relayHubBaseUrl,
      "device",
      "register",
      "--name",
      "Developer CLI",
      "--platform",
      "cli",
    ]);
    expect(registerResult.exitCode).toBe(0);
    const registration = parseJsonStdout(registerResult, registerDeviceResponseSchema);
    expect(registration.nickname).toBe("Developer CLI");
    expect(registration.deviceId).toMatch(/^dev_/);
  });
});

test("device management commands cover list, rename, push-token, and delete", async () => {
  await withRelayHubTestEnvironment(async ({ relayHubBaseUrl }) => {
    const primaryDevice = await registerCliDevice({
      nickname: "Developer CLI",
      platform: "cli",
      relayHubBaseUrl,
    });
    const iosDevice = await registerCliDevice({
      nickname: "Developer iPhone Sim",
      platform: "ios",
      relayHubBaseUrl,
    });

    const listResult = await runCli(
      withActiveDevice(relayHubBaseUrl, primaryDevice.deviceId, ["--json", "device", "list"]),
    );
    expect(listResult.exitCode).toBe(0);
    const devices = parseJsonStdout(listResult, deviceListResponseSchema);
    expect(devices).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ nickname: "Developer CLI" }),
        expect.objectContaining({ nickname: "Developer iPhone Sim" }),
      ]),
    );

    const renameResult = await runCli(
      withActiveDevice(relayHubBaseUrl, primaryDevice.deviceId, [
        "--json",
        "device",
        "rename",
        "Renamed CLI",
      ]),
    );
    expect(renameResult.exitCode).toBe(0);
    const renamedDevice = parseJsonStdout(renameResult, deviceListResponseSchema.element);
    expect(renamedDevice.nickname).toBe("Renamed CLI");

    const pushTokenResult = await runCli(
      withActiveDevice(relayHubBaseUrl, iosDevice.deviceId, [
        "--json",
        "device",
        "push-token",
        "set",
        "push-token-123",
      ]),
    );
    expect(pushTokenResult.exitCode).toBe(0);
    expect(parseJsonStdout(pushTokenResult, pushTokenResultSchema)).toMatchObject({
      deviceId: iosDevice.deviceId,
      pushTokenUpdated: true,
    });

    const deleteResult = await runCli(
      withActiveDevice(relayHubBaseUrl, iosDevice.deviceId, [
        "--json",
        "device",
        "delete",
        "--yes",
      ]),
    );
    expect(deleteResult.exitCode).toBe(0);
    expect(parseJsonStdout(deleteResult, deleteResultSchema)).toMatchObject({
      deleted: true,
      deviceId: iosDevice.deviceId,
    });
  });
});

test("send text, receive once, and delivery open", async () => {
  await withRelayHubTestEnvironment(async ({ relayHubBaseUrl }) => {
    const senderDevice = await registerCliDevice({
      nickname: "Developer CLI",
      platform: "cli",
      relayHubBaseUrl,
    });
    const receiverDevice = await registerCliDevice({
      nickname: "Developer Mac",
      platform: "macos",
      relayHubBaseUrl,
    });

    const sendResult = await runCli(
      withActiveDevice(relayHubBaseUrl, senderDevice.deviceId, [
        "--json",
        "send",
        "text",
        "hello mac",
        "--to",
        receiverDevice.deviceId,
        "--title",
        "Greeting",
      ]),
    );
    expect(sendResult.exitCode).toBe(0);
    const sentItem = parseJsonStdout(sendResult, createItemResponseSchema);
    expect(sentItem.item.type).toBe("text");

    const receiveResult = await runCli(
      withActiveDevice(relayHubBaseUrl, receiverDevice.deviceId, ["--json", "receive", "once"]),
    );
    expect(receiveResult.exitCode).toBe(0);
    const receivedDeliveries = parseJsonStdout(receiveResult, cliReceivedDeliveryResultsSchema);
    expect(receivedDeliveries).toHaveLength(1);
    const receivedDelivery = receivedDeliveries[0];
    expect(receivedDelivery).toBeDefined();
    assert(receivedDelivery !== undefined);
    expect(receivedDelivery.delivery.state).toBe("viewed");
    expect(receivedDelivery.simulation?.action).toBe("auto-opened-text-window");

    const openResult = await runCli(
      withActiveDevice(relayHubBaseUrl, receiverDevice.deviceId, [
        "--json",
        "delivery",
        "open",
        receivedDelivery.delivery.deliveryId,
      ]),
    );
    expect(openResult.exitCode).toBe(0);
    const openedDelivery = parseJsonStdout(openResult, cliOpenedDeliveryResponseSchema);
    expect(openedDelivery.delivery.state).toBe("viewed");
  });
});

test("send url and item list expose sent URL items", async () => {
  await withRelayHubTestEnvironment(async ({ relayHubBaseUrl }) => {
    const senderDevice = await registerCliDevice({
      nickname: "Developer CLI",
      platform: "cli",
      relayHubBaseUrl,
    });
    const receiverDevice = await registerCliDevice({
      nickname: "Developer Browser",
      platform: "generic",
      relayHubBaseUrl,
    });

    const sendResult = await runCli(
      withActiveDevice(relayHubBaseUrl, senderDevice.deviceId, [
        "--json",
        "send",
        "url",
        "https://example.com/docs",
        "--to",
        receiverDevice.deviceId,
        "--title",
        "Docs",
      ]),
    );
    expect(sendResult.exitCode).toBe(0);
    const sentItem = parseJsonStdout(sendResult, createItemResponseSchema);
    expect(sentItem.item.type).toBe("url");

    const itemListResult = await runCli(
      withActiveDevice(relayHubBaseUrl, senderDevice.deviceId, ["--json", "item", "list"]),
    );
    expect(itemListResult.exitCode).toBe(0);
    const items = parseJsonStdout(itemListResult, itemListResponseSchema);
    expect(items.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          item: expect.objectContaining({ itemId: sentItem.item.itemId }),
        }),
      ]),
    );

    const itemShowResult = await runCli(
      withActiveDevice(relayHubBaseUrl, senderDevice.deviceId, [
        "--json",
        "item",
        "show",
        sentItem.item.itemId,
      ]),
    );
    expect(itemShowResult.exitCode).toBe(0);
    expect(parseJsonStdout(itemShowResult, itemListEntrySchema)).toMatchObject({
      item: {
        itemId: sentItem.item.itemId,
        type: "url",
      },
    });
  });
});

test("delivery list, show, ack, and viewed manage delivery state transitions", async () => {
  await withRelayHubTestEnvironment(async ({ relayHubBaseUrl }) => {
    const senderDevice = await registerCliDevice({
      nickname: "Developer CLI",
      platform: "cli",
      relayHubBaseUrl,
    });
    const receiverDevice = await registerCliDevice({
      nickname: "Developer Generic",
      platform: "generic",
      relayHubBaseUrl,
    });

    const sendResult = await runCli(
      withActiveDevice(relayHubBaseUrl, senderDevice.deviceId, [
        "--json",
        "send",
        "text",
        "manual transitions",
        "--to",
        receiverDevice.deviceId,
      ]),
    );
    expect(sendResult.exitCode).toBe(0);
    const sentItem = parseJsonStdout(sendResult, createItemResponseSchema);
    const delivery = sentItem.deliveries[0];
    expect(delivery).toBeDefined();
    assert(delivery !== undefined);

    const listResult = await runCli(
      withActiveDevice(relayHubBaseUrl, receiverDevice.deviceId, [
        "--json",
        "delivery",
        "list",
        "--state",
        "pending",
      ]),
    );
    expect(listResult.exitCode).toBe(0);
    expect(parseJsonStdout(listResult, deliveryListResponseSchema).deliveries).toEqual(
      expect.arrayContaining([expect.objectContaining({ deliveryId: delivery.deliveryId })]),
    );

    const showResult = await runCli(
      withActiveDevice(relayHubBaseUrl, receiverDevice.deviceId, [
        "--json",
        "delivery",
        "show",
        delivery.deliveryId,
      ]),
    );
    expect(showResult.exitCode).toBe(0);
    expect(parseJsonStdout(showResult, deliveryResourceSchema)).toMatchObject({
      deliveryId: delivery.deliveryId,
      state: "pending",
    });

    const ackResult = await runCli(
      withActiveDevice(relayHubBaseUrl, receiverDevice.deviceId, [
        "--json",
        "delivery",
        "ack",
        delivery.deliveryId,
      ]),
    );
    expect(ackResult.exitCode).toBe(0);
    expect(parseJsonStdout(ackResult, deliveryActionResponseSchema).delivery.state).toBe(
      "delivered",
    );

    const viewedResult = await runCli(
      withActiveDevice(relayHubBaseUrl, receiverDevice.deviceId, [
        "--json",
        "delivery",
        "viewed",
        delivery.deliveryId,
      ]),
    );
    expect(viewedResult.exitCode).toBe(0);
    expect(parseJsonStdout(viewedResult, deliveryActionResponseSchema).delivery.state).toBe(
      "viewed",
    );
  });
});

test("send file and delivery download write the files", async () => {
  await withRelayHubTestEnvironment(async ({ rootDirectory, relayHubBaseUrl }) => {
    const senderDevice = await registerCliDevice({
      nickname: "Developer CLI",
      platform: "cli",
      relayHubBaseUrl,
    });
    const receiverDevice = await registerCliDevice({
      nickname: "Developer Pixel Sim",
      platform: "android",
      relayHubBaseUrl,
    });
    const alphaFilePath = path.join(rootDirectory, "alpha.txt");
    const betaFilePath = path.join(rootDirectory, "beta.txt");
    await fs.promises.writeFile(alphaFilePath, "alpha\n");
    await fs.promises.writeFile(betaFilePath, "beta\n");

    const sendResult = await runCli(
      withActiveDevice(relayHubBaseUrl, senderDevice.deviceId, [
        "--json",
        "send",
        "file",
        alphaFilePath,
        betaFilePath,
        "--to",
        receiverDevice.deviceId,
        "--title",
        "Trip docs",
      ]),
    );
    expect(sendResult.exitCode).toBe(0);
    const fileItem = parseJsonStdout(sendResult, createItemResponseSchema);
    expect(fileItem.item.type).toBe("file");
    expect(fileItem.deliveries).toHaveLength(1);
    const delivery = fileItem.deliveries[0];
    expect(delivery).toBeDefined();
    assert(delivery !== undefined);

    const downloadDirectory = path.join(rootDirectory, "downloads");
    const downloadResult = await runCli(
      withActiveDevice(relayHubBaseUrl, receiverDevice.deviceId, [
        "--json",
        "delivery",
        "download",
        delivery.deliveryId,
        "--out",
        downloadDirectory,
      ]),
    );
    expect(downloadResult.exitCode).toBe(0);
    const download = parseJsonStdout(downloadResult, cliDownloadDeliveryResponseSchema);
    expect(download.itemId).toBe(fileItem.item.itemId);
    expect(download.outputPaths).toHaveLength(2);

    const downloadedAlphaPath = download.outputPaths.find((outputPath) =>
      outputPath.endsWith("alpha.txt"),
    );
    const downloadedBetaPath = download.outputPaths.find((outputPath) =>
      outputPath.endsWith("beta.txt"),
    );
    expect(downloadedAlphaPath).toBeDefined();
    expect(downloadedBetaPath).toBeDefined();
    assert(downloadedAlphaPath !== undefined);
    assert(downloadedBetaPath !== undefined);
    await expect(fs.promises.readFile(downloadedAlphaPath, "utf8")).resolves.toBe("alpha\n");
    await expect(fs.promises.readFile(downloadedBetaPath, "utf8")).resolves.toBe("beta\n");
  });
});

async function registerCliDevice(input: {
  nickname: string;
  platform: DevicePlatform;
  relayHubBaseUrl: string;
}): Promise<RegisterDeviceResponse> {
  const registerResult = await runCli([
    "--json",
    "--relay-hub-base-url",
    input.relayHubBaseUrl,
    "device",
    "register",
    "--name",
    input.nickname,
    "--platform",
    input.platform,
  ]);
  expect(registerResult.exitCode).toBe(0);

  return parseJsonStdout(registerResult, registerDeviceResponseSchema);
}

function withActiveDevice(
  relayHubBaseUrl: string,
  activeDeviceId: string,
  args: string[],
): string[] {
  return ["--relay-hub-base-url", relayHubBaseUrl, "--active-device-id", activeDeviceId, ...args];
}

function parseJsonStdout<T>(result: CliInvocationResult, schema: z.ZodType<T>): T {
  if (result.stdout.trim().length === 0) {
    throw new Error(`Expected JSON on stdout but the CLI produced none. stderr: ${result.stderr}`);
  }

  const parsed = JSON.parse(result.stdout) as unknown;

  return schema.parse(parsed);
}

async function runCli(args: string[]): Promise<CliInvocationResult> {
  return await new Promise<CliInvocationResult>((resolve, reject) => {
    const child = child_process.spawn("node", [cliEntrypointPath, ...args], {
      cwd: workspaceRootDirectory,
      env: {
        ...process.env,
        NO_COLOR: "1",
        OTEL_SDK_DISABLED: "true",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (exitCode) => {
      resolve({
        exitCode: exitCode ?? 1,
        stdout,
        stderr,
      });
    });
  });
}
