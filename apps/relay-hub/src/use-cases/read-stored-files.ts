import { getDiContainer } from "#src/dependency-container-context.ts";
import { blobStoreToken } from "#src/interfaces/blob-store.interface.ts";
import { relayRepositoryToken } from "#src/interfaces/relay-hub-repository.interface.ts";

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
