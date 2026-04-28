import fs from "node:fs";
import {
  createServer as createHttpServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";

import {
  createDependencyContainer,
  createHonoApp,
  runWithDiContainer,
  startServer,
} from "@content-relay/backend";
import { errorResponseSchema, type DevicePlatform } from "@content-relay/shared";

import { LocalDeviceProfileStore, type LocalDeviceProfile } from "#pkg/profile-store.ts";
import { RelayRpcClient } from "#pkg/rpc-client.ts";

const cleanupPaths: string[] = [];

afterEach(async () => {
  await Promise.all(
    cleanupPaths.splice(0).map(async (directoryPath) => {
      await fs.promises.rm(directoryPath, { recursive: true, force: true });
    }),
  );
});

test("milestone 0 flow covers registration, send, receive, viewed, and file download", async () => {
  await withRelayTestEnvironment(async ({ client, profileStore, rootDirectory, serverBaseUrl }) => {
    const senderProfile = await registerProfile({
      client,
      profileStore,
      serverBaseUrl,
      nickname: "Developer CLI",
      platform: "cli",
      makeActive: true,
    });
    const iosProfile = await registerProfile({
      client,
      profileStore,
      serverBaseUrl,
      nickname: "Developer iPhone Sim",
      platform: "ios",
    });
    const androidProfile = await registerProfile({
      client,
      profileStore,
      serverBaseUrl,
      nickname: "Developer Pixel Sim",
      platform: "android-pwa",
    });

    await profileStore.rememberTargets(senderProfile.profileId, [
      iosProfile.deviceId,
      androidProfile.deviceId,
    ]);

    const textItem = await client.sendText(senderProfile, {
      text: "hello from the terminal",
      targetDeviceIds: [iosProfile.deviceId, androidProfile.deviceId],
    });

    expect(textItem.deliveries).toHaveLength(2);

    const firstIosFetch = await client.receivePendingDeliveries(iosProfile, profileStore, {
      acknowledge: false,
      simulatePlatform: true,
      deduplicate: true,
    });
    expect(firstIosFetch).toHaveLength(1);
    expect(firstIosFetch[0]?.wasDuplicate).toBe(false);
    expect(firstIosFetch[0]?.simulation?.action).toBe("notification-created");

    const duplicateIosFetch = await client.receivePendingDeliveries(iosProfile, profileStore, {
      acknowledge: false,
      simulatePlatform: true,
      deduplicate: true,
    });
    expect(duplicateIosFetch).toHaveLength(1);
    expect(duplicateIosFetch[0]?.wasDuplicate).toBe(true);

    const acknowledgedIosFetch = await client.receivePendingDeliveries(iosProfile, profileStore, {
      acknowledge: true,
      simulatePlatform: true,
      deduplicate: true,
    });
    expect(acknowledgedIosFetch[0]?.delivery.state).toBe("delivered");

    const iosDeliveryId = acknowledgedIosFetch[0]?.delivery.deliveryId;
    expect(iosDeliveryId).toBeDefined();
    if (iosDeliveryId === undefined) {
      throw new Error("Expected an iOS delivery id.");
    }

    const viewedDelivery = await client.markDeliveryViewed(iosProfile, iosDeliveryId);
    expect(viewedDelivery.delivery.state).toBe("viewed");

    const itemAfterOpen = await client.getItem(senderProfile, textItem.item.itemId);
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

    const fileItem = await client.sendFiles(senderProfile, {
      targetDeviceIds: [androidProfile.deviceId],
      title: "Trip docs",
      files: [{ filePath: alphaFilePath }, { filePath: betaFilePath }],
    });
    expect(fileItem.item.type).toBe("file");
    expect(fileItem.item.files).toHaveLength(2);

    const androidPendingBeforeAck = await client.fetchPendingDeliveries(androidProfile);
    expect(androidPendingBeforeAck.deliveries).toHaveLength(2);

    const androidReceive = await client.receivePendingDeliveries(androidProfile, profileStore, {
      acknowledge: true,
      simulatePlatform: true,
      deduplicate: true,
    });
    expect(androidReceive).toHaveLength(2);
    expect(androidReceive[0]?.delivery.state).toBe("delivered");

    const fileDelivery = androidReceive.find(
      (entry) => entry.delivery.item.itemId === fileItem.item.itemId,
    );
    expect(fileDelivery).toBeDefined();
    if (fileDelivery === undefined) {
      throw new Error("Expected a file delivery for the Android profile.");
    }

    const download = await client.downloadDelivery(
      androidProfile,
      fileDelivery.delivery.deliveryId,
    );
    const outputPaths = await client.writeDownloadedDelivery(
      download,
      path.join(rootDirectory, "downloads"),
    );
    expect(outputPaths).toHaveLength(2);

    const downloadedAlpha = await fs.promises.readFile(outputPaths[0] ?? "", "utf8");
    const downloadedBeta = await fs.promises.readFile(outputPaths[1] ?? "", "utf8");
    expect(downloadedAlpha).toBe("alpha\n");
    expect(downloadedBeta).toBe("beta\n");
  });
});

test("invite codes are single-use", async () => {
  await withRelayTestEnvironment(async ({ client, serverBaseUrl }) => {
    const invite = await client.createInvite(serverBaseUrl, { expiresInSeconds: 900 });

    await client.registerDevice(serverBaseUrl, {
      nickname: "Developer CLI",
      platform: "cli",
      invite: invite.inviteCode,
    });

    await expect(
      client.registerDevice(serverBaseUrl, {
        nickname: "Developer iPhone Sim",
        platform: "ios",
        invite: invite.inviteCode,
      }),
    ).rejects.toThrow(/already been used/i);
  });
});

test("text send rejects a single-line URL payload", async () => {
  await withRelayTestEnvironment(async ({ client, profileStore, serverBaseUrl }) => {
    const senderProfile = await registerProfile({
      client,
      profileStore,
      serverBaseUrl,
      nickname: "Developer CLI",
      platform: "cli",
      makeActive: true,
    });
    const receiverProfile = await registerProfile({
      client,
      profileStore,
      serverBaseUrl,
      nickname: "Developer iPhone Sim",
      platform: "ios",
    });

    await expect(
      client.sendText(senderProfile, {
        text: "https://example.com/interesting-link",
        targetDeviceIds: [receiverProfile.deviceId],
      }),
    ).rejects.toThrow(/typed url send flow/i);
  });
});

test("macos simulated receive auto-marks text and url deliveries viewed", async () => {
  await withRelayTestEnvironment(async ({ client, profileStore, serverBaseUrl }) => {
    const senderProfile = await registerProfile({
      client,
      profileStore,
      serverBaseUrl,
      nickname: "Developer CLI",
      platform: "cli",
      makeActive: true,
    });
    const macosProfile = await registerProfile({
      client,
      profileStore,
      serverBaseUrl,
      nickname: "Developer Mac",
      platform: "macos",
    });

    await client.sendText(senderProfile, {
      text: "Open this note immediately",
      targetDeviceIds: [macosProfile.deviceId],
    });
    await client.sendUrl(senderProfile, {
      url: "https://example.com/macos-auto-open",
      targetDeviceIds: [macosProfile.deviceId],
    });

    const deliveries = await client.receivePendingDeliveries(macosProfile, profileStore, {
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

    const viewedDeliveries = await client.listDeliveries(macosProfile, "viewed", 10);
    expect(viewedDeliveries.deliveries).toHaveLength(2);

    const pendingDeliveries = await client.listDeliveries(macosProfile, "pending", 10);
    expect(pendingDeliveries.deliveries).toHaveLength(0);
  });
});

test("deleting a device invalidates its authentication and hides it from active device listings", async () => {
  await withRelayTestEnvironment(async ({ client, profileStore, serverBaseUrl }) => {
    const senderProfile = await registerProfile({
      client,
      profileStore,
      serverBaseUrl,
      nickname: "Developer CLI",
      platform: "cli",
      makeActive: true,
    });
    const receiverProfile = await registerProfile({
      client,
      profileStore,
      serverBaseUrl,
      nickname: "Developer iPhone Sim",
      platform: "ios",
    });

    await client.removeDevice(receiverProfile);

    await expect(client.listDeliveries(receiverProfile, "all", 10)).rejects.toThrow(
      /authentication failed/i,
    );

    const devices = await client.listDevices(senderProfile);
    expect(devices.map((device) => device.deviceId)).not.toContain(receiverProfile.deviceId);
  });
});

test("push tokens can be upserted for the authenticated device", async () => {
  await withRelayTestEnvironment(async ({ client, profileStore, serverBaseUrl }) => {
    const profile = await registerProfile({
      client,
      profileStore,
      serverBaseUrl,
      nickname: "Developer iPhone Sim",
      platform: "ios",
    });

    await client.upsertPushToken(profile, "ExponentPushToken[device-token-1]");
    await client.upsertPushToken(profile, "ExponentPushToken[device-token-2]");

    await client.removeDevice(profile);

    await expect(
      client.upsertPushToken(profile, "ExponentPushToken[device-token-3]"),
    ).rejects.toThrow(/authentication failed/i);
  });
});

test("device routes support rename, listing, and same-device authorization guards", async () => {
  await withRelayTestEnvironment(async ({ client, profileStore, serverBaseUrl }) => {
    const senderProfile = await registerProfile({
      client,
      profileStore,
      serverBaseUrl,
      nickname: "Developer CLI",
      platform: "cli",
      makeActive: true,
    });
    const receiverProfile = await registerProfile({
      client,
      profileStore,
      serverBaseUrl,
      nickname: "Developer iPhone Sim",
      platform: "ios",
    });

    const renamedDevice = await client.renameDevice(receiverProfile, "Renamed iPhone Sim");
    expect(renamedDevice.nickname).toBe("Renamed iPhone Sim");

    const devices = await client.listDevices(senderProfile);
    expect(devices).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          deviceId: receiverProfile.deviceId,
          nickname: "Renamed iPhone Sim",
        }),
      ]),
    );

    const renameAnotherDeviceResponse = await fetch(
      `${serverBaseUrl}/devices/${senderProfile.deviceId}`,
      {
        method: "PATCH",
        headers: {
          ...createAuthHeaders(receiverProfile),
          "content-type": "application/json",
        },
        body: JSON.stringify({ nickname: "Malicious Rename" }),
      },
    );
    await expectErrorResponse(renameAnotherDeviceResponse, 403, /Cannot rename another device\./i);

    const deleteAnotherDeviceResponse = await fetch(
      `${serverBaseUrl}/devices/${senderProfile.deviceId}`,
      {
        method: "DELETE",
        headers: createAuthHeaders(receiverProfile),
      },
    );
    await expectErrorResponse(deleteAnotherDeviceResponse, 403, /Cannot remove another device\./i);

    const updateAnotherDevicePushTokenResponse = await fetch(
      `${serverBaseUrl}/devices/${senderProfile.deviceId}/push-token`,
      {
        method: "POST",
        headers: {
          ...createAuthHeaders(receiverProfile),
          "content-type": "application/json",
        },
        body: JSON.stringify({ token: "ExponentPushToken[cross-device]" }),
      },
    );
    await expectErrorResponse(
      updateAnotherDevicePushTokenResponse,
      403,
      /Cannot update another device\./i,
    );
  });
});

