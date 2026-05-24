import { parseResponse } from "hono/client";
import fs from "node:fs";
import path from "node:path";

import { simulatePlatformDelivery, type SimulatedDeliveryResult } from "@content-relay/client";
import type {
  DeliveryResource,
  DevicePlatform,
  DownloadDeliveryResponse,
  PushRegistration,
} from "@content-relay/contracts";
import { isMobileDevicePlatform } from "@content-relay/contracts";
import { allocatePort, listenOnPort } from "@content-relay/relay-hub-test-utils";

import { RpcClient } from "#pkg/rpc-client.ts";

export { allocatePort, listenOnPort };

export type RegisteredTestDevice = {
  relayHubBaseUrl: string;
  deviceId: string;
  nickname: string;
  platform: DevicePlatform;
};

export type ReceivedDeliveryResult = {
  delivery: DeliveryResource;
  wasDuplicate: boolean;
  simulation: SimulatedDeliveryResult | null;
};

export type ReceivePendingOptions = {
  acknowledge: boolean;
  simulatePlatform: boolean;
  deduplicate: boolean;
  handledDeliveryIds?: Set<string> | undefined;
};

export async function registerTestDevice(input: {
  relayHubBaseUrl: string;
  nickname: string;
  platform: DevicePlatform;
}): Promise<RegisteredTestDevice> {
  const rpcClient = new RpcClient(input.relayHubBaseUrl);
  const pushRegistration = buildPushRegistration(input.platform, input.nickname);
  const registration = await parseResponse(
    rpcClient.registerDevice({
      nickname: input.nickname,
      platform: input.platform,
      ...(pushRegistration === undefined ? {} : { pushRegistration }),
    }),
  );

  return {
    relayHubBaseUrl: input.relayHubBaseUrl,
    deviceId: registration.deviceId,
    nickname: registration.nickname,
    platform: registration.platform,
  };
}

export function createAuthHeaders(device: RegisteredTestDevice): HeadersInit {
  return {
    "x-relay-device-id": device.deviceId,
  };
}

export async function receivePendingDeliveries(
  device: RegisteredTestDevice,
  options: ReceivePendingOptions,
): Promise<ReceivedDeliveryResult[]> {
  const rpcClient = new RpcClient(device.relayHubBaseUrl).createDeviceRpcClient(device.deviceId);
  const pending = await parseResponse(rpcClient.fetchPendingDeliveries());
  const results: ReceivedDeliveryResult[] = [];
  const handledDeliveryIds = options.handledDeliveryIds ?? new Set<string>();

  for (const delivery of pending.deliveries) {
    const wasDuplicate = options.deduplicate ? handledDeliveryIds.has(delivery.deliveryId) : false;
    const simulation = options.simulatePlatform
      ? simulatePlatformDelivery(device.platform, delivery)
      : null;

    if (!wasDuplicate) {
      handledDeliveryIds.add(delivery.deliveryId);
    }

    let currentDelivery = delivery;
    if (options.acknowledge) {
      const acknowledged = await parseResponse(
        rpcClient.acknowledgeDelivery({ deliveryId: delivery.deliveryId }),
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
        rpcClient.markDeliveryViewed({ deliveryId: delivery.deliveryId }),
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
