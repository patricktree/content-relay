import { getDiContainer } from "#src/dependency-container-context.ts";
import { clockToken } from "#src/interfaces/clock.interface.ts";
import { relayRepositoryToken } from "#src/interfaces/relay-hub-repository.interface.ts";
import { deleteAcknowledgedFileBlobs } from "#src/use-cases/delete-acknowledged-file-blobs.ts";
import { loadDelivery, type LoadedDelivery } from "#src/use-cases/load-delivery.ts";
import { requireOwnedDelivery } from "#src/use-cases/require-owned-delivery.ts";

export async function acknowledgeDelivery(
  targetDeviceId: string,
  deliveryId: string,
): Promise<LoadedDelivery> {
  const repository = getDiContainer().inject(relayRepositoryToken);
  const clock = getDiContainer().inject(clockToken);

  await requireOwnedDelivery(targetDeviceId, deliveryId);
  const delivery = await repository.acknowledgeDelivery(deliveryId, clock.now());
  await deleteAcknowledgedFileBlobs(delivery.itemId);

  return await loadDelivery(delivery);
}
