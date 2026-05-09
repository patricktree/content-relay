import { type FileMetadata } from "@content-relay/contracts";

import { getDiContainer } from "#pkg/dependency-container-context.ts";
import {
  relayRepositoryToken,
  type DeliveryRecord,
  type ItemRecord,
} from "#pkg/interfaces/relay-hub-repository.interface.ts";

export type LoadedDelivery = {
  delivery: DeliveryRecord;
  item: ItemRecord;
  files: FileMetadata[];
};

export async function loadDelivery(delivery: DeliveryRecord): Promise<LoadedDelivery> {
  const repository = getDiContainer().inject(relayRepositoryToken);

  const item = await repository.getItemById(delivery.itemId);
  if (item === null) {
    throw new Error(`Missing item for delivery: ${delivery.id}`);
  }

  const files = await repository.getFileMetadataByItemId(delivery.itemId);

  return {
    delivery,
    item,
    files,
  };
}
