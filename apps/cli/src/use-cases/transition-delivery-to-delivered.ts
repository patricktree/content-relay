import { parseOkResponse, RpcClient } from "@content-relay/client";
import type { DeliveryResource } from "@content-relay/contracts";
import type { LocalDeviceProfile } from "@content-relay/profile-store-node";

export async function transitionDeliveryToDelivered(
  profile: LocalDeviceProfile,
  deliveryId: string,
): Promise<DeliveryResource> {
  const acknowledged = await parseOkResponse(
    new RpcClient(profile.relayHubBaseUrl)
      .createDeviceRpcClient(profile.deviceId)
      .acknowledgeDelivery({ deliveryId: deliveryId }),
  );

  return acknowledged.delivery;
}
