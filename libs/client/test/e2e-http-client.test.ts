import assert from "node:assert";
import fs from "node:fs";
import {
  createServer as createHttpServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import os from "node:os";
import path from "node:path";
import util from "node:util";
import { expect, test } from "vitest";

import { deviceSummarySchema, type DeliveryListState } from "@content-relay/contracts";
import {
  createDependencyContainer,
  createHonoApp,
  runWithDiContainer,
  startServer,
} from "@content-relay/relay-hub";
import { withRelayHubTestEnvironment } from "@content-relay/relay-hub-test-utils";

import { isParseResponseError, parseOkResponse } from "#pkg/hono-client.ts";
import { RpcClient } from "#pkg/rpc-client.ts";

import {
  allocatePort,
  listenOnPort,
  receivePendingDeliveries,
  registerTestDevice,
  writeDownloadedDelivery,
} from "#pkg-test/test-helpers.ts";

test("milestone 0 flow covers registration, send, receive, viewed, and file download", async () => {
  await withRelayHubTestEnvironment(async ({ rootDirectory, relayHubBaseUrl }) => {
    const senderProfile = await registerTestDevice({
      relayHubBaseUrl,
      nickname: "Developer CLI",
      platform: "cli",
    });
    const iosProfile = await registerTestDevice({
      relayHubBaseUrl,
      nickname: "Developer iPhone Sim",
      platform: "ios",
    });
    const androidProfile = await registerTestDevice({
      relayHubBaseUrl,
      nickname: "Developer Pixel Sim",
      platform: "android",
    });

    const textItem = await parseOkResponse(
      new RpcClient(senderProfile.relayHubBaseUrl)
        .createDeviceRpcClient(senderProfile.deviceId)
        .sendText({
          text: "hello from the terminal",
          targetDeviceIds: [iosProfile.deviceId, androidProfile.deviceId],
        }),
    );

    expect(textItem.deliveries).toHaveLength(2);

    const iosHandledDeliveryIds = new Set<string>();
    const firstIosFetch = await receivePendingDeliveries(iosProfile, {
      handledDeliveryIds: iosHandledDeliveryIds,
      acknowledge: false,
      simulatePlatform: true,
      deduplicate: true,
    });
    expect(firstIosFetch).toHaveLength(1);
    const firstIosDelivery = firstIosFetch[0];
    expect(firstIosDelivery).toBeDefined();
    assert(firstIosDelivery !== undefined);
    expect(firstIosDelivery.wasDuplicate).toBe(false);
    expect(firstIosDelivery.simulation?.action).toBe("notification-created");

    const duplicateIosFetch = await receivePendingDeliveries(iosProfile, {
      handledDeliveryIds: iosHandledDeliveryIds,
      acknowledge: false,
      simulatePlatform: true,
      deduplicate: true,
    });
    expect(duplicateIosFetch).toHaveLength(1);
    const duplicateIosDelivery = duplicateIosFetch[0];
    expect(duplicateIosDelivery).toBeDefined();
    assert(duplicateIosDelivery !== undefined);
    expect(duplicateIosDelivery.wasDuplicate).toBe(true);

    const acknowledgedIosFetch = await receivePendingDeliveries(iosProfile, {
      handledDeliveryIds: iosHandledDeliveryIds,
      acknowledge: true,
      simulatePlatform: true,
      deduplicate: true,
    });
    const acknowledgedIosDelivery = acknowledgedIosFetch[0];
    expect(acknowledgedIosDelivery).toBeDefined();
    assert(acknowledgedIosDelivery !== undefined);
    expect(acknowledgedIosDelivery.delivery.state).toBe("delivered");

    const iosDeliveryId = acknowledgedIosDelivery.delivery.deliveryId;
    expect(iosDeliveryId).toBeDefined();
    assert(iosDeliveryId !== undefined);

    const viewedDelivery = await parseOkResponse(
      new RpcClient(iosProfile.relayHubBaseUrl)
        .createDeviceRpcClient(iosProfile.deviceId)
        .markDeliveryViewed({ deliveryId: iosDeliveryId }),
    );
    expect(viewedDelivery.delivery.state).toBe("viewed");

    const itemAfterOpen = await parseOkResponse(
      new RpcClient(senderProfile.relayHubBaseUrl)
        .createDeviceRpcClient(senderProfile.deviceId)
        .getItem({ itemId: textItem.item.itemId }),
    );
    expect(itemAfterOpen.deliveries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ targetDeviceId: iosProfile.deviceId, state: "viewed" }),
        expect.objectContaining({
          targetDeviceId: androidProfile.deviceId,
          state: "pending",
        }),
      ]),
    );

    const alphaFilePath = path.join(rootDirectory, "alpha.txt");
    const betaFilePath = path.join(rootDirectory, "beta.txt");
    await fs.promises.writeFile(alphaFilePath, "alpha\n", "utf8");
    await fs.promises.writeFile(betaFilePath, "beta\n", "utf8");
    const alphaFileContent = await fs.promises.readFile(alphaFilePath);
    const betaFileContent = await fs.promises.readFile(betaFilePath);

    const fileItem = await parseOkResponse(
      new RpcClient(senderProfile.relayHubBaseUrl)
        .createDeviceRpcClient(senderProfile.deviceId)
        .sendFiles({
          targetDeviceIds: [androidProfile.deviceId, iosProfile.deviceId],
          title: "Trip docs",
          files: [
            { content: alphaFileContent, basename: path.basename(alphaFilePath) },
            { content: betaFileContent, basename: path.basename(betaFilePath) },
          ],
        }),
    );
    expect(fileItem.item.type).toBe("file");
    expect(fileItem.item.files).toHaveLength(2);

    const fileBlobDirectory = path.join(
      rootDirectory,
      "relay-hub-data",
      "blobs",
      fileItem.item.itemId,
    );
    await expect(fs.promises.stat(fileBlobDirectory)).resolves.toBeDefined();

    const androidPendingBeforeAck = await parseOkResponse(
      new RpcClient(androidProfile.relayHubBaseUrl)
        .createDeviceRpcClient(androidProfile.deviceId)
        .listDeliveries({ state: "pending" }),
    );
    expect(androidPendingBeforeAck.deliveries).toHaveLength(2);

    const androidReceive = await receivePendingDeliveries(androidProfile, {
      acknowledge: true,
      simulatePlatform: true,
      deduplicate: true,
    });
    expect(androidReceive).toHaveLength(2);
    const firstAndroidDelivery = androidReceive[0];
    expect(firstAndroidDelivery).toBeDefined();
    assert(firstAndroidDelivery !== undefined);
    expect(firstAndroidDelivery.delivery.state).toBe("delivered");

    const fileDelivery = androidReceive.find(
      (entry) => entry.delivery.item.itemId === fileItem.item.itemId,
    );
    expect(fileDelivery).toBeDefined();
    assert(fileDelivery !== undefined);

    const download = await parseOkResponse(
      new RpcClient(androidProfile.relayHubBaseUrl)
        .createDeviceRpcClient(androidProfile.deviceId)
        .downloadDelivery({
          deliveryId: fileDelivery.delivery.deliveryId,
        }),
    );
    const outputPaths = await writeDownloadedDelivery(
      download,
      path.join(rootDirectory, "downloads"),
    );
    expect(outputPaths).toHaveLength(2);

    const downloadedAlphaPath = outputPaths[0];
    const downloadedBetaPath = outputPaths[1];
    expect(downloadedAlphaPath).toBeDefined();
    expect(downloadedBetaPath).toBeDefined();
    assert(downloadedAlphaPath !== undefined);
    assert(downloadedBetaPath !== undefined);

    const downloadedAlpha = await fs.promises.readFile(downloadedAlphaPath, "utf8");
    const downloadedBeta = await fs.promises.readFile(downloadedBetaPath, "utf8");
    expect(downloadedAlpha).toBe("alpha\n");
    expect(downloadedBeta).toBe("beta\n");

    await expect(fs.promises.stat(fileBlobDirectory)).resolves.toBeDefined();

    const iosFileReceive = await receivePendingDeliveries(iosProfile, {
      acknowledge: true,
      simulatePlatform: true,
      deduplicate: true,
    });
    const iosFileDelivery = iosFileReceive.find(
      (entry) => entry.delivery.item.itemId === fileItem.item.itemId,
    );
    expect(iosFileDelivery).toBeDefined();
    assert(iosFileDelivery !== undefined);
    expect(iosFileDelivery.delivery.state).toBe("delivered");
    await expect(fs.promises.stat(fileBlobDirectory)).rejects.toMatchObject({ code: "ENOENT" });
  });
});