test("item and delivery routes list and fetch the authenticated device resources", async () => {
  await withRelayTestEnvironment(async ({ client, profileStore, serverBaseUrl }) => {
    const senderProfile = await registerProfile({
      client,
      profileStore,
      serverBaseUrl,
      nickname: "Developer CLI",
      platform: "cli",
      makeActive: true,
    });
    const receiverProfile = await registerProfile({
      client,
      profileStore,
      serverBaseUrl,
      nickname: "Developer iPhone Sim",
      platform: "ios",
    });

    const firstItem = await client.sendText(senderProfile, {
      text: "first delivery becomes delivered",
      targetDeviceIds: [receiverProfile.deviceId],
    });
    const secondItem = await client.sendText(senderProfile, {
      text: "second delivery stays pending",
      targetDeviceIds: [receiverProfile.deviceId],
    });

    const pendingDeliveries = await client.fetchPendingDeliveries(receiverProfile);
    expect(pendingDeliveries.deliveries).toHaveLength(2);

    const firstDeliveryId = pendingDeliveries.deliveries.find(
      (delivery) => delivery.item.itemId === firstItem.item.itemId,
    )?.deliveryId;
    expect(firstDeliveryId).toBeDefined();
    if (firstDeliveryId === undefined) {
      throw new Error("Expected the first delivery id to be present.");
    }

    const loadedDelivery = await client.getDelivery(receiverProfile, firstDeliveryId);
    expect(loadedDelivery.deliveryId).toBe(firstDeliveryId);
    expect(loadedDelivery.item.itemId).toBe(firstItem.item.itemId);

    await client.acknowledgeDelivery(receiverProfile, firstDeliveryId);

    const deliveredDeliveries = await client.listDeliveries(receiverProfile, "delivered", 10);
    expect(deliveredDeliveries.deliveries).toHaveLength(1);
    expect(deliveredDeliveries.deliveries[0]?.deliveryId).toBe(firstDeliveryId);

    const allDeliveries = await client.listDeliveries(receiverProfile, "all", 10);
    expect(allDeliveries.deliveries).toHaveLength(2);
    expect(allDeliveries.deliveries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ itemId: firstItem.item.itemId, state: "delivered" }),
        expect.objectContaining({ itemId: secondItem.item.itemId, state: "pending" }),
      ]),
    );

    const items = await client.listItems(senderProfile, 10);
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

