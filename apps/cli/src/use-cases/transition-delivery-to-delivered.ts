import { parseOkResponse, RpcClient } from "@content-relay/client";
import type { DeliveryResource } from "@content-relay/contracts";

export async function transitionDeliveryToDelivered(
  input: { relayHubBaseUrl: string; deviceId: string },
  deliveryId: string,
): Promise<DeliveryResource> {
  const acknowledged = await parseOkResponse(
    new RpcClient(input.relayHubBaseUrl)
      .createDeviceRpcClient(input.deviceId)
      .acknowledgeDelivery({ deliveryId: deliveryId }),
  );

  return acknowledged.delivery;
}
