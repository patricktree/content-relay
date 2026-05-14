import assert from "node:assert";
import child_process from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { expect, test } from "vitest";
import { z } from "zod";

import { createHttpClient, parseOkResponse } from "@content-relay/client";
import {
  createInviteResponseSchema,
  createItemResponseSchema,
  deliveryActionResponseSchema,
  deliveryListResponseSchema,
  deliveryResourceSchema,
  deviceListResponseSchema,
  devicePlatformSchema,
  itemListEntrySchema,
  itemListResponseSchema,
  relayItemTypeSchema,
  type DevicePlatform,
} from "@content-relay/contracts";
import { withRelayTestEnvironment } from "@content-relay/relay-hub-test-utils";

const cliPackageDirectory = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..");
const workspaceRootDirectory = path.resolve(cliPackageDirectory, "../..");
const cliEntrypointPath = path.join(cliPackageDirectory, "src", "cli.ts");

type CliInvocationResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

const cliSerializedProfileSchema = z.object({
  profileId: z.string(),
  nickname: z.string(),
  platform: devicePlatformSchema,
  deviceId: z.string(),
  relayHubBaseUrl: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  lastUsedTargetDeviceIds: z.array(z.string()),
  isActive: z.boolean(),
  handledDeliveryCount: z.number(),
});

const pushTokenResultSchema = z.object({
  deviceId: z.string(),
  pushTokenUpdated: z.literal(true),
});