test("text send rejects a single-line URL payload", async () => {
  await withRelayHubTestEnvironment(async ({ relayHubBaseUrl }) => {
    const senderProfile = await registerTestDevice({
      relayHubBaseUrl,
      nickname: "Developer CLI",
      platform: "cli",
    });
    const receiverProfile = await registerTestDevice({
      relayHubBaseUrl,
      nickname: "Developer iPhone Sim",
      platform: "ios",
    });

    const sendTextPromise = parseOkResponse(
      new RpcClient(senderProfile.relayHubBaseUrl)
        .createDeviceRpcClient(senderProfile.deviceId)
        .sendText({
          text: "https://example.com/interesting-link",
          targetDeviceIds: [receiverProfile.deviceId],
        }),
    );
    await expect(sendTextPromise).rejects.toSatisfy(isParseResponseError);
    await expect(sendTextPromise).rejects.toMatchObject({
      statusCode: 400,
      detail: {
        data: {
          error: expect.stringMatching(/typed url send flow/i),
        },
      },
    });
  });
});

test("macos simulated receive auto-marks text and url deliveries viewed", async () => {
  await withRelayHubTestEnvironment(async ({ relayHubBaseUrl }) => {
    const senderProfile = await registerTestDevice({
      relayHubBaseUrl,
      nickname: "Developer CLI",
      platform: "cli",
    });
    const macosProfile = await registerTestDevice({
      relayHubBaseUrl,
      nickname: "Developer Mac",
      platform: "macos",
    });

    await parseOkResponse(
      new RpcClient(senderProfile.relayHubBaseUrl)
        .createDeviceRpcClient(senderProfile.deviceId)
        .sendText({
          text: "Open this note immediately",
          targetDeviceIds: [macosProfile.deviceId],
        }),
    );
    await parseOkResponse(
      new RpcClient(senderProfile.relayHubBaseUrl)
        .createDeviceRpcClient(senderProfile.deviceId)
        .sendUrl({
          url: "https://example.com/macos-auto-open",
          targetDeviceIds: [macosProfile.deviceId],
        }),
    );

    const deliveries = await receivePendingDeliveries(macosProfile, {
      acknowledge: true,
      simulatePlatform: true,
      deduplicate: true,
    });

    expect(deliveries).toHaveLength(2);
    expect(deliveries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          delivery: expect.objectContaining({ state: "viewed" }),
          simulation: expect.objectContaining({ action: "auto-opened-text-window" }),
        }),
        expect.objectContaining({
          delivery: expect.objectContaining({ state: "viewed" }),
          simulation: expect.objectContaining({ action: "auto-opened-browser" }),
        }),
      ]),
    );

    const viewedDeliveries = await parseOkResponse(
      new RpcClient(macosProfile.relayHubBaseUrl)
        .createDeviceRpcClient(macosProfile.deviceId)
        .listDeliveries({ state: "viewed", limit: 10 }),
    );
    expect(viewedDeliveries.deliveries).toHaveLength(2);

    const pendingDeliveries = await parseOkResponse(
      new RpcClient(macosProfile.relayHubBaseUrl)
        .createDeviceRpcClient(macosProfile.deviceId)
        .listDeliveries({ state: "pending", limit: 10 }),
    );
    expect(pendingDeliveries.deliveries).toHaveLength(0);
  });
});

