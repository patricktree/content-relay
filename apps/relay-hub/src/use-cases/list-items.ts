import { getDiContainer } from "#pkg/dependency-container-context.ts";
import { relayRepositoryToken } from "#pkg/interfaces/relay-hub-repository.interface.ts";
import { loadItem, type LoadedItem } from "#pkg/use-cases/load-item.ts";

export async function listItems(sourceDeviceId: string, limit: number): Promise<LoadedItem[]> {
  const repository = getDiContainer().inject(relayRepositoryToken);

  const items = await repository.listItemsBySourceDevice(sourceDeviceId, limit);

  return await Promise.all(items.map(async (item) => await loadItem(item)));
}