test("file helper methods validate empty uploads and write single-file downloads", async () => {
  await withRelayTestEnvironment(async ({ client, profileStore, rootDirectory, serverBaseUrl }) => {
    const senderProfile = await registerProfile({
      client,
      profileStore,
      serverBaseUrl,
      nickname: "Developer CLI",
      platform: "cli",
      makeActive: true,
    });
    const receiverProfile = await registerProfile({
      client,
      profileStore,
      serverBaseUrl,
      nickname: "Developer Android Sim",
      platform: "android-pwa",
    });

    await expect(
      client.sendFiles(senderProfile, {
        targetDeviceIds: [receiverProfile.deviceId],
        files: [],
      }),
    ).rejects.toThrow(/Expected at least one file to upload\./i);

    const gammaFilePath = path.join(rootDirectory, "gamma.txt");
    await fs.promises.writeFile(gammaFilePath, "gamma\n", "utf8");

    const fileItem = await client.sendFiles(senderProfile, {
      targetDeviceIds: [receiverProfile.deviceId],
      files: [{ filePath: gammaFilePath }],
    });
    const fileDeliveryId = fileItem.deliveries[0]?.deliveryId;
    expect(fileDeliveryId).toBeDefined();
    if (fileDeliveryId === undefined) {
      throw new Error("Expected a single-file delivery id.");
    }

    await client.acknowledgeDelivery(receiverProfile, fileDeliveryId);
    const download = await client.downloadDelivery(receiverProfile, fileDeliveryId);

    const explicitFilePath = path.join(rootDirectory, "single-download.txt");
    const explicitOutputPaths = await client.writeDownloadedDelivery(download, explicitFilePath);
    expect(explicitOutputPaths).toEqual([explicitFilePath]);
    expect(await fs.promises.readFile(explicitFilePath, "utf8")).toBe("gamma\n");

    const downloadDirectoryPath = path.join(rootDirectory, "single-file-directory");
    const directoryOutputPaths = await client.writeDownloadedDelivery(
      download,
      downloadDirectoryPath,
    );
    expect(directoryOutputPaths).toEqual([path.join(downloadDirectoryPath, "gamma.txt")]);
    expect(await fs.promises.readFile(directoryOutputPaths[0] ?? "", "utf8")).toBe("gamma\n");
  });
});

