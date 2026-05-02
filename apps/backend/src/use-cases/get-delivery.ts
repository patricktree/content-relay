import { loadDelivery, type LoadedDelivery } from "#pkg/use-cases/load-delivery.ts";
import { requireOwnedDelivery } from "#pkg/use-cases/require-owned-delivery.ts";

export async function getDelivery(
  targetDeviceId: string,
  deliveryId: string,
): Promise<LoadedDelivery> {
  const delivery = await requireOwnedDelivery(targetDeviceId, deliveryId);

  return await loadDelivery(delivery);
}
