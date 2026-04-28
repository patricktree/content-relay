import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { IBlobStore } from "#pkg/interfaces/blob-store.interface.ts";

export type FileSystemBlobStoreOptions = {
  blobsDirectory: string;
};

export class FileSystemBlobStore implements IBlobStore {
  readonly #blobsDirectory: string;

  constructor(options: FileSystemBlobStoreOptions) {
    this.#blobsDirectory = options.blobsDirectory;
  }

  async write(itemId: string, fileId: string, content: Uint8Array): Promise<string> {
    const directory = path.join(this.#blobsDirectory, itemId);
    const storedFileName = path.join(itemId, `${fileId}.blob`);

    await mkdir(directory, { recursive: true });
    await writeFile(path.join(this.#blobsDirectory, storedFileName), content);

    return storedFileName;
  }

  async read(storedFileName: string): Promise<Uint8Array> {
    const file = await readFile(path.join(this.#blobsDirectory, storedFileName));

    return new Uint8Array(file);
  }
}
