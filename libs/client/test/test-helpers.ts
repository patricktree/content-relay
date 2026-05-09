import { parseResponse } from "hono/client";
import fs from "node:fs";
import path from "node:path";

import {
  createDeviceHttpClient,
  simulatePlatformDelivery,
  type SimulatedDeliveryResult,
} from "@content-relay/client";
import type {
  DeliveryResource,
  DevicePlatform,
  DownloadDeliveryResponse,
  PushRegistration,
} from "@content-relay/contracts";
import { isMobileDevicePlatform } from "@content-relay/contracts";
import {
  LocalDeviceProfileStore,
  type LocalDeviceProfile,
} from "@content-relay/profile-store-node";
import {
  allocatePort,
  listenOnPort,
  withRelayTestEnvironment as withBaseRelayTestEnvironment,
} from "@content-relay/relay-hub-test-utils";

import { rpcClient } from "#pkg/rpc-client.ts";

export { allocatePort, listenOnPort };
export { createDeviceHttpClient };

export type ReceivedDeliveryResult = {
  delivery: DeliveryResource;
  wasDuplicate: boolean;
  simulation: SimulatedDeliveryResult | null;
};

export type ReceivePendingOptions = {
  acknowledge: boolean;
  simulatePlatform: boolean;
  deduplicate: boolean;
};

export type RelayTestEnvironment = {
  profileStore: LocalDeviceProfileStore;
  rootDirectory: string;
  relayHubBaseUrl: string;
};

export async function withRelayTestEnvironment(
  run: (environment: RelayTestEnvironment) => Promise<void>,
): Promise<void> {
  await withBaseRelayTestEnvironment(async ({ rootDirectory, relayHubBaseUrl }) => {
    await run({
      profileStore: new LocalDeviceProfileStore(path.join(rootDirectory, "profiles")),
      rootDirectory,
      relayHubBaseUrl,
    });
  });
}

export async function registerProfile(input: {
  profileStore: LocalDeviceProfileStore;
  relayHubBaseUrl: string;
  nickname: string;
  platform: DevicePlatform;
  makeActive?: boolean;
  profileId?: string;
}): Promise<LocalDeviceProfile> {
  const invite = await parseResponse(
    rpcClient.createInvite(input.relayHubBaseUrl, { expiresInSeconds: 900 }),
  );
  const pushRegistration = buildPushRegistration(input.platform, input.nickname);
  const registration = await parseResponse(
    rpcClient.registerDevice(input.relayHubBaseUrl, {
      nickname: input.nickname,
      platform: input.platform,
      invite: invite.inviteCode,
      ...(pushRegistration === undefined ? {} : { pushRegistration }),
    }),
  );

  return await input.profileStore.createProfile(
    {
      ...registration,
      ...(input.profileId !== undefined ? { profileId: input.profileId } : {}),
    },
    { makeActive: input.makeActive ?? false },
  );
}

export function createAuthHeaders(profile: LocalDeviceProfile): HeadersInit {
  return {
    "x-relay-device-id": profile.deviceId,
  };
}

export async function receivePendingDeliveries(
  profile: LocalDeviceProfile,
  profileStore: LocalDeviceProfileStore,
  options: ReceivePendingOptions,
): Promise<ReceivedDeliveryResult[]> {
  const pending = await parseResponse(rpcClient.fetchPendingDeliveries(profile));
  const results: ReceivedDeliveryResult[] = [];

  for (const delivery of pending.deliveries) {
    const wasDuplicate = options.deduplicate
      ? await profileStore.hasHandledDelivery(profile.profileId, delivery.deliveryId)
      : false;
    const simulation = options.simulatePlatform
      ? simulatePlatformDelivery(profile.platform, delivery)
      : null;

    if (!wasDuplicate) {
      await profileStore.recordHandledDelivery(profile.profileId, delivery.deliveryId);
    }

    let currentDelivery = delivery;
    if (options.acknowledge) {
      const acknowledged = await parseResponse(
        rpcClient.acknowledgeDelivery(profile, delivery.deliveryId),
      );
      currentDelivery = acknowledged.delivery;
    }

    if (
      simulation !== null &&
      simulation.shouldMarkViewed &&
      options.acknowledge &&
      !wasDuplicate
    ) {
      const viewed = await parseResponse(
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

function buildPushRegistration(
  platform: DevicePlatform,
  nickname: string,
): PushRegistration | undefined {
  if (!isMobileDevicePlatform(platform)) {
    return undefined;
  }

  return {
    token: `simulated-${platform}-${nickname.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-token`,
  };
}

export async function writeDownloadedDelivery(
  download: DownloadDeliveryResponse,
  outPath?: string,
): Promise<string[]> {
  const outputPaths: string[] = [];
  const itemId = download.item.itemId;
  const isSingleFile = download.files.length === 1;
  const baseOutputPath =
    outPath ?? (isSingleFile ? process.cwd() : path.join(process.cwd(), itemId));

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
