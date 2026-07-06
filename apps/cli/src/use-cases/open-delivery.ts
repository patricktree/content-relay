import { assertIsUnreachable } from "@patricktree/commons-ecma/util/assert";

import { parseOkResponse, RpcClient } from "@content-relay/client";
import type { DeliveryResource } from "@content-relay/contracts";

import { transitionDeliveryToDelivered } from "#src/use-cases/transition-delivery-to-delivered.ts";

export type OpenDeliveryResponse = {
  delivery: DeliveryResource;
  action: string;
};

export async function openDelivery(
  input: { relayHubBaseUrl: string; deviceId: string },
  deliveryId: string,
): Promise<OpenDeliveryResponse> {
  let delivery = (
    await parseOkResponse(
      new RpcClient(input.relayHubBaseUrl)
        .createDeviceRpcClient(input.deviceId)
        .getDelivery({ deliveryId: deliveryId }),
    )
  ).delivery;

  if (delivery.state === "pending") {
    delivery = await transitionDeliveryToDelivered(input, deliveryId);
  }

  if (delivery.state !== "viewed") {
    delivery = (
      await parseOkResponse(
        new RpcClient(input.relayHubBaseUrl)
          .createDeviceRpcClient(input.deviceId)
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
