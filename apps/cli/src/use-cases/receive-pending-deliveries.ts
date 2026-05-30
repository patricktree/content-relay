import {
  parseOkResponse,
  RpcClient,
  simulatePlatformDelivery,
  type SimulatedDeliveryResult,
} from "@content-relay/client";
import type { DeliveryResource, DevicePlatform } from "@content-relay/contracts";

import { transitionDeliveryToDelivered } from "#pkg/use-cases/transition-delivery-to-delivered.ts";

export type ReceivedDeliveryResult = {
  delivery: DeliveryResource;
  wasDuplicate: boolean;
  simulation: SimulatedDeliveryResult | null;
};

export async function receivePendingDeliveries(input: {
  relayHubBaseUrl: string;
  deviceId: string;
  platform: DevicePlatform;
}): Promise<ReceivedDeliveryResult[]> {
  const pending = await parseOkResponse(
    new RpcClient(input.relayHubBaseUrl)
      .createDeviceRpcClient(input.deviceId)
      .listDeliveries({ state: "pending" }),
  );
  const results: ReceivedDeliveryResult[] = [];

  for (const delivery of pending.deliveries) {
    const simulation = simulatePlatformDelivery(input.platform, delivery);
    let currentDelivery = await transitionDeliveryToDelivered(input, delivery.deliveryId);

    if (simulation.shouldMarkViewed) {
      const viewed = await parseOkResponse(
        new RpcClient(input.relayHubBaseUrl)
          .createDeviceRpcClient(input.deviceId)
          .markDeliveryViewed({ deliveryId: delivery.deliveryId }),
      );
      currentDelivery = viewed.delivery;
    }

    results.push({
      delivery: currentDelivery,
      wasDuplicate: false,
      simulation,
    });
  }

  return results;
}
