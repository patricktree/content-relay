import { type FileMetadata } from "@content-relay/contracts";

import { getDiContainer } from "#pkg/dependency-container-context.ts";
import {
  relayRepositoryToken,
  type DeliveryRecord,
  type ItemRecord,
} from "#pkg/interfaces/relay-hub-repository.interface.ts";

export type LoadedItem = {
  item: ItemRecord;
  files: FileMetadata[];
  deliveries: DeliveryRecord[];
};

export async function loadItem(item: ItemRecord): Promise<LoadedItem> {
  const repository = getDiContainer().inject(relayRepositoryToken);

  const files = await repository.getFileMetadataByItemId(item.id);
  const deliveries = await repository.listDeliveriesByItemId(item.id);

  return {
    item,
    files,
    deliveries,
  };
}