test("deleting a device hides it from active device listings", async () => {
  await withRelayHubTestEnvironment(async ({ relayHubBaseUrl }) => {
    const senderProfile = await registerTestDevice({
      relayHubBaseUrl,
      nickname: "Developer CLI",
      platform: "cli",
    });
    const receiverProfile = await registerTestDevice({
      relayHubBaseUrl,
      nickname: "Developer iPhone Sim",
      platform: "ios",
    });

    const removeResponse = await new RpcClient(receiverProfile.relayHubBaseUrl)
      .createDeviceRpcClient(receiverProfile.deviceId)
      .deleteDevice();
    expect(removeResponse.status).toBe(204);

    const deliveries = await parseOkResponse(
      new RpcClient(receiverProfile.relayHubBaseUrl)
        .createDeviceRpcClient(receiverProfile.deviceId)
        .listDeliveries({ state: "all", limit: 10 }),
    );
    expect(deliveries.deliveries).toEqual([]);

    const devices = await parseOkResponse(
      new RpcClient(senderProfile.relayHubBaseUrl).listDevices(),
    );
    expect(devices.map((device) => device.deviceId)).not.toContain(receiverProfile.deviceId);
  });
});

test("push tokens can be upserted for a path device", async () => {
  await withRelayHubTestEnvironment(async ({ relayHubBaseUrl }) => {
    const device = await registerTestDevice({
      relayHubBaseUrl,
      nickname: "Developer iPhone Sim",
      platform: "ios",
    });

    const upsertResponse1 = await new RpcClient(device.relayHubBaseUrl)
      .createDeviceRpcClient(device.deviceId)
      .setPushToken({
        token: "ExponentPushToken[device-token-1]",
      });
    expect(upsertResponse1.status).toBe(204);

    const upsertResponse2 = await new RpcClient(device.relayHubBaseUrl)
      .createDeviceRpcClient(device.deviceId)
      .setPushToken({
        token: "ExponentPushToken[device-token-2]",
      });
    expect(upsertResponse2.status).toBe(204);
  });
});

test("device routes support rename, listing, and path-selected device actions", async () => {
  await withRelayHubTestEnvironment(async ({ relayHubBaseUrl }) => {
    const senderProfile = await registerTestDevice({
      relayHubBaseUrl,
      nickname: "Developer CLI",
      platform: "cli",
    });
    const receiverProfile = await registerTestDevice({
      relayHubBaseUrl,
      nickname: "Developer iPhone Sim",
      platform: "ios",
    });

    const renameResponse = await new RpcClient(receiverProfile.relayHubBaseUrl)
      .createDeviceRpcClient(receiverProfile.deviceId)
      .renameDevice({
        nickname: "Renamed iPhone Sim",
      });
    expect(renameResponse.status).toBe(200);
    const renamedDevice = deviceSummarySchema.parse(await renameResponse.json());
    expect(renamedDevice.nickname).toBe("Renamed iPhone Sim");

    const devices = await parseOkResponse(
      new RpcClient(senderProfile.relayHubBaseUrl).listDevices(),
    );
    expect(devices).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          deviceId: receiverProfile.deviceId,
          nickname: "Renamed iPhone Sim",
        }),
      ]),
    );

    const renameSenderResponse = await new RpcClient(receiverProfile.relayHubBaseUrl)
      .createDeviceRpcClient(receiverProfile.deviceId)
      .renameDevice({
        deviceId: senderProfile.deviceId,
        nickname: "Renamed Developer CLI",
      });
    expect(renameSenderResponse.status).toBe(200);

    const updateSenderPushTokenResponse = await new RpcClient(receiverProfile.relayHubBaseUrl)
      .createDeviceRpcClient(receiverProfile.deviceId)
      .setPushToken({
        deviceId: senderProfile.deviceId,
        token: "ExponentPushToken[cross-device]",
      });
    expect(updateSenderPushTokenResponse.status).toBe(204);
  });
});

test("item and delivery routes list and fetch device-scoped resources", async () => {
  await withRelayHubTestEnvironment(async ({ relayHubBaseUrl }) => {
    const senderProfile = await registerTestDevice({
      relayHubBaseUrl,
      nickname: "Developer CLI",
      platform: "cli",
    });
    const receiverProfile = await registerTestDevice({
      relayHubBaseUrl,
      nickname: "Developer iPhone Sim",
      platform: "ios",
    });

    const firstItem = await parseOkResponse(
      new RpcClient(senderProfile.relayHubBaseUrl)
        .createDeviceRpcClient(senderProfile.deviceId)
        .sendText({
          text: "first delivery becomes delivered",
          targetDeviceIds: [receiverProfile.deviceId],
        }),
    );
    const secondItem = await parseOkResponse(
      new RpcClient(senderProfile.relayHubBaseUrl)
        .createDeviceRpcClient(senderProfile.deviceId)
        .sendText({
          text: "second delivery stays pending",
          targetDeviceIds: [receiverProfile.deviceId],
        }),
    );

    const pendingDeliveries = await parseOkResponse(
      new RpcClient(receiverProfile.relayHubBaseUrl)
        .createDeviceRpcClient(receiverProfile.deviceId)
        .listDeliveries({ state: "pending" }),
    );
    expect(pendingDeliveries.deliveries).toHaveLength(2);

    const firstDelivery = pendingDeliveries.deliveries.find(
      (delivery) => delivery.item.itemId === firstItem.item.itemId,
    );
    expect(firstDelivery).toBeDefined();
    assert(firstDelivery !== undefined);
    const firstDeliveryId = firstDelivery.deliveryId;
    expect(firstDeliveryId).toBeDefined();
    assert(firstDeliveryId !== undefined);

    const loadedDelivery = await parseOkResponse(
      new RpcClient(receiverProfile.relayHubBaseUrl)
        .createDeviceRpcClient(receiverProfile.deviceId)
        .getDelivery({ deliveryId: firstDeliveryId }),
    );
    expect(loadedDelivery.delivery.deliveryId).toBe(firstDeliveryId);
    expect(loadedDelivery.delivery.item.itemId).toBe(firstItem.item.itemId);

    const acknowledgedDelivery = await parseOkResponse(
      new RpcClient(receiverProfile.relayHubBaseUrl)
        .createDeviceRpcClient(receiverProfile.deviceId)
        .acknowledgeDelivery({ deliveryId: firstDeliveryId }),
    );
    expect(acknowledgedDelivery.delivery.state).toBe("delivered");

    const deliveredDeliveries = await parseOkResponse(
      new RpcClient(receiverProfile.relayHubBaseUrl)
        .createDeviceRpcClient(receiverProfile.deviceId)
        .listDeliveries({ state: "delivered", limit: 10 }),
    );
    expect(deliveredDeliveries.deliveries).toHaveLength(1);
    const deliveredDelivery = deliveredDeliveries.deliveries[0];
    expect(deliveredDelivery).toBeDefined();
    assert(deliveredDelivery !== undefined);
    expect(deliveredDelivery.deliveryId).toBe(firstDeliveryId);

    const allDeliveries = await parseOkResponse(
      new RpcClient(receiverProfile.relayHubBaseUrl)
        .createDeviceRpcClient(receiverProfile.deviceId)
        .listDeliveries({ state: "all", limit: 10 }),
    );
    expect(allDeliveries.deliveries).toHaveLength(2);
    expect(allDeliveries.deliveries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ itemId: firstItem.item.itemId, state: "delivered" }),
        expect.objectContaining({ itemId: secondItem.item.itemId, state: "pending" }),
      ]),
    );

    const items = await parseOkResponse(
      new RpcClient(senderProfile.relayHubBaseUrl)
        .createDeviceRpcClient(senderProfile.deviceId)
        .listItems({ limit: 10 }),
    );
    expect(items.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          item: expect.objectContaining({ itemId: firstItem.item.itemId }),
        }),
        expect.objectContaining({
          item: expect.objectContaining({ itemId: secondItem.item.itemId }),
        }),
      ]),
    );
  });
});