test("receivePendingDeliveries respects deduplication, simulation, and acknowledgement options", async () => {
  await withRelayTestEnvironment(async ({ client, profileStore, serverBaseUrl }) => {
    const senderProfile = await registerProfile({
      client,
      profileStore,
      serverBaseUrl,
      nickname: "Developer CLI",
      platform: "cli",
      makeActive: true,
    });
    const iosProfile = await registerProfile({
      client,
      profileStore,
      serverBaseUrl,
      nickname: "Developer iPhone Sim",
      platform: "ios",
    });
    const macosProfile = await registerProfile({
      client,
      profileStore,
      serverBaseUrl,
      nickname: "Developer Mac",
      platform: "macos",
    });

    await client.sendText(senderProfile, {
      text: "do not simulate this delivery",
      targetDeviceIds: [iosProfile.deviceId],
    });

    const firstIosReceive = await client.receivePendingDeliveries(iosProfile, profileStore, {
      acknowledge: false,
      simulatePlatform: false,
      deduplicate: false,
    });
    expect(firstIosReceive).toHaveLength(1);
    expect(firstIosReceive[0]?.wasDuplicate).toBe(false);
    expect(firstIosReceive[0]?.simulation).toBeNull();
    expect(firstIosReceive[0]?.delivery.state).toBe("pending");

    const secondIosReceive = await client.receivePendingDeliveries(iosProfile, profileStore, {
      acknowledge: false,
      simulatePlatform: false,
      deduplicate: false,
    });
    expect(secondIosReceive).toHaveLength(1);
    expect(secondIosReceive[0]?.wasDuplicate).toBe(false);
    expect(secondIosReceive[0]?.simulation).toBeNull();
    expect(secondIosReceive[0]?.delivery.state).toBe("pending");

    await client.sendText(senderProfile, {
      text: "macos auto-view requires acknowledgement",
      targetDeviceIds: [macosProfile.deviceId],
    });

    const firstMacosReceive = await client.receivePendingDeliveries(macosProfile, profileStore, {
      acknowledge: false,
      simulatePlatform: true,
      deduplicate: true,
    });
    expect(firstMacosReceive).toHaveLength(1);
    expect(firstMacosReceive[0]?.wasDuplicate).toBe(false);
    expect(firstMacosReceive[0]?.simulation?.action).toBe("auto-opened-text-window");
    expect(firstMacosReceive[0]?.delivery.state).toBe("pending");

    const macosDeliveryId = firstMacosReceive[0]?.delivery.deliveryId;
    expect(macosDeliveryId).toBeDefined();
    if (macosDeliveryId === undefined) {
      throw new Error("Expected the macOS delivery id.");
    }

    const pendingMacosDelivery = await client.getDelivery(macosProfile, macosDeliveryId);
    expect(pendingMacosDelivery.state).toBe("pending");

    const duplicateAcknowledgedMacosReceive = await client.receivePendingDeliveries(
      macosProfile,
      profileStore,
      {
        acknowledge: true,
        simulatePlatform: true,
        deduplicate: true,
      },
    );
    expect(duplicateAcknowledgedMacosReceive).toHaveLength(1);
    expect(duplicateAcknowledgedMacosReceive[0]?.wasDuplicate).toBe(true);
    expect(duplicateAcknowledgedMacosReceive[0]?.simulation?.action).toBe(
      "auto-opened-text-window",
    );
    expect(duplicateAcknowledgedMacosReceive[0]?.delivery.state).toBe("delivered");
  });
});