const deleteResultSchema = z.object({
  deviceId: z.string(),
  profileId: z.string(),
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
  wasDuplicate: z.boolean(),
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

test("invite create returns a usable invite", async () => {
  await withRelayTestEnvironment(async ({ rootDirectory, relayHubBaseUrl }) => {
    const configDirectory = path.join(rootDirectory, "cli-config");

    const inviteCreateResult = await runCli(
      ["--json", "--relay-hub-url", relayHubBaseUrl, "invite", "create", "--expires-in", "1800"],
      { configDirectory },
    );
    expect(inviteCreateResult.exitCode).toBe(0);
    const invite = parseJsonStdout(inviteCreateResult, createInviteResponseSchema);
    expect(invite.inviteCode).toMatch(/\S+/);
    expect(invite.inviteUrl).toContain(invite.inviteCode);
    expect(invite.expiresAt).toMatch(/\d{4}-\d{2}-\d{2}T/);

    const registerResult = await runCli(
      [
        "--json",
        "--relay-hub-url",
        relayHubBaseUrl,
        "device",
        "register",
        "--name",
        "Developer CLI",
        "--platform",
        "cli",
        "--invite",
        invite.inviteCode,
      ],
      { configDirectory },
    );
    expect(registerResult.exitCode).toBe(0);
  });
});

test("device management commands cover list, rename, push-token, and delete", async () => {
  await withRelayTestEnvironment(async ({ rootDirectory, relayHubBaseUrl }) => {
    const configDirectory = path.join(rootDirectory, "cli-config");
    const primaryInviteResponse = await createHttpClient({ relayHubBaseUrl }).invites.$post({
      json: { expiresInSeconds: 900 },
    });
    const primaryInvite = await parseOkResponse(primaryInviteResponse);
    const secondaryInviteResponse = await createHttpClient({ relayHubBaseUrl }).invites.$post({
      json: { expiresInSeconds: 900 },
    });
    const secondaryInvite = await parseOkResponse(secondaryInviteResponse);

    await registerCliProfile({
      configDirectory,
      inviteCode: primaryInvite.inviteCode,
      nickname: "Developer CLI",
      platform: "cli",
      relayHubBaseUrl,
    });
    await registerCliProfile({
      configDirectory,
      inviteCode: secondaryInvite.inviteCode,
      nickname: "Developer iPhone Sim",
      platform: "ios",
      relayHubBaseUrl,
    });

    const usePrimaryResult = await runCli(["--json", "device", "use", "Developer CLI"], {
      configDirectory,
    });
    expect(usePrimaryResult.exitCode).toBe(0);

    const listResult = await runCli(["--json", "device", "list"], { configDirectory });
    expect(listResult.exitCode).toBe(0);
    const devices = parseJsonStdout(listResult, deviceListResponseSchema);
    expect(devices).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ nickname: "Developer CLI" }),
        expect.objectContaining({ nickname: "Developer iPhone Sim" }),
      ]),
    );

    const renameResult = await runCli(["--json", "device", "rename", "Renamed CLI"], {
      configDirectory,
    });
    expect(renameResult.exitCode).toBe(0);
    const renamedProfile = parseJsonStdout(renameResult, cliSerializedProfileSchema);
    expect(renamedProfile.nickname).toBe("Renamed CLI");
    expect(renamedProfile.isActive).toBe(true);

    const renamedListResult = await runCli(["--json", "device", "list"], { configDirectory });
    expect(renamedListResult.exitCode).toBe(0);
    const renamedDevices = parseJsonStdout(renamedListResult, deviceListResponseSchema);
    expect(renamedDevices).toEqual(
      expect.arrayContaining([expect.objectContaining({ nickname: "Renamed CLI" })]),
    );

    const pushTokenResult = await runCli(
      ["--json", "device", "push-token", "set", "push-token-123"],
      {
        configDirectory,
      },
    );
    expect(pushTokenResult.exitCode).toBe(0);
    expect(parseJsonStdout(pushTokenResult, pushTokenResultSchema)).toMatchObject({
      deviceId: renamedProfile.deviceId,
      pushTokenUpdated: true,
    });

    const deleteResult = await runCli(
      ["--json", "--device", "Developer iPhone Sim", "device", "delete", "--yes"],
      { configDirectory },
    );
    expect(deleteResult.exitCode).toBe(0);
    expect(parseJsonStdout(deleteResult, deleteResultSchema)).toMatchObject({
      deleted: true,
    });

    const afterDeleteListResult = await runCli(["--json", "device", "list"], { configDirectory });
    expect(afterDeleteListResult.exitCode).toBe(0);
    const remainingDevices = parseJsonStdout(afterDeleteListResult, deviceListResponseSchema);
    expect(remainingDevices).toHaveLength(1);
    expect(remainingDevices[0]?.nickname).toBe("Renamed CLI");

    const useDeletedProfileResult = await runCli(
      ["--json", "device", "use", "Developer iPhone Sim"],
      { configDirectory },
    );
    expect(useDeletedProfileResult.exitCode).toBe(1);
    expect(useDeletedProfileResult.stderr).toContain("Unknown local device profile");
  });
});

test("device register persists a profile that device current can load", async () => {
  await withRelayTestEnvironment(async ({ rootDirectory, relayHubBaseUrl }) => {
    const configDirectory = path.join(rootDirectory, "cli-config");
    const inviteResponse = await createHttpClient({ relayHubBaseUrl }).invites.$post({
      json: { expiresInSeconds: 900 },
    });
    const invite = await parseOkResponse(inviteResponse);

    const registerResult = await runCli(
      [
        "--json",
        "--relay-hub-url",
        relayHubBaseUrl,
        "device",
        "register",
        "--name",
        "Developer CLI",
        "--platform",
        "cli",
        "--invite",
        invite.inviteCode,
      ],
      { configDirectory },
    );
    expect(registerResult.exitCode).toBe(0);
    const registeredProfile = parseJsonStdout(registerResult, cliSerializedProfileSchema);
    expect(registeredProfile.nickname).toBe("Developer CLI");
    expect(registeredProfile.platform).toBe("cli");
    expect(registeredProfile.relayHubBaseUrl).toBe(relayHubBaseUrl);
    expect(registeredProfile.isActive).toBe(true);

    const currentResult = await runCli(["--json", "device", "current"], {
      configDirectory,
    });
    expect(currentResult.exitCode).toBe(0);
    const currentProfile = parseJsonStdout(currentResult, cliSerializedProfileSchema);
    expect(currentProfile.profileId).toBe(registeredProfile.profileId);
    expect(currentProfile.nickname).toBe("Developer CLI");
  });
});