test("delivery listing paginates with opaque cursors", async () => {
  await withRelayHubTestEnvironment(async ({ relayHubBaseUrl }) => {
    const senderProfile = await registerTestDevice({
      relayHubBaseUrl,
      nickname: "Developer CLI",
      platform: "cli",
    });
    const receiverProfile = await registerTestDevice({
      relayHubBaseUrl,
      nickname: "Developer Android Sim",
      platform: "android",
    });
    const receiverClient = new RpcClient(receiverProfile.relayHubBaseUrl).createDeviceRpcClient(
      receiverProfile.deviceId,
    );
    const senderClient = new RpcClient(senderProfile.relayHubBaseUrl).createDeviceRpcClient(
      senderProfile.deviceId,
    );

    const firstItem = await parseOkResponse(
      senderClient.sendText({
        text: "oldest delivery",
        targetDeviceIds: [receiverProfile.deviceId],
      }),
    );
    const secondItem = await parseOkResponse(
      senderClient.sendText({
        text: "middle delivery",
        targetDeviceIds: [receiverProfile.deviceId],
      }),
    );
    const thirdItem = await parseOkResponse(
      senderClient.sendText({
        text: "newest delivery",
        targetDeviceIds: [receiverProfile.deviceId],
      }),
    );

    const firstPage = await parseOkResponse(
      receiverClient.listDeliveries({ state: "pending", limit: 2 }),
    );
    expect(firstPage.deliveries).toHaveLength(2);
    expect(firstPage.pageInfo.hasNextPage).toBe(true);
    expect(firstPage.pageInfo.nextCursor).toEqual(expect.any(String));
    assert(firstPage.pageInfo.nextCursor !== null);

    const secondPage = await parseOkResponse(
      receiverClient.listDeliveries({
        state: "pending",
        limit: 2,
        cursor: firstPage.pageInfo.nextCursor,
      }),
    );
    expect(secondPage.deliveries).toHaveLength(1);
    expect([
      ...firstPage.deliveries.map((delivery) => delivery.item.itemId),
      ...secondPage.deliveries.map((delivery) => delivery.item.itemId),
    ]).toEqual(
      expect.arrayContaining([
        firstItem.item.itemId,
        secondItem.item.itemId,
        thirdItem.item.itemId,
      ]),
    );
    expect(secondPage.pageInfo).toEqual({
      nextCursor: null,
      hasNextPage: false,
    });

    const malformedCursorResponse = await receiverClient.listDeliveries({
      state: "pending",
      cursor: "not-a-valid-cursor",
    });
    expect(malformedCursorResponse.status).toBe(400);
    expect(await malformedCursorResponse.json()).toMatchObject({
      error: expect.stringMatching(/Malformed delivery list cursor/i),
    });
  });
});

