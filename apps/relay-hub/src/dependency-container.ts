import { fsUtils } from "@patricktree-stack/utils-node/fs.utils";
import { Container } from "dioma";
import path from "node:path";

import { FileSystemBlobStore } from "#src/infrastructure/blob-store/file-system-blob-store.ts";
import { SqliteRelayHubRepository } from "#src/infrastructure/db/sqlite-relay-hub-repository.ts";
import { SystemClock } from "#src/infrastructure/system-clock.ts";
import { blobStoreToken } from "#src/interfaces/blob-store.interface.ts";
import { clockToken } from "#src/interfaces/clock.interface.ts";
import { relayRepositoryToken } from "#src/interfaces/relay-hub-repository.interface.ts";
import { relayHubBaseUrlToken } from "#src/use-cases/shared.ts";

export type CreateDependencyContainerOptions = {
  relayHubBaseUrl: string;
  dataDirectory: string;
};

export async function createDependencyContainer(
  options: CreateDependencyContainerOptions,
): Promise<Container> {
  const databaseDirectory = path.join(options.dataDirectory, "db");
  const blobsDirectory = path.join(options.dataDirectory, "blobs");

  await Promise.all([
    fsUtils.ensureDirectoryExists(databaseDirectory),
    fsUtils.ensureDirectoryExists(blobsDirectory),
  ]);

  const container = new Container(null, "content-relay-hub");

  container.register({ token: relayHubBaseUrlToken, value: options.relayHubBaseUrl });
  container.register({
    token: relayRepositoryToken,
    value: new SqliteRelayHubRepository({ databaseDirectory }),
  });
  container.register({ token: blobStoreToken, value: new FileSystemBlobStore({ blobsDirectory }) });
  container.register({ token: clockToken, value: new SystemClock() });

  return container;
}