test("send text, receive once, and delivery open", async () => {
  await withRelayTestEnvironment(async ({ rootDirectory, relayHubBaseUrl }) => {
    const configDirectory = path.join(rootDirectory, "cli-config");
    const senderInviteResponse = await createHttpClient({ relayHubBaseUrl }).invites.$post({
      json: { expiresInSeconds: 900 },
    });
    const senderInvite = await parseOkResponse(senderInviteResponse);
    const receiverInviteResponse = await createHttpClient({ relayHubBaseUrl }).invites.$post({
      json: { expiresInSeconds: 900 },
    });
    const receiverInvite = await parseOkResponse(receiverInviteResponse);

    await registerCliProfile({
      configDirectory,
      inviteCode: senderInvite.inviteCode,
      nickname: "Developer CLI",
      platform: "cli",
      relayHubBaseUrl,
    });
    await registerCliProfile({
      configDirectory,
      inviteCode: receiverInvite.inviteCode,
      nickname: "Developer iPhone Sim",
      platform: "ios",
      relayHubBaseUrl,
    });

    const useSenderResult = await runCli(["--json", "device", "use", "Developer CLI"], {
      configDirectory,
    });
    expect(useSenderResult.exitCode).toBe(0);

    const sendResult = await runCli(
      ["--json", "send", "text", "hello from the terminal", "--to", "Developer iPhone Sim"],
      { configDirectory },
    );
    expect(sendResult.exitCode).toBe(0);
    const sentItem = parseJsonStdout(sendResult, createItemResponseSchema);
    expect(sentItem.item.type).toBe("text");
    expect(sentItem.deliveries).toHaveLength(1);

    const receiveResult = await runCli(
      ["--json", "--device", "Developer iPhone Sim", "receive", "once"],
      { configDirectory },
    );
    expect(receiveResult.exitCode).toBe(0);
    const receivedDeliveries = parseJsonStdout(receiveResult, cliReceivedDeliveryResultsSchema);
    expect(receivedDeliveries).toHaveLength(1);
    const receivedDelivery = receivedDeliveries[0];
    expect(receivedDelivery).toBeDefined();
    assert(receivedDelivery !== undefined);
    expect(receivedDelivery.wasDuplicate).toBe(false);
    expect(receivedDelivery.simulation?.action).toBe("notification-created");
    expect(receivedDelivery.delivery.state).toBe("delivered");

    const receivedDeliveryId = receivedDelivery.delivery.deliveryId;
    expect(receivedDeliveryId).toBeDefined();
    assert(receivedDeliveryId !== undefined);

    const openResult = await runCli(
      ["--json", "--device", "Developer iPhone Sim", "delivery", "open", receivedDeliveryId],
      { configDirectory },
    );
    expect(openResult.exitCode).toBe(0);
    const openedDelivery = parseJsonStdout(openResult, cliOpenedDeliveryResponseSchema);
    expect(openedDelivery.action).toMatch(/opened text/i);
    expect(openedDelivery.delivery.state).toBe("viewed");

    const itemShowResult = await runCli(["--json", "item", "show", sentItem.item.itemId], {
      configDirectory,
    });
    expect(itemShowResult.exitCode).toBe(0);
    const itemView = parseJsonStdout(itemShowResult, itemListEntrySchema);
    expect(itemView.item.itemId).toBe(sentItem.item.itemId);
    expect(itemView.deliveries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ deliveryId: receivedDeliveryId, state: "viewed" }),
      ]),
    );
  });
});