test("file uploads reject empty payloads and write single-file downloads", async () => {
  await withRelayHubTestEnvironment(async ({ rootDirectory, relayHubBaseUrl }) => {
    const senderProfile = await registerTestDevice({
      relayHubBaseUrl,
      nickname: "Developer CLI",
      platform: "cli",
    });
    const receiverProfile = await registerTestDevice({
      relayHubBaseUrl,
      nickname: "Developer Android Sim",
      platform: "android",
    });

    const emptyUploadResponse = await new RpcClient(senderProfile.relayHubBaseUrl)
      .createDeviceRpcClient(senderProfile.deviceId)
      .sendFiles({
        targetDeviceIds: [receiverProfile.deviceId],
        files: [],
      });
    expect(emptyUploadResponse.status).toBe(400);
    expect(await emptyUploadResponse.json()).toMatchObject({
      error: expect.stringMatching(/Expected at least one uploaded file\./i),
    });

    const gammaFilePath = path.join(rootDirectory, "gamma.txt");
    await fs.promises.writeFile(gammaFilePath, "gamma\n", "utf8");
    const gammaFileContent = await fs.promises.readFile(gammaFilePath);

    const fileItem = await parseOkResponse(
      new RpcClient(senderProfile.relayHubBaseUrl)
        .createDeviceRpcClient(senderProfile.deviceId)
        .sendFiles({
          targetDeviceIds: [receiverProfile.deviceId],
          files: [{ content: gammaFileContent, basename: path.basename(gammaFilePath) }],
        }),
    );
    const firstFileDelivery = fileItem.deliveries[0];
    expect(firstFileDelivery).toBeDefined();
    assert(firstFileDelivery !== undefined);
    const fileDeliveryId = firstFileDelivery.deliveryId;
    expect(fileDeliveryId).toBeDefined();
    assert(fileDeliveryId !== undefined);

    const download = await parseOkResponse(
      new RpcClient(receiverProfile.relayHubBaseUrl)
        .createDeviceRpcClient(receiverProfile.deviceId)
        .downloadDelivery({ deliveryId: fileDeliveryId }),
    );

    const acknowledgeResponse = await new RpcClient(receiverProfile.relayHubBaseUrl)
      .createDeviceRpcClient(receiverProfile.deviceId)
      .acknowledgeDelivery({
        deliveryId: fileDeliveryId,
      });
    expect(acknowledgeResponse.status).toBe(200);

    const explicitFilePath = path.join(rootDirectory, "single-download.txt");
    const explicitOutputPaths = await writeDownloadedDelivery(download, explicitFilePath);
    expect(explicitOutputPaths).toEqual([explicitFilePath]);
    expect(await fs.promises.readFile(explicitFilePath, "utf8")).toBe("gamma\n");

    const downloadDirectoryPath = path.join(rootDirectory, "single-file-directory");
    const directoryOutputPaths = await writeDownloadedDelivery(download, downloadDirectoryPath);
    expect(directoryOutputPaths).toEqual([path.join(downloadDirectoryPath, "gamma.txt")]);
    const directoryOutputPath = directoryOutputPaths[0];
    expect(directoryOutputPath).toBeDefined();
    assert(directoryOutputPath !== undefined);
    expect(await fs.promises.readFile(directoryOutputPath, "utf8")).toBe("gamma\n");
  });
});

test("receivePendingDeliveries respects deduplication, simulation, and acknowledgement options", async () => {
  await withRelayHubTestEnvironment(async ({ relayHubBaseUrl }) => {
    const senderProfile = await registerTestDevice({
      relayHubBaseUrl,
      nickname: "Developer CLI",
      platform: "cli",
    });
    const iosProfile = await registerTestDevice({
      relayHubBaseUrl,
      nickname: "Developer iPhone Sim",
      platform: "ios",
    });
    const macosProfile = await registerTestDevice({
      relayHubBaseUrl,
      nickname: "Developer Mac",
      platform: "macos",
    });

    await parseOkResponse(
      new RpcClient(senderProfile.relayHubBaseUrl)
        .createDeviceRpcClient(senderProfile.deviceId)
        .sendText({
          text: "do not simulate this delivery",
          targetDeviceIds: [iosProfile.deviceId],
        }),
    );

    const firstIosReceive = await receivePendingDeliveries(iosProfile, {
      acknowledge: false,
      simulatePlatform: false,
      deduplicate: false,
    });
    expect(firstIosReceive).toHaveLength(1);
    const firstIosReceiveDelivery = firstIosReceive[0];
    expect(firstIosReceiveDelivery).toBeDefined();
    assert(firstIosReceiveDelivery !== undefined);
    expect(firstIosReceiveDelivery.wasDuplicate).toBe(false);
    expect(firstIosReceiveDelivery.simulation).toBeNull();
    expect(firstIosReceiveDelivery.delivery.state).toBe("pending");

    const secondIosReceive = await receivePendingDeliveries(iosProfile, {
      acknowledge: false,
      simulatePlatform: false,
      deduplicate: false,
    });
    expect(secondIosReceive).toHaveLength(1);
    const secondIosReceiveDelivery = secondIosReceive[0];
    expect(secondIosReceiveDelivery).toBeDefined();
    assert(secondIosReceiveDelivery !== undefined);
    expect(secondIosReceiveDelivery.wasDuplicate).toBe(false);
    expect(secondIosReceiveDelivery.simulation).toBeNull();
    expect(secondIosReceiveDelivery.delivery.state).toBe("pending");

    await parseOkResponse(
      new RpcClient(senderProfile.relayHubBaseUrl)
        .createDeviceRpcClient(senderProfile.deviceId)
        .sendText({
          text: "macos auto-view requires acknowledgement",
          targetDeviceIds: [macosProfile.deviceId],
        }),
    );

    const macosHandledDeliveryIds = new Set<string>();
    const firstMacosReceive = await receivePendingDeliveries(macosProfile, {
      handledDeliveryIds: macosHandledDeliveryIds,
      acknowledge: false,
      simulatePlatform: true,
      deduplicate: true,
    });
    expect(firstMacosReceive).toHaveLength(1);
    const firstMacosDelivery = firstMacosReceive[0];
    expect(firstMacosDelivery).toBeDefined();
    assert(firstMacosDelivery !== undefined);
    expect(firstMacosDelivery.wasDuplicate).toBe(false);
    expect(firstMacosDelivery.simulation?.action).toBe("auto-opened-text-window");
    expect(firstMacosDelivery.delivery.state).toBe("pending");

    const macosDeliveryId = firstMacosDelivery.delivery.deliveryId;
    expect(macosDeliveryId).toBeDefined();
    assert(macosDeliveryId !== undefined);

    const pendingMacosDelivery = await parseOkResponse(
      new RpcClient(macosProfile.relayHubBaseUrl)
        .createDeviceRpcClient(macosProfile.deviceId)
        .getDelivery({ deliveryId: macosDeliveryId }),
    );
    expect(pendingMacosDelivery.delivery.state).toBe("pending");

    const duplicateAcknowledgedMacosReceive = await receivePendingDeliveries(macosProfile, {
      handledDeliveryIds: macosHandledDeliveryIds,
      acknowledge: true,
      simulatePlatform: true,
      deduplicate: true,
    });
    expect(duplicateAcknowledgedMacosReceive).toHaveLength(1);
    const duplicateAcknowledgedMacosDelivery = duplicateAcknowledgedMacosReceive[0];
    expect(duplicateAcknowledgedMacosDelivery).toBeDefined();
    assert(duplicateAcknowledgedMacosDelivery !== undefined);
    expect(duplicateAcknowledgedMacosDelivery.wasDuplicate).toBe(true);
    expect(duplicateAcknowledgedMacosDelivery.simulation?.action).toBe("auto-opened-text-window");
    expect(duplicateAcknowledgedMacosDelivery.delivery.state).toBe("delivered");
  });
});

