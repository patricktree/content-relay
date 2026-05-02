import { getDiContainer } from "#pkg/dependency-container-context.ts";
import { clockToken } from "#pkg/interfaces/clock.interface.ts";
import { relayRepositoryToken } from "#pkg/interfaces/relay-backend-repository.interface.ts";
import { loadDelivery, type LoadedDelivery } from "#pkg/use-cases/load-delivery.ts";
import { requireOwnedDelivery } from "#pkg/use-cases/require-owned-delivery.ts";

export async function markDeliveryViewed(
  targetDeviceId: string,
  deliveryId: string,
): Promise<LoadedDelivery> {
  const repository = getDiContainer().inject(relayRepositoryToken);
  const clock = getDiContainer().inject(clockToken);

  await requireOwnedDelivery(targetDeviceId, deliveryId);
  const delivery = await repository.markDeliveryViewed(deliveryId, clock.now());

  return await loadDelivery(delivery);
}
