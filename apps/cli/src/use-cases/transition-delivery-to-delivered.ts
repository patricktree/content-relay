import { parseOkResponse, RpcClient } from "@content-relay/client";
import type { DeliveryResource } from "@content-relay/contracts";

import type { ActiveDeviceContext } from "#pkg/use-cases/device-context.ts";

export async function transitionDeliveryToDelivered(
  deviceContext: ActiveDeviceContext,
  deliveryId: string,
): Promise<DeliveryResource> {
  const acknowledged = await parseOkResponse(
    new RpcClient(deviceContext.relayHubBaseUrl)
      .createDeviceRpcClient(deviceContext.deviceId)
      .acknowledgeDelivery({ deliveryId: deliveryId }),
  );

  return acknowledged.delivery;
}
