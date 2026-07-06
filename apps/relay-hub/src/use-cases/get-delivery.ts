import { loadDelivery, type LoadedDelivery } from "#src/use-cases/load-delivery.ts";
import { requireOwnedDelivery } from "#src/use-cases/require-owned-delivery.ts";

export async function getDelivery(
  targetDeviceId: string,
  deliveryId: string,
): Promise<LoadedDelivery> {
  const delivery = await requireOwnedDelivery(targetDeviceId, deliveryId);

  return await loadDelivery(delivery);
}
