import { DetailedError, parseResponse } from "hono/client";
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

import {
  createDependencyContainer,
  createHonoApp,
  runWithDiContainer,
  startServer,
} from "@content-relay/backend";
import type { DeliveryListState, DeviceSummary } from "@content-relay/shared";

import { createRelayHttpClient } from "#pkg/http-client.ts";
import { rpcClient } from "#pkg/rpc-client.ts";

import {
  allocatePort,
  createAuthenticatedClient,
  createAuthHeaders,
  listenOnPort,
  receivePendingDeliveries,
  registerProfile,
  withRelayTestEnvironment,
  writeDownloadedDelivery,
} from "./test-helpers.ts";

test("milestone 0 flow covers registration, send, receive, viewed, and file download", async () => {
  await withRelayTestEnvironment(async ({ profileStore, rootDirectory, serverBaseUrl }) => {
    const senderProfile = await registerProfile({
      profileStore,
      serverBaseUrl,
      nickname: "Developer CLI",
      platform: "cli",
      makeActive: true,
    });
    const iosProfile = await registerProfile({
      profileStore,
      serverBaseUrl,
      nickname: "Developer iPhone Sim",
      platform: "ios",
    });
    const androidProfile = await registerProfile({
      profileStore,
      serverBaseUrl,
      nickname: "Developer Pixel Sim",
      platform: "android-pwa",
    });

    await profileStore.rememberTargets(senderProfile.profileId, [
      iosProfile.deviceId,
      androidProfile.deviceId,
    ]);

    const textItem = await parseResponse(
      rpcClient.sendText(senderProfile, {
        text: "hello from the terminal",
        targetDeviceIds: [iosProfile.deviceId, androidProfile.deviceId],
      }),
    );

    expect(textItem.deliveries).toHaveLength(2);

    const firstIosFetch = await receivePendingDeliveries(iosProfile, profileStore, {
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

    const duplicateIosFetch = await receivePendingDeliveries(iosProfile, profileStore, {
      acknowledge: false,
      simulatePlatform: true,
      deduplicate: true,
    });
    expect(duplicateIosFetch).toHaveLength(1);
    const duplicateIosDelivery = duplicateIosFetch[0];
    expect(duplicateIosDelivery).toBeDefined();
    assert(duplicateIosDelivery !== undefined);
    expect(duplicateIosDelivery.wasDuplicate).toBe(true);

    const acknowledgedIosFetch = await receivePendingDeliveries(iosProfile, profileStore, {
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

    const viewedDelivery = await parseResponse(
      rpcClient.markDeliveryViewed(iosProfile, iosDeliveryId),
    );
    expect(viewedDelivery.delivery.state).toBe("viewed");

    const itemAfterOpen = await parseResponse(
      rpcClient.getItem(senderProfile, textItem.item.itemId),
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

    const fileItem = await parseResponse(
      rpcClient.sendFiles(senderProfile, {
        targetDeviceIds: [androidProfile.deviceId],
        title: "Trip docs",
        files: [{ filePath: alphaFilePath }, { filePath: betaFilePath }],
      }),
    );
    expect(fileItem.item.type).toBe("file");
    expect(fileItem.item.files).toHaveLength(2);

    const androidPendingBeforeAck = await parseResponse(
      rpcClient.fetchPendingDeliveries(androidProfile),
    );
    expect(androidPendingBeforeAck.deliveries).toHaveLength(2);

    const androidReceive = await receivePendingDeliveries(androidProfile, profileStore, {
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

    const download = await parseResponse(
      rpcClient.downloadDelivery(androidProfile, fileDelivery.delivery.deliveryId),
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
  });
});

test("invite codes are single-use", async () => {
  await withRelayTestEnvironment(async ({ serverBaseUrl }) => {
    const invite = await parseResponse(
      rpcClient.createInvite(serverBaseUrl, { expiresInSeconds: 900 }),
    );

    await parseResponse(
      rpcClient.registerDevice(serverBaseUrl, {
        nickname: "Developer CLI",
        platform: "cli",
        invite: invite.inviteCode,
      }),
    );

    const registerAgainPromise = parseResponse(
      rpcClient.registerDevice(serverBaseUrl, {
        nickname: "Developer iPhone Sim",
        platform: "ios",
        invite: invite.inviteCode,
      }),
    );
    await expect(registerAgainPromise).rejects.toThrow(DetailedError);
    await expect(registerAgainPromise).rejects.toMatchObject({
      statusCode: 400,
      detail: {
        data: {
          error: expect.stringMatching(/already been used/i),
        },
      },
    });
  });
});

test("text send rejects a single-line URL payload", async () => {
  await withRelayTestEnvironment(async ({ profileStore, serverBaseUrl }) => {
    const senderProfile = await registerProfile({
      profileStore,
      serverBaseUrl,
      nickname: "Developer CLI",
      platform: "cli",
      makeActive: true,
    });
    const receiverProfile = await registerProfile({
      profileStore,
      serverBaseUrl,
      nickname: "Developer iPhone Sim",
      platform: "ios",
    });

    const sendTextPromise = parseResponse(
      rpcClient.sendText(senderProfile, {
        text: "https://example.com/interesting-link",
        targetDeviceIds: [receiverProfile.deviceId],
      }),
    );
    await expect(sendTextPromise).rejects.toThrow(DetailedError);
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
  await withRelayTestEnvironment(async ({ profileStore, serverBaseUrl }) => {
    const senderProfile = await registerProfile({
      profileStore,
      serverBaseUrl,
      nickname: "Developer CLI",
      platform: "cli",
      makeActive: true,
    });
    const macosProfile = await registerProfile({
      profileStore,
      serverBaseUrl,
      nickname: "Developer Mac",
      platform: "macos",
    });

    await parseResponse(
      rpcClient.sendText(senderProfile, {
        text: "Open this note immediately",
        targetDeviceIds: [macosProfile.deviceId],
      }),
    );
    await parseResponse(
      rpcClient.sendUrl(senderProfile, {
        url: "https://example.com/macos-auto-open",
        targetDeviceIds: [macosProfile.deviceId],
      }),
    );

    const deliveries = await receivePendingDeliveries(macosProfile, profileStore, {
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

    const viewedDeliveries = await parseResponse(
      rpcClient.listDeliveries(macosProfile, { state: "viewed", limit: 10 }),
    );
    expect(viewedDeliveries.deliveries).toHaveLength(2);

    const pendingDeliveries = await parseResponse(
      rpcClient.listDeliveries(macosProfile, { state: "pending", limit: 10 }),
    );
    expect(pendingDeliveries.deliveries).toHaveLength(0);
  });
});

test("deleting a device invalidates its authentication and hides it from active device listings", async () => {
  await withRelayTestEnvironment(async ({ profileStore, serverBaseUrl }) => {
    const senderProfile = await registerProfile({
      profileStore,
      serverBaseUrl,
      nickname: "Developer CLI",
      platform: "cli",
      makeActive: true,
    });
    const receiverProfile = await registerProfile({
      profileStore,
      serverBaseUrl,
      nickname: "Developer iPhone Sim",
      platform: "ios",
    });

    const removeResponse = await createAuthenticatedClient(receiverProfile).devices[
      ":deviceId"
    ].$delete({
      param: { deviceId: receiverProfile.deviceId },
    });
    expect(removeResponse.status).toBe(204);

    const listDeliveriesPromise = parseResponse(
      rpcClient.listDeliveries(receiverProfile, { state: "all", limit: 10 }),
    );
    await expect(listDeliveriesPromise).rejects.toThrow(DetailedError);
    await expect(listDeliveriesPromise).rejects.toMatchObject({
      statusCode: 401,
      detail: {
        data: {
          error: expect.stringMatching(/authentication failed/i),
        },
      },
    });

    const devices = await parseResponse(rpcClient.listDevices(senderProfile));
    expect(devices.map((device) => device.deviceId)).not.toContain(receiverProfile.deviceId);
  });
});

test("push tokens can be upserted for the authenticated device", async () => {
  await withRelayTestEnvironment(async ({ profileStore, serverBaseUrl }) => {
    const profile = await registerProfile({
      profileStore,
      serverBaseUrl,
      nickname: "Developer iPhone Sim",
      platform: "ios",
    });

    const upsertResponse1 = await createAuthenticatedClient(profile).devices[":deviceId"][
      "push-token"
    ].$post({
      param: { deviceId: profile.deviceId },
      json: { token: "ExponentPushToken[device-token-1]" },
    });
    expect(upsertResponse1.status).toBe(204);

    const upsertResponse2 = await createAuthenticatedClient(profile).devices[":deviceId"][
      "push-token"
    ].$post({
      param: { deviceId: profile.deviceId },
      json: { token: "ExponentPushToken[device-token-2]" },
    });
    expect(upsertResponse2.status).toBe(204);

    const removeResponse = await createAuthenticatedClient(profile).devices[":deviceId"].$delete({
      param: { deviceId: profile.deviceId },
    });
    expect(removeResponse.status).toBe(204);

    const upsertDeletedDevicePushTokenPromise = parseResponse(
      createAuthenticatedClient(profile).devices[":deviceId"]["push-token"].$post({
        param: { deviceId: profile.deviceId },
        json: { token: "ExponentPushToken[device-token-3]" },
      }),
    );
    await expect(upsertDeletedDevicePushTokenPromise).rejects.toThrow(DetailedError);
    await expect(upsertDeletedDevicePushTokenPromise).rejects.toMatchObject({
      statusCode: 401,
      detail: {
        data: {
          error: expect.stringMatching(/authentication failed/i),
        },
      },
    });
  });
});

test("device routes support rename, listing, and same-device authorization guards", async () => {
  await withRelayTestEnvironment(async ({ profileStore, serverBaseUrl }) => {
    const senderProfile = await registerProfile({
      profileStore,
      serverBaseUrl,
      nickname: "Developer CLI",
      platform: "cli",
      makeActive: true,
    });
    const receiverProfile = await registerProfile({
      profileStore,
      serverBaseUrl,
      nickname: "Developer iPhone Sim",
      platform: "ios",
    });

    const renameResponse = await createAuthenticatedClient(receiverProfile).devices[
      ":deviceId"
    ].$patch({
      param: { deviceId: receiverProfile.deviceId },
      json: { nickname: "Renamed iPhone Sim" },
    });
    expect(renameResponse.status).toBe(200);
    const renamedDevice = (await renameResponse.json()) as DeviceSummary;
    expect(renamedDevice.nickname).toBe("Renamed iPhone Sim");

    const devices = await parseResponse(rpcClient.listDevices(senderProfile));
    expect(devices).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          deviceId: receiverProfile.deviceId,
          nickname: "Renamed iPhone Sim",
        }),
      ]),
    );

    const renameAnotherDevicePromise = parseResponse(
      createAuthenticatedClient(receiverProfile).devices[":deviceId"].$patch({
        param: { deviceId: senderProfile.deviceId },
        json: { nickname: "Malicious Rename" },
      }),
    );
    await expect(renameAnotherDevicePromise).rejects.toThrow(DetailedError);
    await expect(renameAnotherDevicePromise).rejects.toMatchObject({
      statusCode: 403,
      detail: {
        data: {
          error: expect.stringMatching(/Cannot rename another device\./i),
        },
      },
    });

    const deleteAnotherDevicePromise = parseResponse(
      createAuthenticatedClient(receiverProfile).devices[":deviceId"].$delete({
        param: { deviceId: senderProfile.deviceId },
      }),
    );
    await expect(deleteAnotherDevicePromise).rejects.toThrow(DetailedError);
    await expect(deleteAnotherDevicePromise).rejects.toMatchObject({
      statusCode: 403,
      detail: {
        data: {
          error: expect.stringMatching(/Cannot remove another device\./i),
        },
      },
    });

    const updateAnotherDevicePushTokenPromise = parseResponse(
      createAuthenticatedClient(receiverProfile).devices[":deviceId"]["push-token"].$post({
        param: { deviceId: senderProfile.deviceId },
        json: { token: "ExponentPushToken[cross-device]" },
      }),
    );
    await expect(updateAnotherDevicePushTokenPromise).rejects.toThrow(DetailedError);
    await expect(updateAnotherDevicePushTokenPromise).rejects.toMatchObject({
      statusCode: 403,
      detail: {
        data: {
          error: expect.stringMatching(/Cannot update another device\./i),
        },
      },
    });
  });
});

test("item and delivery routes list and fetch the authenticated device resources", async () => {
  await withRelayTestEnvironment(async ({ profileStore, serverBaseUrl }) => {
    const senderProfile = await registerProfile({
      profileStore,
      serverBaseUrl,
      nickname: "Developer CLI",
      platform: "cli",
      makeActive: true,
    });
    const receiverProfile = await registerProfile({
      profileStore,
      serverBaseUrl,
      nickname: "Developer iPhone Sim",
      platform: "ios",
    });

    const firstItem = await parseResponse(
      rpcClient.sendText(senderProfile, {
        text: "first delivery becomes delivered",
        targetDeviceIds: [receiverProfile.deviceId],
      }),
    );
    const secondItem = await parseResponse(
      rpcClient.sendText(senderProfile, {
        text: "second delivery stays pending",
        targetDeviceIds: [receiverProfile.deviceId],
      }),
    );

    const pendingDeliveries = await parseResponse(
      rpcClient.fetchPendingDeliveries(receiverProfile),
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

    const loadedDelivery = await parseResponse(
      rpcClient.getDelivery(receiverProfile, firstDeliveryId),
    );
    expect(loadedDelivery.delivery.deliveryId).toBe(firstDeliveryId);
    expect(loadedDelivery.delivery.item.itemId).toBe(firstItem.item.itemId);

    const acknowledgedDelivery = await parseResponse(
      rpcClient.acknowledgeDelivery(receiverProfile, firstDeliveryId),
    );
    expect(acknowledgedDelivery.delivery.state).toBe("delivered");

    const deliveredDeliveries = await parseResponse(
      rpcClient.listDeliveries(receiverProfile, { state: "delivered", limit: 10 }),
    );
    expect(deliveredDeliveries.deliveries).toHaveLength(1);
    const deliveredDelivery = deliveredDeliveries.deliveries[0];
    expect(deliveredDelivery).toBeDefined();
    assert(deliveredDelivery !== undefined);
    expect(deliveredDelivery.deliveryId).toBe(firstDeliveryId);

    const allDeliveries = await parseResponse(
      rpcClient.listDeliveries(receiverProfile, { state: "all", limit: 10 }),
    );
    expect(allDeliveries.deliveries).toHaveLength(2);
    expect(allDeliveries.deliveries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ itemId: firstItem.item.itemId, state: "delivered" }),
        expect.objectContaining({ itemId: secondItem.item.itemId, state: "pending" }),
      ]),
    );

    const items = await parseResponse(rpcClient.listItems(senderProfile, { limit: 10 }));
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

test("file uploads reject empty payloads and write single-file downloads", async () => {
  await withRelayTestEnvironment(async ({ profileStore, rootDirectory, serverBaseUrl }) => {
    const senderProfile = await registerProfile({
      profileStore,
      serverBaseUrl,
      nickname: "Developer CLI",
      platform: "cli",
      makeActive: true,
    });
    const receiverProfile = await registerProfile({
      profileStore,
      serverBaseUrl,
      nickname: "Developer Android Sim",
      platform: "android-pwa",
    });

    const emptyUploadResponse = await rpcClient.sendFiles(senderProfile, {
      targetDeviceIds: [receiverProfile.deviceId],
      files: [],
    });
    expect(emptyUploadResponse.status).toBe(400);
    expect(await emptyUploadResponse.json()).toMatchObject({
      error: expect.stringMatching(/Expected at least one uploaded file\./i),
    });

    const gammaFilePath = path.join(rootDirectory, "gamma.txt");
    await fs.promises.writeFile(gammaFilePath, "gamma\n", "utf8");

    const fileItem = await parseResponse(
      rpcClient.sendFiles(senderProfile, {
        targetDeviceIds: [receiverProfile.deviceId],
        files: [{ filePath: gammaFilePath }],
      }),
    );
    const firstFileDelivery = fileItem.deliveries[0];
    expect(firstFileDelivery).toBeDefined();
    assert(firstFileDelivery !== undefined);
    const fileDeliveryId = firstFileDelivery.deliveryId;
    expect(fileDeliveryId).toBeDefined();
    assert(fileDeliveryId !== undefined);

    const acknowledgeResponse = await rpcClient.acknowledgeDelivery(
      receiverProfile,
      fileDeliveryId,
    );
    expect(acknowledgeResponse.status).toBe(200);

    const download = await parseResponse(
      rpcClient.downloadDelivery(receiverProfile, fileDeliveryId),
    );

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
  await withRelayTestEnvironment(async ({ profileStore, serverBaseUrl }) => {
    const senderProfile = await registerProfile({
      profileStore,
      serverBaseUrl,
      nickname: "Developer CLI",
      platform: "cli",
      makeActive: true,
    });
    const iosProfile = await registerProfile({
      profileStore,
      serverBaseUrl,
      nickname: "Developer iPhone Sim",
      platform: "ios",
    });
    const macosProfile = await registerProfile({
      profileStore,
      serverBaseUrl,
      nickname: "Developer Mac",
      platform: "macos",
    });

    await parseResponse(
      rpcClient.sendText(senderProfile, {
        text: "do not simulate this delivery",
        targetDeviceIds: [iosProfile.deviceId],
      }),
    );

    const firstIosReceive = await receivePendingDeliveries(iosProfile, profileStore, {
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

    const secondIosReceive = await receivePendingDeliveries(iosProfile, profileStore, {
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

    await parseResponse(
      rpcClient.sendText(senderProfile, {
        text: "macos auto-view requires acknowledgement",
        targetDeviceIds: [macosProfile.deviceId],
      }),
    );

    const firstMacosReceive = await receivePendingDeliveries(macosProfile, profileStore, {
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

    const pendingMacosDelivery = await parseResponse(
      rpcClient.getDelivery(macosProfile, macosDeliveryId),
    );
    expect(pendingMacosDelivery.delivery.state).toBe("pending");

    const duplicateAcknowledgedMacosReceive = await receivePendingDeliveries(
      macosProfile,
      profileStore,
      {
        acknowledge: true,
        simulatePlatform: true,
        deduplicate: true,
      },
    );
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
  await withRelayTestEnvironment(async ({ profileStore, serverBaseUrl }) => {
    const senderProfile = await registerProfile({
      profileStore,
      serverBaseUrl,
      nickname: "Developer CLI",
      platform: "cli",
      makeActive: true,
    });
    const receiverProfile = await registerProfile({
      profileStore,
      serverBaseUrl,
      nickname: "Developer iPhone Sim",
      platform: "ios",
    });

    const invalidInviteResponse = await createRelayHttpClient({ serverBaseUrl }).invites.$post({
      json: { expiresInSeconds: 0 },
    });
    expect(invalidInviteResponse.status).toBe(400);
    expect(await invalidInviteResponse.json()).toMatchObject({
      error: expect.stringMatching(/(greater than 0|>0)/i),
    });

    const invalidRegisterResponse = await createRelayHttpClient({
      serverBaseUrl,
    }).devices.register.$post({
      json: { nickname: "   ", platform: "ios", invite: "invite_code" },
    });
    expect(invalidRegisterResponse.status).toBe(400);
    expect(await invalidRegisterResponse.json()).toMatchObject({
      error: expect.stringMatching(/(at least 1 character|>=1 characters)/i),
    });

    const invalidRenameResponse = await createAuthenticatedClient(senderProfile).devices[
      ":deviceId"
    ].$patch({
      param: { deviceId: senderProfile.deviceId },
      json: { nickname: "   " },
    });
    expect(invalidRenameResponse.status).toBe(400);
    expect(await invalidRenameResponse.json()).toMatchObject({
      error: expect.stringMatching(/(at least 1 character|>=1 characters)/i),
    });

    const invalidPushTokenResponse = await createAuthenticatedClient(senderProfile).devices[
      ":deviceId"
    ]["push-token"].$post({
      param: { deviceId: senderProfile.deviceId },
      json: { token: "   " },
    });
    expect(invalidPushTokenResponse.status).toBe(400);
    expect(await invalidPushTokenResponse.json()).toMatchObject({
      error: expect.stringMatching(/(at least 1 character|>=1 characters)/i),
    });

    const invalidTextItemResponse = await createAuthenticatedClient(senderProfile).items.text.$post(
      {
        json: { text: "", targetDeviceIds: [receiverProfile.deviceId] },
      },
    );
    expect(invalidTextItemResponse.status).toBe(400);
    expect(await invalidTextItemResponse.json()).toMatchObject({
      error: expect.stringMatching(/(at least 1 character|>=1 characters)/i),
    });

    const invalidUrlItemResponse = await createAuthenticatedClient(senderProfile).items.url.$post({
      json: { url: "not-a-url", targetDeviceIds: [receiverProfile.deviceId] },
    });
    expect(invalidUrlItemResponse.status).toBe(400);
    expect(await invalidUrlItemResponse.json()).toMatchObject({
      error: expect.stringMatching(/valid url/i),
    });

    const invalidDeliveryStateResponse = await createAuthenticatedClient(
      receiverProfile,
    ).deliveries.$get({
      query: {
        // intentional type cast to allow invalid value
        state: "invalid" as DeliveryListState,
        limit: "10",
      },
    });
    expect(invalidDeliveryStateResponse.status).toBe(400);
    expect(await invalidDeliveryStateResponse.json()).toMatchObject({
      error: expect.stringMatching(/Invalid option/i),
    });

    const invalidDeliveryLimitResponse = await createAuthenticatedClient(
      receiverProfile,
    ).deliveries.$get({
      query: { limit: "0" },
    });
    expect(invalidDeliveryLimitResponse.status).toBe(400);
    expect(await invalidDeliveryLimitResponse.json()).toMatchObject({
      error: expect.stringMatching(/(greater than 0|>0)/i),
    });

    const invalidItemLimitResponse = await createAuthenticatedClient(senderProfile).items.$get({
      query: { limit: "0" },
    });
    expect(invalidItemLimitResponse.status).toBe(400);
    expect(await invalidItemLimitResponse.json()).toMatchObject({
      error: expect.stringMatching(/(greater than 0|>0)/i),
    });

    const missingTargetDeviceIdsForm = new FormData();
    missingTargetDeviceIdsForm.set(
      "files",
      new File([Buffer.from("alpha\n")], "alpha.txt", { type: "text/plain" }),
    );
    const missingTargetDeviceIdsResponse = await fetch(`${serverBaseUrl}/items/file`, {
      method: "POST",
      headers: createAuthHeaders(senderProfile),
      body: missingTargetDeviceIdsForm,
    });
    expect(missingTargetDeviceIdsResponse.status).toBe(400);
    expect(await missingTargetDeviceIdsResponse.json()).toMatchObject({
      error: expect.stringMatching(/Expected `targetDeviceIds` JSON form field\./i),
    });

    const invalidJsonTargetDeviceIdsForm = new FormData();
    invalidJsonTargetDeviceIdsForm.set("targetDeviceIds", "not-json");
    invalidJsonTargetDeviceIdsForm.set(
      "files",
      new File([Buffer.from("beta\n")], "beta.txt", { type: "text/plain" }),
    );
    const invalidJsonTargetDeviceIdsResponse = await fetch(`${serverBaseUrl}/items/file`, {
      method: "POST",
      headers: createAuthHeaders(senderProfile),
      body: invalidJsonTargetDeviceIdsForm,
    });
    expect(invalidJsonTargetDeviceIdsResponse.status).toBe(400);
    expect(await invalidJsonTargetDeviceIdsResponse.json()).toMatchObject({
      error: expect.stringMatching(/Expected `targetDeviceIds` to be valid JSON\./i),
    });

    const invalidTargetDeviceIdArrayForm = new FormData();
    invalidTargetDeviceIdArrayForm.set("targetDeviceIds", JSON.stringify([]));
    invalidTargetDeviceIdArrayForm.set(
      "files",
      new File([Buffer.from("gamma\n")], "gamma.txt", { type: "text/plain" }),
    );
    const invalidTargetDeviceIdArrayResponse = await fetch(`${serverBaseUrl}/items/file`, {
      method: "POST",
      headers: createAuthHeaders(senderProfile),
      body: invalidTargetDeviceIdArrayForm,
    });
    expect(invalidTargetDeviceIdArrayResponse.status).toBe(400);
    expect(await invalidTargetDeviceIdArrayResponse.json()).toMatchObject({
      error: expect.stringMatching(
        /Expected `targetDeviceIds` to be a non-empty JSON array of strings\./i,
      ),
    });

    const noFilesForm = new FormData();
    noFilesForm.set("targetDeviceIds", JSON.stringify([receiverProfile.deviceId]));
    const noFilesResponse = await fetch(`${serverBaseUrl}/items/file`, {
      method: "POST",
      headers: createAuthHeaders(senderProfile),
      body: noFilesForm,
    });
    expect(noFilesResponse.status).toBe(400);
    expect(await noFilesResponse.json()).toMatchObject({
      error: expect.stringMatching(/Expected at least one uploaded file\./i),
    });

    const invalidFileFieldForm = new FormData();
    invalidFileFieldForm.set("targetDeviceIds", JSON.stringify([receiverProfile.deviceId]));
    invalidFileFieldForm.set("files", "not-a-file");
    const invalidFileFieldResponse = await fetch(`${serverBaseUrl}/items/file`, {
      method: "POST",
      headers: createAuthHeaders(senderProfile),
      body: invalidFileFieldForm,
    });
    expect(invalidFileFieldResponse.status).toBe(400);
    expect(await invalidFileFieldResponse.json()).toMatchObject({
      error: expect.stringMatching(/Expected file uploads in the `files` form field\./i),
    });
  });
});

test("resource lookup routes reject unknown resources and invalid file downloads", async () => {
  await withRelayTestEnvironment(async ({ profileStore, serverBaseUrl }) => {
    const senderProfile = await registerProfile({
      profileStore,
      serverBaseUrl,
      nickname: "Developer CLI",
      platform: "cli",
      makeActive: true,
    });
    const receiverProfile = await registerProfile({
      profileStore,
      serverBaseUrl,
      nickname: "Developer iPhone Sim",
      platform: "ios",
    });

    const textItem = await parseResponse(
      rpcClient.sendText(senderProfile, {
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

    const missingDeliveryPromise = parseResponse(
      rpcClient.getDelivery(receiverProfile, "delivery_missing"),
    );
    await expect(missingDeliveryPromise).rejects.toThrow(DetailedError);
    await expect(missingDeliveryPromise).rejects.toMatchObject({
      statusCode: 404,
      detail: {
        data: {
          error: expect.stringMatching(/Delivery not found\./i),
        },
      },
    });

    const missingItemPromise = parseResponse(rpcClient.getItem(senderProfile, "item_missing"));
    await expect(missingItemPromise).rejects.toThrow(DetailedError);
    await expect(missingItemPromise).rejects.toMatchObject({
      statusCode: 404,
      detail: {
        data: {
          error: expect.stringMatching(/Item not found\./i),
        },
      },
    });

    const invalidDownloadPromise = parseResponse(
      rpcClient.downloadDelivery(receiverProfile, deliveryId),
    );
    await expect(invalidDownloadPromise).rejects.toThrow(DetailedError);
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

test("items, deliveries, and devices collection routes reject unauthenticated requests", async () => {
  await withRelayTestEnvironment(async ({ serverBaseUrl }) => {
    const client = createRelayHttpClient({ serverBaseUrl });

    const listDevicesPromise = parseResponse(client.devices.$get());
    await expect(listDevicesPromise).rejects.toThrow(DetailedError);
    await expect(listDevicesPromise).rejects.toMatchObject({
      statusCode: 401,
      detail: {
        data: {
          error: expect.stringMatching(/Missing device authentication headers\./i),
        },
      },
    });

    const listItemsPromise = parseResponse(client.items.$get({ query: {} }));
    await expect(listItemsPromise).rejects.toThrow(DetailedError);
    await expect(listItemsPromise).rejects.toMatchObject({
      statusCode: 401,
      detail: {
        data: {
          error: expect.stringMatching(/Missing device authentication headers\./i),
        },
      },
    });

    const listDeliveriesWithoutAuthPromise = parseResponse(client.deliveries.$get({ query: {} }));
    await expect(listDeliveriesWithoutAuthPromise).rejects.toThrow(DetailedError);
    await expect(listDeliveriesWithoutAuthPromise).rejects.toMatchObject({
      statusCode: 401,
      detail: {
        data: {
          error: expect.stringMatching(/Missing device authentication headers\./i),
        },
      },
    });
  });
});

test("http client trims trailing slashes and preserves raw text and malformed JSON responses", async () => {
  await withRelayTestEnvironment(async ({ serverBaseUrl }) => {
    const invite = await parseResponse(
      createRelayHttpClient({
        serverBaseUrl: `${serverBaseUrl}/`,
      }).invites.$post({
        json: { expiresInSeconds: 900 },
      }),
    );
    expect(invite.inviteCode).toBeTruthy();

    const registration = await parseResponse(
      createRelayHttpClient({
        serverBaseUrl: `${serverBaseUrl}/`,
      }).devices.register.$post({
        json: {
          nickname: "Trailing Slash Device",
          platform: "cli",
          invite: invite.inviteCode,
        },
      }),
    );
    expect(registration.serverBaseUrl).toBe(serverBaseUrl);
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
    const client = createRelayHttpClient({ serverBaseUrl: `http://127.0.0.1:${port}/` });

    const textErrorPromise = parseResponse(
      client.invites.$post({ json: { expiresInSeconds: 900 } }),
    );
    await expect(textErrorPromise).rejects.toThrow(DetailedError);
    await expect(textErrorPromise).rejects.toMatchObject({
      statusCode: 503,
      detail: {
        data: "temporary outage",
      },
    });

    const malformedJsonPromise = parseResponse(
      client.invites.$post({ json: { expiresInSeconds: 900 } }),
    );
    await expect(malformedJsonPromise).rejects.toThrow(DetailedError);
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
    const serverBaseUrl = `http://127.0.0.1:${port}`;

    const diContainer = await createDependencyContainer({
      dataDirectory: path.join(rootDirectory, "server-data"),
      serverBaseUrl,
    });

    await runWithDiContainer(diContainer, async () => {
      const app = await createHonoApp();
      app.get("/boom", () => {
        throw new Error("boom");
      });

      const server = await startServer({ app, port });

      try {
        const genericErrorResponse = await fetch(`${serverBaseUrl}/boom`);
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

test("profile store reuses remembered targets when no explicit targets are provided", async () => {
  await withRelayTestEnvironment(async ({ profileStore, serverBaseUrl }) => {
    const senderProfile = await registerProfile({
      profileStore,
      serverBaseUrl,
      nickname: "Developer CLI",
      platform: "cli",
      makeActive: true,
    });
    const iosProfile = await registerProfile({
      profileStore,
      serverBaseUrl,
      nickname: "Developer iPhone Sim",
      platform: "ios",
    });
    const androidProfile = await registerProfile({
      profileStore,
      serverBaseUrl,
      nickname: "Developer Pixel Sim",
      platform: "android-pwa",
    });

    await profileStore.rememberTargets(senderProfile.profileId, [
      iosProfile.deviceId,
      androidProfile.deviceId,
      iosProfile.deviceId,
    ]);

    const resolvedTargets = await profileStore.resolveTargetDeviceIds(
      senderProfile.profileId,
      undefined,
    );
    expect(resolvedTargets).toEqual([iosProfile.deviceId, androidProfile.deviceId]);

    const textItem = await parseResponse(
      rpcClient.sendText(senderProfile, {
        text: "last used targets still apply",
        targetDeviceIds: resolvedTargets,
      }),
    );
    expect(textItem.deliveries.map((delivery) => delivery.targetDeviceId).sort()).toEqual(
      [iosProfile.deviceId, androidProfile.deviceId].sort(),
    );
  });
});
