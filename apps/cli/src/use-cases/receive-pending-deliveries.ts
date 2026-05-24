import {
  parseOkResponse,
  RpcClient,
  simulatePlatformDelivery,
  type SimulatedDeliveryResult,
} from "@content-relay/client";
import type { DeliveryResource } from "@content-relay/contracts";

import type { ActiveDeviceWithPlatform } from "#pkg/use-cases/device-context.ts";
import { transitionDeliveryToDelivered } from "#pkg/use-cases/transition-delivery-to-delivered.ts";

export type ReceivedDeliveryResult = {
  delivery: DeliveryResource;
  wasDuplicate: boolean;
  simulation: SimulatedDeliveryResult | null;
};

export async function receivePendingDeliveries(
  deviceContext: ActiveDeviceWithPlatform,
): Promise<ReceivedDeliveryResult[]> {
  const pending = await parseOkResponse(
    new RpcClient(deviceContext.relayHubBaseUrl)
      .createDeviceRpcClient(deviceContext.deviceId)
      .fetchPendingDeliveries(),
  );
  const results: ReceivedDeliveryResult[] = [];

  for (const delivery of pending.deliveries) {
    const simulation = simulatePlatformDelivery(deviceContext.platform, delivery);
    let currentDelivery = await transitionDeliveryToDelivered(deviceContext, delivery.deliveryId);

    if (simulation.shouldMarkViewed) {
      const viewed = await parseOkResponse(
        new RpcClient(deviceContext.relayHubBaseUrl)
          .createDeviceRpcClient(deviceContext.deviceId)
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
