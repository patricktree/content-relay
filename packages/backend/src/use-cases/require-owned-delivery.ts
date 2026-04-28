import { getDiContainer } from "#pkg/dependency-container-context.ts";
import { RelayResourceNotFoundError } from "#pkg/errors.ts";
import {
  relayRepositoryToken,
  type DeliveryRecord,
} from "#pkg/interfaces/relay-backend-repository.interface.ts";

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