test("validation errors are returned for JSON, query, and multipart routes", async () => {
  await withRelayTestEnvironment(async ({ client, profileStore, serverBaseUrl }) => {
    const senderProfile = await registerProfile({
      client,
      profileStore,
      serverBaseUrl,
      nickname: "Developer CLI",
      platform: "cli",
      makeActive: true,
    });
    const receiverProfile = await registerProfile({
      client,
      profileStore,
      serverBaseUrl,
      nickname: "Developer iPhone Sim",
      platform: "ios",
    });

    const invalidInviteResponse = await fetch(`${serverBaseUrl}/invites`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ expiresInSeconds: 0 }),
    });
    await expectErrorResponse(invalidInviteResponse, 400, /(greater than 0|>0)/i);

    const invalidRegisterResponse = await fetch(`${serverBaseUrl}/devices/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nickname: "   ", platform: "ios", invite: "invite_code" }),
    });
    await expectErrorResponse(
      invalidRegisterResponse,
      400,
      /(at least 1 character|>=1 characters)/i,
    );

    const invalidRenameResponse = await fetch(
      `${serverBaseUrl}/devices/${senderProfile.deviceId}`,
      {
        method: "PATCH",
        headers: {
          ...createAuthHeaders(senderProfile),
          "content-type": "application/json",
        },
        body: JSON.stringify({ nickname: "   " }),
      },
    );
    await expectErrorResponse(invalidRenameResponse, 400, /(at least 1 character|>=1 characters)/i);

    const invalidPushTokenResponse = await fetch(
      `${serverBaseUrl}/devices/${senderProfile.deviceId}/push-token`,
      {
        method: "POST",
        headers: {
          ...createAuthHeaders(senderProfile),
          "content-type": "application/json",
        },
        body: JSON.stringify({ token: "   " }),
      },
    );
    await expectErrorResponse(
      invalidPushTokenResponse,
      400,
      /(at least 1 character|>=1 characters)/i,
    );

    const invalidTextItemResponse = await fetch(`${serverBaseUrl}/items/text`, {
      method: "POST",
      headers: {
        ...createAuthHeaders(senderProfile),
        "content-type": "application/json",
      },
      body: JSON.stringify({ text: "", targetDeviceIds: [receiverProfile.deviceId] }),
    });
    await expectErrorResponse(
      invalidTextItemResponse,
      400,
      /(at least 1 character|>=1 characters)/i,
    );

    const invalidUrlItemResponse = await fetch(`${serverBaseUrl}/items/url`, {
      method: "POST",
      headers: {
        ...createAuthHeaders(senderProfile),
        "content-type": "application/json",
      },
      body: JSON.stringify({ url: "not-a-url", targetDeviceIds: [receiverProfile.deviceId] }),
    });
    await expectErrorResponse(invalidUrlItemResponse, 400, /valid url/i);

    const invalidDeliveryStateResponse = await fetch(`${serverBaseUrl}/deliveries?state=invalid`, {
      headers: createAuthHeaders(receiverProfile),
    });
    await expectErrorResponse(invalidDeliveryStateResponse, 400, /Invalid option/i);

    const invalidDeliveryLimitResponse = await fetch(`${serverBaseUrl}/deliveries?limit=0`, {
      headers: createAuthHeaders(receiverProfile),
    });
    await expectErrorResponse(invalidDeliveryLimitResponse, 400, /(greater than 0|>0)/i);

    const invalidItemLimitResponse = await fetch(`${serverBaseUrl}/items?limit=0`, {
      headers: createAuthHeaders(senderProfile),
    });
    await expectErrorResponse(invalidItemLimitResponse, 400, /(greater than 0|>0)/i);

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
    await expectErrorResponse(
      missingTargetDeviceIdsResponse,
      400,
      /Expected `targetDeviceIds` JSON form field\./i,
    );

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
    await expectErrorResponse(
      invalidJsonTargetDeviceIdsResponse,
      400,
      /Expected `targetDeviceIds` to be valid JSON\./i,
    );

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
    await expectErrorResponse(
      invalidTargetDeviceIdArrayResponse,
      400,
      /Expected `targetDeviceIds` to be a non-empty JSON array of strings\./i,
    );

    const noFilesForm = new FormData();
    noFilesForm.set("targetDeviceIds", JSON.stringify([receiverProfile.deviceId]));
    const noFilesResponse = await fetch(`${serverBaseUrl}/items/file`, {
      method: "POST",
      headers: createAuthHeaders(senderProfile),
      body: noFilesForm,
    });
    await expectErrorResponse(noFilesResponse, 400, /Expected at least one uploaded file\./i);

    const invalidFileFieldForm = new FormData();
    invalidFileFieldForm.set("targetDeviceIds", JSON.stringify([receiverProfile.deviceId]));
    invalidFileFieldForm.set("files", "not-a-file");
    const invalidFileFieldResponse = await fetch(`${serverBaseUrl}/items/file`, {
      method: "POST",
      headers: createAuthHeaders(senderProfile),
      body: invalidFileFieldForm,
    });
    await expectErrorResponse(
      invalidFileFieldResponse,
      400,
      /Expected file uploads in the `files` form field\./i,
    );
  });
});

test("resource lookup routes reject unknown resources and invalid file downloads", async () => {
  await withRelayTestEnvironment(async ({ client, profileStore, serverBaseUrl }) => {
    const senderProfile = await registerProfile({
      client,
      profileStore,
      serverBaseUrl,
      nickname: "Developer CLI",
      platform: "cli",
      makeActive: true,
    });
    const receiverProfile = await registerProfile({
      client,
      profileStore,
      serverBaseUrl,
      nickname: "Developer iPhone Sim",
      platform: "ios",
    });

    const textItem = await client.sendText(senderProfile, {
      text: "this delivery is not downloadable as a file",
      targetDeviceIds: [receiverProfile.deviceId],
    });
    const deliveryId = textItem.deliveries[0]?.deliveryId;
    expect(deliveryId).toBeDefined();
    if (deliveryId === undefined) {
      throw new Error("Expected a delivery id for the text item.");
    }

    await expect(client.getDelivery(receiverProfile, "delivery_missing")).rejects.toThrow(
      /Delivery not found\./i,
    );
    await expect(client.getItem(senderProfile, "item_missing")).rejects.toThrow(
      /Item not found\./i,
    );
    await expect(client.downloadDelivery(receiverProfile, deliveryId)).rejects.toThrow(
      /not a file delivery/i,
    );
  });
});

test("items, deliveries, and devices collection routes reject unauthenticated requests", async () => {
  await withRelayTestEnvironment(async ({ serverBaseUrl }) => {
    const devicesResponse = await fetch(`${serverBaseUrl}/devices`);
    await expectErrorResponse(devicesResponse, 401, /Missing device authentication headers\./i);

    const itemsResponse = await fetch(`${serverBaseUrl}/items`);
    await expectErrorResponse(itemsResponse, 401, /Missing device authentication headers\./i);

    const deliveriesResponse = await fetch(`${serverBaseUrl}/deliveries`);
    await expectErrorResponse(deliveriesResponse, 401, /Missing device authentication headers\./i);
  });
});

test("rpc client trims trailing slashes and surfaces text and malformed JSON errors", async () => {
  await withRelayTestEnvironment(async ({ client, serverBaseUrl }) => {
    const invite = await client.createInvite(`${serverBaseUrl}/`, { expiresInSeconds: 900 });
    expect(invite.inviteCode).toBeTruthy();

    const registration = await client.registerDevice(`${serverBaseUrl}/`, {
      nickname: "Trailing Slash Device",
      platform: "cli",
      invite: invite.inviteCode,
    });
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
    const client = new RelayRpcClient();
    await expect(
      client.createInvite(`http://127.0.0.1:${port}`, { expiresInSeconds: 900 }),
    ).rejects.toThrow(/Request failed with 503: temporary outage/i);
    await expect(
      client.createInvite(`http://127.0.0.1:${port}`, { expiresInSeconds: 900 }),
    ).rejects.toThrow(/Request failed with 500: Unknown error/i);
  } finally {
    await closeHttpServer(server);
  }
});