test("validation errors are returned for JSON, query, and multipart routes", async () => {
  await withRelayHubTestEnvironment(async ({ relayHubBaseUrl }) => {
    const senderProfile = await registerTestDevice({
      relayHubBaseUrl,
      nickname: "Developer CLI",
      platform: "cli",
    });
    const receiverProfile = await registerTestDevice({
      relayHubBaseUrl,
      nickname: "Developer iPhone Sim",
      platform: "ios",
    });

    expect(receiverProfile.nickname).toBe("Developer iPhone Sim");

    const duplicateRegisterResponse = await new RpcClient(relayHubBaseUrl).registerDevice({
      nickname: "Developer CLI",
      platform: "cli",
    });
    expect(duplicateRegisterResponse.status).toBe(201);
    await expect(duplicateRegisterResponse.json()).resolves.toMatchObject({
      deviceId: senderProfile.deviceId,
      nickname: "Developer CLI",
      platform: "cli",
    });

    const invalidRegisterResponse = await new RpcClient(relayHubBaseUrl).registerDevice({
      nickname: "   ",
      platform: "ios",
      pushRegistration: { token: "simulated-ios-validation-token" },
    });
    expect(invalidRegisterResponse.status).toBe(400);
    expect(await invalidRegisterResponse.json()).toMatchObject({
      error: expect.stringMatching(/(at least 1 character|>=1 characters)/i),
    });

    const missingMobilePushRegistrationResponse = await new RpcClient(
      relayHubBaseUrl,
    ).registerDevice({
      nickname: "Developer iPhone Sim",
      platform: "ios",
    });
    expect(missingMobilePushRegistrationResponse.status).toBe(400);
    expect(await missingMobilePushRegistrationResponse.json()).toMatchObject({
      error: expect.stringMatching(/pushRegistration/i),
    });

    const nonMobilePushRegistrationResponse = await new RpcClient(relayHubBaseUrl).registerDevice({
      nickname: "Developer CLI",
      platform: "cli",
      pushRegistration: { token: "simulated-cli-validation-token" },
    });
    expect(nonMobilePushRegistrationResponse.status).toBe(400);
    expect(await nonMobilePushRegistrationResponse.json()).toMatchObject({
      error: expect.stringMatching(/only allowed for ios and android/i),
    });

    const invalidRenameResponse = await new RpcClient(senderProfile.relayHubBaseUrl)
      .createDeviceRpcClient(senderProfile.deviceId)
      .renameDevice({
        nickname: "   ",
      });
    expect(invalidRenameResponse.status).toBe(400);
    expect(await invalidRenameResponse.json()).toMatchObject({
      error: expect.stringMatching(/(at least 1 character|>=1 characters)/i),
    });

    const invalidPushTokenResponse = await new RpcClient(senderProfile.relayHubBaseUrl)
      .createDeviceRpcClient(senderProfile.deviceId)
      .setPushToken({
        token: "   ",
      });
    expect(invalidPushTokenResponse.status).toBe(400);
    expect(await invalidPushTokenResponse.json()).toMatchObject({
      error: expect.stringMatching(/(at least 1 character|>=1 characters)/i),
    });

    const invalidTextItemResponse = await new RpcClient(senderProfile.relayHubBaseUrl)
      .createDeviceRpcClient(senderProfile.deviceId)
      .sendText({
        text: "",
        targetDeviceIds: [receiverProfile.deviceId],
      });
    expect(invalidTextItemResponse.status).toBe(400);
    expect(await invalidTextItemResponse.json()).toMatchObject({
      error: expect.stringMatching(/(at least 1 character|>=1 characters)/i),
    });

    const invalidUrlItemResponse = await new RpcClient(senderProfile.relayHubBaseUrl)
      .createDeviceRpcClient(senderProfile.deviceId)
      .sendUrl({
        url: "not-a-url",
        targetDeviceIds: [receiverProfile.deviceId],
      });
    expect(invalidUrlItemResponse.status).toBe(400);
    expect(await invalidUrlItemResponse.json()).toMatchObject({
      error: expect.stringMatching(/valid url/i),
    });

    const invalidDeliveryStateResponse = await new RpcClient(receiverProfile.relayHubBaseUrl)
      .createDeviceRpcClient(receiverProfile.deviceId)
      .listDeliveries({
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- intentional type cast to allow invalid value
        state: "invalid" as DeliveryListState,
        limit: "10",
      });
    expect(invalidDeliveryStateResponse.status).toBe(400);
    expect(await invalidDeliveryStateResponse.json()).toMatchObject({
      error: expect.stringMatching(/Invalid option/i),
    });

    const invalidDeliveryLimitResponse = await new RpcClient(receiverProfile.relayHubBaseUrl)
      .createDeviceRpcClient(receiverProfile.deviceId)
      .listDeliveries({
        limit: "0",
      });
    expect(invalidDeliveryLimitResponse.status).toBe(400);
    expect(await invalidDeliveryLimitResponse.json()).toMatchObject({
      error: expect.stringMatching(/(greater than 0|>0)/i),
    });

    const invalidItemLimitResponse = await new RpcClient(senderProfile.relayHubBaseUrl)
      .createDeviceRpcClient(senderProfile.deviceId)
      .listItems({
        limit: "0",
      });
    expect(invalidItemLimitResponse.status).toBe(400);
    expect(await invalidItemLimitResponse.json()).toMatchObject({
      error: expect.stringMatching(/(greater than 0|>0)/i),
    });

    const missingSourceDeviceIdForm = new FormData();
    missingSourceDeviceIdForm.set(
      "files",
      new File([Buffer.from("alpha\n")], "alpha.txt", { type: "text/plain" }),
    );
    const missingSourceDeviceIdResponse = await fetch(`${relayHubBaseUrl}/items/file`, {
      method: "POST",
      body: missingSourceDeviceIdForm,
    });
    expect(missingSourceDeviceIdResponse.status).toBe(400);
    expect(await missingSourceDeviceIdResponse.json()).toMatchObject({
      error: expect.stringMatching(/Expected `sourceDeviceId` form field\./i),
    });

    const invalidJsonTargetDeviceIdsForm = new FormData();
    invalidJsonTargetDeviceIdsForm.set("sourceDeviceId", senderProfile.deviceId);
    invalidJsonTargetDeviceIdsForm.set("targetDeviceIds", "not-json");
    invalidJsonTargetDeviceIdsForm.set(
      "files",
      new File([Buffer.from("beta\n")], "beta.txt", { type: "text/plain" }),
    );
    const invalidJsonTargetDeviceIdsResponse = await fetch(`${relayHubBaseUrl}/items/file`, {
      method: "POST",
      body: invalidJsonTargetDeviceIdsForm,
    });
    expect(invalidJsonTargetDeviceIdsResponse.status).toBe(400);
    expect(await invalidJsonTargetDeviceIdsResponse.json()).toMatchObject({
      error: expect.stringMatching(/Expected `targetDeviceIds` to be valid JSON\./i),
    });

    const invalidTargetDeviceIdArrayForm = new FormData();
    invalidTargetDeviceIdArrayForm.set("sourceDeviceId", senderProfile.deviceId);
    invalidTargetDeviceIdArrayForm.set("targetDeviceIds", JSON.stringify([]));
    invalidTargetDeviceIdArrayForm.set(
      "files",
      new File([Buffer.from("gamma\n")], "gamma.txt", { type: "text/plain" }),
    );
    const invalidTargetDeviceIdArrayResponse = await fetch(`${relayHubBaseUrl}/items/file`, {
      method: "POST",
      body: invalidTargetDeviceIdArrayForm,
    });
    expect(invalidTargetDeviceIdArrayResponse.status).toBe(400);
    expect(await invalidTargetDeviceIdArrayResponse.json()).toMatchObject({
      error: expect.stringMatching(
        /Expected `targetDeviceIds` to be a non-empty JSON array of strings\./i,
      ),
    });

    const noFilesForm = new FormData();
    noFilesForm.set("sourceDeviceId", senderProfile.deviceId);
    noFilesForm.set("targetDeviceIds", JSON.stringify([receiverProfile.deviceId]));
    const noFilesResponse = await fetch(`${relayHubBaseUrl}/items/file`, {
      method: "POST",
      body: noFilesForm,
    });
    expect(noFilesResponse.status).toBe(400);
    expect(await noFilesResponse.json()).toMatchObject({
      error: expect.stringMatching(/Expected at least one uploaded file\./i),
    });

    const invalidFileFieldForm = new FormData();
    invalidFileFieldForm.set("sourceDeviceId", senderProfile.deviceId);
    invalidFileFieldForm.set("targetDeviceIds", JSON.stringify([receiverProfile.deviceId]));
    invalidFileFieldForm.set("files", "not-a-file");
    const invalidFileFieldResponse = await fetch(`${relayHubBaseUrl}/items/file`, {
      method: "POST",
      body: invalidFileFieldForm,
    });
    expect(invalidFileFieldResponse.status).toBe(400);
    expect(await invalidFileFieldResponse.json()).toMatchObject({
      error: expect.stringMatching(/Expected file uploads in the `files` form field\./i),
    });
  });
});

