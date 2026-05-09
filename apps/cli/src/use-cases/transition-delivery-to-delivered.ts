import { parseOkResponse, rpcClient } from "@content-relay/client";
import type { DeliveryResource } from "@content-relay/contracts";
import type { LocalDeviceProfile } from "@content-relay/profile-store-node";

export async function transitionDeliveryToDelivered(
  profile: LocalDeviceProfile,
  deliveryId: string,
): Promise<DeliveryResource> {
  const acknowledged = await parseOkResponse(rpcClient.acknowledgeDelivery(profile, deliveryId));

  return acknowledged.delivery;
}
