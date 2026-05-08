import { getDiContainer } from "#pkg/dependency-container-context.ts";
import { blobStoreToken } from "#pkg/interfaces/blob-store.interface.ts";
import { relayRepositoryToken } from "#pkg/interfaces/relay-hub-repository.interface.ts";

export async function deleteAcknowledgedFileBlobs(itemId: string): Promise<void> {
  const repository = getDiContainer().inject(relayRepositoryToken);
  const blobStore = getDiContainer().inject(blobStoreToken);

  const item = await repository.getItemById(itemId);
  if (item === null) {
    throw new Error(`Missing item while checking file retention: ${itemId}`);
  }

  if (item.type !== "file") {
    return;
  }

  const deliveries = await repository.listDeliveriesByItemId(itemId);
  const hasPendingRecipient = deliveries.some((delivery) => delivery.state === "pending");
  if (hasPendingRecipient) {
    return;
  }

  await blobStore.deleteItem(itemId);
}
