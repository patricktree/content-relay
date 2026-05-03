import { Token } from "dioma";

export const blobStoreToken = new Token<IBlobStore>("BlobStore");

export type IBlobStore = {
  write(itemId: string, fileId: string, content: Uint8Array): Promise<string>;
  read(storedFileName: string): Promise<Uint8Array>;
};