test("resource lookup routes reject unknown resources and invalid file downloads", async () => {
  await withRelayHubTestEnvironment(async ({ relayHubBaseUrl }) => {
    const senderProfile = await registerTestDevice({
      relayHubBaseUrl,
      nickname: "Developer CLI",
      platform: "cli",
    });
    const receiverProfile = await registerTestDevice({
      relayHubBaseUrl,
      nickname: "Developer iPhone Sim",
      platform: "ios",
    });

    const textItem = await parseOkResponse(
      new RpcClient(senderProfile.relayHubBaseUrl)
        .createDeviceRpcClient(senderProfile.deviceId)
        .sendText({
          text: "this delivery is not downloadable as a file",
          targetDeviceIds: [receiverProfile.deviceId],
        }),
    );
    const firstTextDelivery = textItem.deliveries[0];
    expect(firstTextDelivery).toBeDefined();
    assert(firstTextDelivery !== undefined);
    const deliveryId = firstTextDelivery.deliveryId;
    expect(deliveryId).toBeDefined();
    assert(deliveryId !== undefined);

    const missingDeliveryPromise = parseOkResponse(
      new RpcClient(receiverProfile.relayHubBaseUrl)
        .createDeviceRpcClient(receiverProfile.deviceId)
        .getDelivery({ deliveryId: "delivery_missing" }),
    );
    await expect(missingDeliveryPromise).rejects.toSatisfy(isParseResponseError);
    await expect(missingDeliveryPromise).rejects.toMatchObject({
      statusCode: 404,
      detail: {
        data: {
          error: expect.stringMatching(/Delivery not found\./i),
        },
      },
    });

    const missingItemPromise = parseOkResponse(
      new RpcClient(senderProfile.relayHubBaseUrl)
        .createDeviceRpcClient(senderProfile.deviceId)
        .getItem({ itemId: "item_missing" }),
    );
    await expect(missingItemPromise).rejects.toSatisfy(isParseResponseError);
    await expect(missingItemPromise).rejects.toMatchObject({
      statusCode: 404,
      detail: {
        data: {
          error: expect.stringMatching(/Item not found\./i),
        },
      },
    });

    const invalidDownloadPromise = parseOkResponse(
      new RpcClient(receiverProfile.relayHubBaseUrl)
        .createDeviceRpcClient(receiverProfile.deviceId)
        .downloadDelivery({ deliveryId: deliveryId }),
    );
    await expect(invalidDownloadPromise).rejects.toSatisfy(isParseResponseError);
    await expect(invalidDownloadPromise).rejects.toMatchObject({
      statusCode: 400,
      detail: {
        data: {
          error: expect.stringMatching(/not a file delivery/i),
        },
      },
    });
  });
});

