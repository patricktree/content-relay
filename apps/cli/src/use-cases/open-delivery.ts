import { assertIsUnreachable } from "@patricktree/commons-ecma/util/assert";

import { parseOkResponse, RpcClient } from "@content-relay/client";
import type { DeliveryResource } from "@content-relay/contracts";

import type { ActiveDeviceContext } from "#pkg/use-cases/device-context.ts";
import { transitionDeliveryToDelivered } from "#pkg/use-cases/transition-delivery-to-delivered.ts";

export type OpenDeliveryResponse = {
  delivery: DeliveryResource;
  action: string;
};

export async function openDelivery(
  deviceContext: ActiveDeviceContext,
  deliveryId: string,
): Promise<OpenDeliveryResponse> {
  let delivery = (
    await parseOkResponse(
      new RpcClient(deviceContext.relayHubBaseUrl)
        .createDeviceRpcClient(deviceContext.deviceId)
        .getDelivery({ deliveryId: deliveryId }),
    )
  ).delivery;

  if (delivery.state === "pending") {
    delivery = await transitionDeliveryToDelivered(deviceContext, deliveryId);
  }

  if (delivery.state !== "viewed") {
    delivery = (
      await parseOkResponse(
        new RpcClient(deviceContext.relayHubBaseUrl)
          .createDeviceRpcClient(deviceContext.deviceId)
          .markDeliveryViewed({ deliveryId: deliveryId }),
      )
    ).delivery;
  }

  return {
    delivery,
    action: describeOpenAction(delivery),
  };
}

function describeOpenAction(delivery: DeliveryResource): string {
  switch (delivery.item.type) {
    case "text":
      return `Opened text delivery ${delivery.deliveryId}`;
    case "url":
      return `Opened URL delivery ${delivery.deliveryId}`;
    case "file":
      return `Opened file delivery ${delivery.deliveryId}`;
    default:
      return assertIsUnreachable(delivery.item.type);
  }
}