test("send url and item list expose sent URL items", async () => {
  await withRelayTestEnvironment(async ({ rootDirectory, relayHubBaseUrl }) => {
    const configDirectory = path.join(rootDirectory, "cli-config");
    const senderInviteResponse = await createHttpClient({ relayHubBaseUrl }).invites.$post({
      json: { expiresInSeconds: 900 },
    });
    const senderInvite = await parseOkResponse(senderInviteResponse);
    const receiverInviteResponse = await createHttpClient({ relayHubBaseUrl }).invites.$post({
      json: { expiresInSeconds: 900 },
    });
    const receiverInvite = await parseOkResponse(receiverInviteResponse);

    await registerCliProfile({
      configDirectory,
      inviteCode: senderInvite.inviteCode,
      nickname: "Developer CLI",
      platform: "cli",
      relayHubBaseUrl,
    });
    await registerCliProfile({
      configDirectory,
      inviteCode: receiverInvite.inviteCode,
      nickname: "Developer iPad Sim",
      platform: "ios",
      relayHubBaseUrl,
    });

    const useSenderResult = await runCli(["--json", "device", "use", "Developer CLI"], {
      configDirectory,
    });
    expect(useSenderResult.exitCode).toBe(0);

    const sendUrlResult = await runCli(
      [
        "--json",
        "send",
        "url",
        "https://example.com/read-later",
        "--to",
        "Developer iPad Sim",
        "--title",
        "Read later",
      ],
      { configDirectory },
    );
    expect(sendUrlResult.exitCode).toBe(0);
    const sentUrlItem = parseJsonStdout(sendUrlResult, createItemResponseSchema);
    expect(sentUrlItem.item.type).toBe("url");
    expect(sentUrlItem.item.url).toBe("https://example.com/read-later");

    const itemListResult = await runCli(["--json", "item", "list", "--limit", "10"], {
      configDirectory,
    });
    expect(itemListResult.exitCode).toBe(0);
    const itemList = parseJsonStdout(itemListResult, itemListResponseSchema);
    expect(itemList.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          item: expect.objectContaining({ itemId: sentUrlItem.item.itemId, type: "url" }),
        }),
      ]),
    );
  });
});

