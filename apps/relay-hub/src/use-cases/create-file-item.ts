import { randomUUID } from "node:crypto";

import { type FileMetadata } from "@content-relay/shared";

import { getDiContainer } from "#pkg/dependency-container-context.ts";
import { RelayInvalidInputError } from "#pkg/errors.ts";
import { blobStoreToken } from "#pkg/interfaces/blob-store.interface.ts";
import { relayRepositoryToken } from "#pkg/interfaces/relay-hub-repository.interface.ts";
import { createItem, type CreateItemOutput } from "#pkg/use-cases/create-item.ts";

type FileUpload = {
  fileName: string;
  contentType: string;
  content: Uint8Array;
};

export type CreateFileItemOutput = CreateItemOutput & {
  files: FileMetadata[];
};

export async function createFileItem(
  sourceDeviceId: string,
  input: {
    title?: string;
    targetDeviceIds: string[];
    files: FileUpload[];
  },
): Promise<CreateFileItemOutput> {
  if (input.files.length === 0) {
    throw new RelayInvalidInputError("Expected at least one uploaded file.");
  }

  const repository = getDiContainer().inject(relayRepositoryToken);
  const blobStore = getDiContainer().inject(blobStoreToken);

  const result = await createItem(sourceDeviceId, {
    type: "file",
    ...(input.title !== undefined ? { title: input.title } : {}),
    targetDeviceIds: input.targetDeviceIds,
  });

  const itemId = result.item.id;
  const fileMetadata: FileMetadata[] = [];
  for (const [index, file] of input.files.entries()) {
    const fileId = `file_${randomUUID()}`;
    const storedFileName = await blobStore.write(itemId, fileId, file.content);
    fileMetadata.push({
      fileId,
      itemId,
      order: index,
      fileName: file.fileName,
      storedFileName,
      contentType: file.contentType || "application/octet-stream",
      sizeBytes: file.content.byteLength,
    });
  }

  await repository.createFileMetadata(fileMetadata);

  return {
    ...result,
    files: fileMetadata,
  };
}
