import fs from "node:fs";
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

    await fs.promises.mkdir(directory, { recursive: true });
    await fs.promises.writeFile(path.join(this.#blobsDirectory, storedFileName), content);

    return storedFileName;
  }

  async read(storedFileName: string): Promise<Uint8Array> {
    const file = await fs.promises.readFile(path.join(this.#blobsDirectory, storedFileName));

    return new Uint8Array(file);
  }

  async deleteItem(itemId: string): Promise<void> {
    const directory = path.join(this.#blobsDirectory, itemId);
    await fs.promises.rm(directory, { recursive: true, force: true });
  }
}
