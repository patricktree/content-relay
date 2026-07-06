import { getDiContainer } from "#src/dependency-container-context.ts";
import { relayRepositoryToken } from "#src/interfaces/relay-hub-repository.interface.ts";
import { loadItem, type LoadedItem } from "#src/use-cases/load-item.ts";

export async function listItems(sourceDeviceId: string, limit: number): Promise<LoadedItem[]> {
  const repository = getDiContainer().inject(relayRepositoryToken);

  const items = await repository.listItemsBySourceDevice(sourceDeviceId, limit);

  return await Promise.all(items.map(async (item) => await loadItem(item)));
}