test("collection routes only require explicit device parameters where needed", async () => {
  await withRelayHubTestEnvironment(async ({ relayHubBaseUrl }) => {
    const listDevicesResponse = await fetch(`${relayHubBaseUrl}/devices`);
    expect(listDevicesResponse.status).toBe(200);

    const listItemsResponse = await fetch(`${relayHubBaseUrl}/items`);
    expect(listItemsResponse.status).toBe(400);
    expect(await listItemsResponse.json()).toMatchObject({
      error: expect.stringMatching(/sourceDeviceId/i),
    });

    const listDeliveriesResponse = await fetch(`${relayHubBaseUrl}/deliveries`);
    expect(listDeliveriesResponse.status).toBe(400);
    expect(await listDeliveriesResponse.json()).toMatchObject({
      error: expect.stringMatching(/targetDeviceId/i),
    });
  });
});

test("relay hub CORS allows native app origins", async () => {
  await withRelayHubTestEnvironment(async ({ relayHubBaseUrl }) => {
    for (const origin of ["https://localhost", "tauri://localhost"]) {
      const listDevicesResponse = await fetch(`${relayHubBaseUrl}/devices`, {
        headers: { Origin: origin },
      });
      expect(listDevicesResponse.headers.get("access-control-allow-origin")).toBe(origin);

      const registerPreflightResponse = await fetch(`${relayHubBaseUrl}/devices/register`, {
        method: "OPTIONS",
        headers: {
          Origin: origin,
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers": "content-type",
        },
      });
      expect(registerPreflightResponse.status).toBe(204);
      expect(registerPreflightResponse.headers.get("access-control-allow-origin")).toBe(origin);
    }
  });
});

test("http client trims trailing slashes and preserves raw text and malformed JSON responses", async () => {
  await withRelayHubTestEnvironment(async ({ relayHubBaseUrl }) => {
    const registration = await parseOkResponse(
      new RpcClient(`${relayHubBaseUrl}/`).registerDevice({
        nickname: "Trailing Slash Device",
        platform: "cli",
      }),
    );
    expect(registration.relayHubBaseUrl).toBe(relayHubBaseUrl);
  });

  const port = await allocatePort();
  let requestCount = 0;
  const server = createHttpServer((_request: IncomingMessage, response: ServerResponse) => {
    requestCount += 1;
    if (requestCount === 1) {
      response.statusCode = 503;
      response.setHeader("content-type", "text/plain");
      response.end("temporary outage");

      return;
    }

    response.statusCode = 500;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ message: "shape does not match error schema" }));
  });
  await listenOnPort(server, port);

  try {
    const relayHubBaseUrl = `http://127.0.0.1:${port}/`;

    const textErrorPromise = parseOkResponse(
      new RpcClient(relayHubBaseUrl).registerDevice({ nickname: "Text Error", platform: "cli" }),
    );
    await expect(textErrorPromise).rejects.toSatisfy(isParseResponseError);
    await expect(textErrorPromise).rejects.toMatchObject({
      statusCode: 503,
      detail: {
        data: "temporary outage",
      },
    });

    const malformedJsonPromise = parseOkResponse(
      new RpcClient(relayHubBaseUrl).registerDevice({ nickname: "JSON Error", platform: "cli" }),
    );
    await expect(malformedJsonPromise).rejects.toSatisfy(isParseResponseError);
    await expect(malformedJsonPromise).rejects.toMatchObject({
      statusCode: 500,
      detail: {
        data: {
          message: "shape does not match error schema",
        },
      },
    });
  } finally {
    await util.promisify(server.close.bind(server))();
  }
});

test("server errors are normalized to JSON 500 responses", async () => {
  const rootDirectory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "content-relay-test-"));

  try {
    const port = await allocatePort();
    const relayHubBaseUrl = `http://127.0.0.1:${port}`;

    const diContainer = await createDependencyContainer({
      dataDirectory: path.join(rootDirectory, "relay-hub-data"),
      relayHubBaseUrl,
    });

    await runWithDiContainer(diContainer, async () => {
      const app = await createHonoApp();
      app.get("/boom", () => {
        throw new Error("boom");
      });

      const server = await startServer({ app, port });

      try {
        const genericErrorResponse = await fetch(`${relayHubBaseUrl}/boom`);
        expect(genericErrorResponse.status).toBe(500);
        expect(await genericErrorResponse.json()).toMatchObject({
          error: expect.stringMatching(/^boom$/i),
        });
      } finally {
        await server.stop();
      }
    });
  } finally {
    await fs.promises.rm(rootDirectory, { recursive: true, force: true });
  }
});

test("explicit target device ids send to every target", async () => {
  await withRelayHubTestEnvironment(async ({ relayHubBaseUrl }) => {
    const senderProfile = await registerTestDevice({
      relayHubBaseUrl,
      nickname: "Developer CLI",
      platform: "cli",
    });
    const iosProfile = await registerTestDevice({
      relayHubBaseUrl,
      nickname: "Developer iPhone Sim",
      platform: "ios",
    });
    const androidProfile = await registerTestDevice({
      relayHubBaseUrl,
      nickname: "Developer Pixel Sim",
      platform: "android",
    });
    const targetDeviceIds = [iosProfile.deviceId, androidProfile.deviceId];

    const textItem = await parseOkResponse(
      new RpcClient(senderProfile.relayHubBaseUrl)
        .createDeviceRpcClient(senderProfile.deviceId)
        .sendText({
          text: "explicit targets are required",
          targetDeviceIds,
        }),
    );
    expect(textItem.deliveries.map((delivery) => delivery.targetDeviceId).sort()).toEqual(
      targetDeviceIds.sort(),
    );
  });
});
