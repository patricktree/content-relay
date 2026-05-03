import { getDiContainer } from "#pkg/dependency-container-context.ts";
import { blobStoreToken } from "#pkg/interfaces/blob-store.interface.ts";
import { relayRepositoryToken } from "#pkg/interfaces/relay-hub-repository.interface.ts";

export async function readStoredFiles(itemId: string) {
  const repository = getDiContainer().inject(relayRepositoryToken);
  const blobStore = getDiContainer().inject(blobStoreToken);
  const files = await repository.getFileMetadataByItemId(itemId);

  return await Promise.all(
    files.map(async (file) => ({
      metadata: file,
      content: await blobStore.read(file.storedFileName),
    })),
  );
}
