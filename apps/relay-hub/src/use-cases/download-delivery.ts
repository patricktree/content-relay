import { type FileMetadata } from "@content-relay/shared";

import { getDiContainer } from "#pkg/dependency-container-context.ts";
import { RelayInvalidInputError } from "#pkg/errors.ts";
import {
  relayRepositoryToken,
  type ItemRecord,
} from "#pkg/interfaces/relay-hub-repository.interface.ts";
import { readStoredFiles } from "#pkg/use-cases/read-stored-files.ts";
import { requireOwnedDelivery } from "#pkg/use-cases/require-owned-delivery.ts";

export type DownloadDeliveryOutput = {
  item: ItemRecord;
  files: DownloadedFile[];
};

type DownloadedFile = {
  metadata: FileMetadata;
  content: Uint8Array;
};

export async function downloadDelivery(
  targetDeviceId: string,
  deliveryId: string,
): Promise<DownloadDeliveryOutput> {
  const repository = getDiContainer().inject(relayRepositoryToken);

  const delivery = await requireOwnedDelivery(targetDeviceId, deliveryId);
  const item = await repository.getItemById(delivery.itemId);

  if (item === null) {
    throw new Error(`Missing item for delivery: ${deliveryId}`);
  }

  if (item.type !== "file") {
    throw new RelayInvalidInputError("The requested delivery is not a file delivery.");
  }

  const files = await readStoredFiles(item.id);

  return {
    item,
    files,
  };
}
