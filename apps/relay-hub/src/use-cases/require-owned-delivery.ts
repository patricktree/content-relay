import { getDiContainer } from "#src/dependency-container-context.ts";
import { RelayResourceNotFoundError } from "#src/errors.ts";
import {
  relayRepositoryToken,
  type DeliveryRecord,
} from "#src/interfaces/relay-hub-repository.interface.ts";

export async function requireOwnedDelivery(
  targetDeviceId: string,
  deliveryId: string,
): Promise<DeliveryRecord> {
  const repository = getDiContainer().inject(relayRepositoryToken);

  const delivery = await repository.getDeliveryById(deliveryId);

  if (delivery === null || delivery.targetDeviceId !== targetDeviceId) {
    throw new RelayResourceNotFoundError("Delivery not found.");
  }

  return delivery;
}
