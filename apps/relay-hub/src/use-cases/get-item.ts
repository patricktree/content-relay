import { getDiContainer } from "#pkg/dependency-container-context.ts";
import { RelayResourceNotFoundError } from "#pkg/errors.ts";
import { relayRepositoryToken } from "#pkg/interfaces/relay-hub-repository.interface.ts";
import { loadItem, type LoadedItem } from "#pkg/use-cases/load-item.ts";

export async function getItem(sourceDeviceId: string, itemId: string): Promise<LoadedItem> {
  const repository = getDiContainer().inject(relayRepositoryToken);

  const item = await repository.getItemById(itemId);
  if (item === null || item.sourceDeviceId !== sourceDeviceId) {
    throw new RelayResourceNotFoundError("Item not found.");
  }

  return await loadItem(item);
}