test("server errors are normalized to JSON 500 responses", async () => {
  const rootDirectory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "content-relay-test-"));
  cleanupPaths.push(rootDirectory);

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
      await expectErrorResponse(genericErrorResponse, 500, /^boom$/i);
    } finally {
      await server.stop();
    }
  });
});

test("profile store reuses remembered targets when no explicit targets are provided", async () => {
  await withRelayTestEnvironment(async ({ client, profileStore, serverBaseUrl }) => {
    const senderProfile = await registerProfile({
      client,
      profileStore,
      serverBaseUrl,
      nickname: "Developer CLI",
      platform: "cli",
      makeActive: true,
    });
    const iosProfile = await registerProfile({
      client,
      profileStore,
      serverBaseUrl,
      nickname: "Developer iPhone Sim",
      platform: "ios",
    });
    const androidProfile = await registerProfile({
      client,
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

    const textItem = await client.sendText(senderProfile, {
      text: "last used targets still apply",
      targetDeviceIds: resolvedTargets,
    });
    expect(textItem.deliveries.map((delivery) => delivery.targetDeviceId).sort()).toEqual(
      [iosProfile.deviceId, androidProfile.deviceId].sort(),
    );
  });
});

type RelayTestEnvironment = {
  client: RelayRpcClient;
  profileStore: LocalDeviceProfileStore;
  rootDirectory: string;
  serverBaseUrl: string;
};

async function withRelayTestEnvironment(
  run: (environment: RelayTestEnvironment) => Promise<void>,
): Promise<void> {
  const rootDirectory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "content-relay-test-"));
  cleanupPaths.push(rootDirectory);

  const port = await allocatePort();
  const serverBaseUrl = `http://127.0.0.1:${port}`;

  const diContainer = await createDependencyContainer({
    dataDirectory: path.join(rootDirectory, "server-data"),
    serverBaseUrl,
  });

  await runWithDiContainer(diContainer, async () => {
    const app = await createHonoApp();
    const server = await startServer({ app, port });

    try {
      await run({
        client: new RelayRpcClient(),
        profileStore: new LocalDeviceProfileStore(path.join(rootDirectory, "profiles")),
        rootDirectory,
        serverBaseUrl,
      });
    } finally {
      await server.stop();
    }
  });
}

