import { getDiContainer } from "#src/dependency-container-context.ts";
import { RelayResourceNotFoundError } from "#src/errors.ts";
import { relayRepositoryToken } from "#src/interfaces/relay-hub-repository.interface.ts";
import { loadItem, type LoadedItem } from "#src/use-cases/load-item.ts";

export async function getItem(sourceDeviceId: string, itemId: string): Promise<LoadedItem> {
  const repository = getDiContainer().inject(relayRepositoryToken);

  const item = await repository.getItemById(itemId);
  if (item === null || item.sourceDeviceId !== sourceDeviceId) {
    throw new RelayResourceNotFoundError("Item not found.");
  }

  return await loadItem(item);
}
