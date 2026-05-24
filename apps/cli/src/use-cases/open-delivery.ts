import { assertIsUnreachable } from "@patricktree/commons-ecma/util/assert";

import { parseOkResponse, RpcClient } from "@content-relay/client";
import type { DeliveryResource } from "@content-relay/contracts";
import type {
  LocalDeviceProfile,
  LocalDeviceProfileStore,
} from "@content-relay/profile-store-node";

import { transitionDeliveryToDelivered } from "#pkg/use-cases/transition-delivery-to-delivered.ts";

export type OpenDeliveryResponse = {
  delivery: DeliveryResource;
  action: string;
};

type OpenDeliveryProfileStore = Pick<LocalDeviceProfileStore, "recordHandledDelivery">;

export async function openDelivery(
  profile: LocalDeviceProfile,
  deliveryId: string,
  profileStore: OpenDeliveryProfileStore,
): Promise<OpenDeliveryResponse> {
  let delivery = (
    await parseOkResponse(
      new RpcClient(profile.relayHubBaseUrl)
        .createDeviceRpcClient(profile.deviceId)
        .getDelivery({ deliveryId: deliveryId }),
    )
  ).delivery;

  if (delivery.state === "pending") {
    delivery = await transitionDeliveryToDelivered(profile, deliveryId);
  }

  if (delivery.state !== "viewed") {
    delivery = (
      await parseOkResponse(
        new RpcClient(profile.relayHubBaseUrl)
          .createDeviceRpcClient(profile.deviceId)
          .markDeliveryViewed({ deliveryId: deliveryId }),
      )
    ).delivery;
  }

  await profileStore.recordHandledDelivery(profile.profileId, deliveryId);

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