async function registerProfile(input: {
  client: RelayRpcClient;
  profileStore: LocalDeviceProfileStore;
  serverBaseUrl: string;
  nickname: string;
  platform: DevicePlatform;
  makeActive?: boolean;
  profileId?: string;
}): Promise<LocalDeviceProfile> {
  const invite = await input.client.createInvite(input.serverBaseUrl, {
    expiresInSeconds: 900,
  });
  const registration = await input.client.registerDevice(input.serverBaseUrl, {
    nickname: input.nickname,
    platform: input.platform,
    invite: invite.inviteCode,
  });

  return await input.profileStore.createProfile(
    {
      ...registration,
      ...(input.profileId !== undefined ? { profileId: input.profileId } : {}),
    },
    { makeActive: input.makeActive ?? false },
  );
}

function createAuthHeaders(profile: LocalDeviceProfile): HeadersInit {
  return {
    authorization: `Bearer ${profile.authToken}`,
    "x-relay-device-id": profile.deviceId,
  };
}

async function expectErrorResponse(
  response: Response,
  status: number,
  expectedMessage: RegExp,
): Promise<void> {
  expect(response.status).toBe(status);

  const payload = errorResponseSchema.parse(await response.json());
  expect(payload.error).toMatch(expectedMessage);
}

async function listenOnPort(server: net.Server, port: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.listen(port, "127.0.0.1", () => resolve());
    server.on("error", reject);
  });
}

async function closeHttpServer(server: net.Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error !== undefined) {
        reject(error);

        return;
      }

      resolve();
    });
  });
}

async function allocatePort(): Promise<number> {
  return await new Promise<number>((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        reject(new Error("Could not determine an ephemeral TCP port."));

        return;
      }

      const { port } = address;
      server.close((error) => {
        if (error !== undefined) {
          reject(error);

          return;
        }

        resolve(port);
      });
    });
    server.on("error", reject);
  });
}
