import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  createDependencyContainer,
  createHonoApp,
  runWithDiContainer,
  startServer,
} from "@content-relay/relay-hub";

import { allocatePort } from "#src/network.ts";

export type RelayHubTestEnvironment = {
  rootDirectory: string;
  relayHubBaseUrl: string;
};

export async function withRelayHubTestEnvironment(
  run: (environment: RelayHubTestEnvironment) => Promise<void>,
): Promise<void> {
  const rootDirectory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "content-relay-test-"));
  const port = await allocatePort();
  const relayHubBaseUrl = `http://127.0.0.1:${port}`;

  const diContainer = await createDependencyContainer({
    dataDirectory: path.join(rootDirectory, "relay-hub-data"),
    relayHubBaseUrl,
  });

  try {
    await runWithDiContainer(diContainer, async () => {
      const app = await createHonoApp();
      const server = await startServer({ app, port });

      try {
        await run({
          rootDirectory,
          relayHubBaseUrl,
        });
      } finally {
        await server.stop();
      }
    });
  } finally {
    await fs.promises.rm(rootDirectory, { recursive: true, force: true });
  }
}