test("delivery list, show, ack, and viewed manage delivery state transitions", async () => {
  await withRelayTestEnvironment(async ({ rootDirectory, relayHubBaseUrl }) => {
    const configDirectory = path.join(rootDirectory, "cli-config");
    const senderInviteResponse = await createHttpClient({ relayHubBaseUrl }).invites.$post({
      json: { expiresInSeconds: 900 },
    });
    const senderInvite = await parseOkResponse(senderInviteResponse);
    const receiverInviteResponse = await createHttpClient({ relayHubBaseUrl }).invites.$post({
      json: { expiresInSeconds: 900 },
    });
    const receiverInvite = await parseOkResponse(receiverInviteResponse);

    await registerCliProfile({
      configDirectory,
      inviteCode: senderInvite.inviteCode,
      nickname: "Developer CLI",
      platform: "cli",
      relayHubBaseUrl,
    });
    await registerCliProfile({
      configDirectory,
      inviteCode: receiverInvite.inviteCode,
      nickname: "Developer Android Sim",
      platform: "android",
      relayHubBaseUrl,
    });

    const useSenderResult = await runCli(["--json", "device", "use", "Developer CLI"], {
      configDirectory,
    });
    expect(useSenderResult.exitCode).toBe(0);

    const sendResult = await runCli(
      ["--json", "send", "text", "hello delivery state machine", "--to", "Developer Android Sim"],
      { configDirectory },
    );
    expect(sendResult.exitCode).toBe(0);
    const sentItem = parseJsonStdout(sendResult, createItemResponseSchema);
    const createdDelivery = sentItem.deliveries[0];
    expect(createdDelivery).toBeDefined();
    assert(createdDelivery !== undefined);

    const deliveryListResult = await runCli(
      [
        "--json",
        "--device",
        "Developer Android Sim",
        "delivery",
        "list",
        "--state",
        "pending",
        "--limit",
        "10",
      ],
      { configDirectory },
    );
    expect(deliveryListResult.exitCode).toBe(0);
    const pendingDeliveries = parseJsonStdout(deliveryListResult, deliveryListResponseSchema);
    expect(pendingDeliveries.deliveries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ deliveryId: createdDelivery.deliveryId, state: "pending" }),
      ]),
    );

    const deliveryShowResult = await runCli(
      [
        "--json",
        "--device",
        "Developer Android Sim",
        "delivery",
        "show",
        createdDelivery.deliveryId,
      ],
      { configDirectory },
    );
    expect(deliveryShowResult.exitCode).toBe(0);
    const shownDelivery = parseJsonStdout(deliveryShowResult, deliveryResourceSchema);
    expect(shownDelivery.deliveryId).toBe(createdDelivery.deliveryId);
    expect(shownDelivery.state).toBe("pending");

    const ackResult = await runCli(
      [
        "--json",
        "--device",
        "Developer Android Sim",
        "delivery",
        "ack",
        createdDelivery.deliveryId,
      ],
      { configDirectory },
    );
    expect(ackResult.exitCode).toBe(0);
    const acknowledgedDelivery = parseJsonStdout(ackResult, deliveryActionResponseSchema);
    expect(acknowledgedDelivery.delivery.state).toBe("delivered");

    const viewedResult = await runCli(
      [
        "--json",
        "--device",
        "Developer Android Sim",
        "delivery",
        "viewed",
        createdDelivery.deliveryId,
      ],
      { configDirectory },
    );
    expect(viewedResult.exitCode).toBe(0);
    const viewedDelivery = parseJsonStdout(viewedResult, deliveryActionResponseSchema);
    expect(viewedDelivery.delivery.state).toBe("viewed");

    const viewedListResult = await runCli(
      ["--json", "--device", "Developer Android Sim", "delivery", "list", "--state", "viewed"],
      { configDirectory },
    );
    expect(viewedListResult.exitCode).toBe(0);
    const viewedDeliveries = parseJsonStdout(viewedListResult, deliveryListResponseSchema);
    expect(viewedDeliveries.deliveries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ deliveryId: createdDelivery.deliveryId, state: "viewed" }),
      ]),
    );
  });
});

