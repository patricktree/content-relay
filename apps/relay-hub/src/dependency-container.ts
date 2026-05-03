import { Container } from "dioma";
import path from "node:path";

import { FileSystemBlobStore } from "#pkg/infrastructure/blob-store/file-system-blob-store.ts";
import { SqliteRelayHubRepository } from "#pkg/infrastructure/db/sqlite-relay-hub-repository.ts";
import { SystemClock } from "#pkg/infrastructure/system-clock.ts";
import { blobStoreToken } from "#pkg/interfaces/blob-store.interface.ts";
import { clockToken } from "#pkg/interfaces/clock.interface.ts";
import { relayRepositoryToken } from "#pkg/interfaces/relay-hub-repository.interface.ts";
import { relayHubBaseUrlToken } from "#pkg/use-cases/shared.ts";
import { ensureDirectoryExists } from "#pkg/util/fs.util.ts";

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
    ensureDirectoryExists(databaseDirectory),
    ensureDirectoryExists(blobsDirectory),
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
