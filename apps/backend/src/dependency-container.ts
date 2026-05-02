import { Container } from "dioma";
import path from "node:path";

import { FileSystemBlobStore } from "#pkg/infrastructure/blob-store/file-system-blob-store.ts";
import { SqliteRelayBackendRepository } from "#pkg/infrastructure/db/sqlite-relay-backend-repository.ts";
import { SystemClock } from "#pkg/infrastructure/system-clock.ts";
import { blobStoreToken } from "#pkg/interfaces/blob-store.interface.ts";
import { clockToken } from "#pkg/interfaces/clock.interface.ts";
import { relayRepositoryToken } from "#pkg/interfaces/relay-backend-repository.interface.ts";
import { serverBaseUrlToken } from "#pkg/use-cases/shared.ts";
import { ensureDirectoryExists } from "#pkg/util/fs.util.ts";

export type CreateDependencyContainerOptions = {
  serverBaseUrl: string;
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

  const container = new Container(null, "content-relay-backend");

  container.register({ token: serverBaseUrlToken, value: options.serverBaseUrl });
  container.register({
    token: relayRepositoryToken,
    value: new SqliteRelayBackendRepository({ databaseDirectory }),
  });
  container.register({ token: blobStoreToken, value: new FileSystemBlobStore({ blobsDirectory }) });
  container.register({ token: clockToken, value: new SystemClock() });

  return container;
}