test("send file and delivery download write the files", async () => {
  await withRelayTestEnvironment(async ({ rootDirectory, relayHubBaseUrl }) => {
    const configDirectory = path.join(rootDirectory, "cli-config");
    const alphaFilePath = path.join(rootDirectory, "alpha.txt");
    const betaFilePath = path.join(rootDirectory, "beta.txt");
    await fs.promises.writeFile(alphaFilePath, "alpha\n", "utf8");
    await fs.promises.writeFile(betaFilePath, "beta\n", "utf8");
    const senderInviteResponse = await createHttpClient({ relayHubBaseUrl }).invites.$post({
      json: { expiresInSeconds: 900 },
    });
    const senderInvite = await parseOkResponse(senderInviteResponse);
    const receiverInviteResponse = await createHttpClient({ relayHubBaseUrl }).invites.$post({
      json: { expiresInSeconds: 900 },
    });
    const receiverInvite = await parseOkResponse(receiverInviteResponse);
    const secondReceiverInviteResponse = await createHttpClient({ relayHubBaseUrl }).invites.$post({
      json: { expiresInSeconds: 900 },
    });
    const secondReceiverInvite = await parseOkResponse(secondReceiverInviteResponse);

    await registerCliProfile({
      configDirectory,
      inviteCode: senderInvite.inviteCode,
      nickname: "Developer CLI",
      platform: "cli",
      relayHubBaseUrl,
    });
    await registerCliProfile({
      configDirectory,
      inviteCode: receiverInvite.inviteCode,
      nickname: "Developer Pixel Sim",
      platform: "android",
      relayHubBaseUrl,
    });
    await registerCliProfile({
      configDirectory,
      inviteCode: secondReceiverInvite.inviteCode,
      nickname: "Developer iPhone Sim",
      platform: "ios",
      relayHubBaseUrl,
    });

    const useSenderResult = await runCli(["--json", "device", "use", "Developer CLI"], {
      configDirectory,
    });
    expect(useSenderResult.exitCode).toBe(0);

    const sendResult = await runCli(
      [
        "--json",
        "send",
        "file",
        alphaFilePath,
        betaFilePath,
        "--to",
        "Developer Pixel Sim",
        "Developer iPhone Sim",
        "--title",
        "Trip docs",
      ],
      { configDirectory },
    );
    expect(sendResult.exitCode).toBe(0);
    const fileItem = parseJsonStdout(sendResult, createItemResponseSchema);
    expect(fileItem.item.type).toBe("file");

    const receiveResult = await runCli(
      ["--json", "--device", "Developer Pixel Sim", "receive", "once"],
      { configDirectory },
    );
    expect(receiveResult.exitCode).toBe(0);
    const receivedDeliveries = parseJsonStdout(receiveResult, cliReceivedDeliveryResultsSchema);
    const fileDelivery = receivedDeliveries.find(
      (result) => result.delivery.item.itemId === fileItem.item.itemId,
    );
    expect(fileDelivery).toBeDefined();
    assert(fileDelivery !== undefined);

    const outputDirectory = path.join(rootDirectory, "downloads");
    const downloadResult = await runCli(
      [
        "--json",
        "--device",
        "Developer Pixel Sim",
        "delivery",
        "download",
        fileDelivery.delivery.deliveryId,
        "--out",
        outputDirectory,
      ],
      { configDirectory },
    );
    expect(downloadResult.exitCode).toBe(0);
    const downloadPayload = parseJsonStdout(downloadResult, cliDownloadDeliveryResponseSchema);
    expect(downloadPayload.itemId).toBe(fileItem.item.itemId);
    expect(downloadPayload.outputPaths).toHaveLength(2);
    const alphaOutputPath = downloadPayload.outputPaths[0];
    const betaOutputPath = downloadPayload.outputPaths[1];
    expect(alphaOutputPath).toBeDefined();
    expect(betaOutputPath).toBeDefined();
    assert(alphaOutputPath !== undefined);
    assert(betaOutputPath !== undefined);
    expect(await fs.promises.readFile(alphaOutputPath, "utf8")).toBe("alpha\n");
    expect(await fs.promises.readFile(betaOutputPath, "utf8")).toBe("beta\n");
  });
});

async function registerCliProfile(input: {
  configDirectory: string;
  inviteCode: string;
  nickname: string;
  platform: DevicePlatform;
  relayHubBaseUrl: string;
}): Promise<void> {
  const registerResult = await runCli(
    [
      "--json",
      "--relay-hub-url",
      input.relayHubBaseUrl,
      "device",
      "register",
      "--name",
      input.nickname,
      "--platform",
      input.platform,
      "--invite",
      input.inviteCode,
    ],
    { configDirectory: input.configDirectory },
  );
  expect(registerResult.exitCode).toBe(0);
}

function parseJsonStdout<T>(result: CliInvocationResult, schema: z.ZodType<T>): T {
  if (result.stdout.trim().length === 0) {
    throw new Error(`Expected JSON on stdout but the CLI produced none. stderr: ${result.stderr}`);
  }

  const parsed = JSON.parse(result.stdout) as unknown;

  return schema.parse(parsed);
}

async function runCli(
  args: string[],
  input: { configDirectory: string },
): Promise<CliInvocationResult> {
  return await new Promise<CliInvocationResult>((resolve, reject) => {
    const child = child_process.spawn("node", [cliEntrypointPath, ...args], {
      cwd: workspaceRootDirectory,
      env: {
        ...process.env,
        NO_COLOR: "1",
        OTEL_SDK_DISABLED: "true",
        RELAY_CONFIG_DIR: input.configDirectory,
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
