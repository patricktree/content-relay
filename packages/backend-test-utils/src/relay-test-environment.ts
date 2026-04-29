import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  createDependencyContainer,
  createHonoApp,
  runWithDiContainer,
  startServer,
} from "@content-relay/backend";

import { allocatePort } from "#pkg/network.ts";

export type RelayTestEnvironment = {
  rootDirectory: string;
  serverBaseUrl: string;
};

export async function withRelayTestEnvironment(
  run: (environment: RelayTestEnvironment) => Promise<void>,
): Promise<void> {
  const rootDirectory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "content-relay-test-"));
  const port = await allocatePort();
  const serverBaseUrl = `http://127.0.0.1:${port}`;

  const diContainer = await createDependencyContainer({
    dataDirectory: path.join(rootDirectory, "server-data"),
    serverBaseUrl,
  });

  try {
    await runWithDiContainer(diContainer, async () => {
      const app = await createHonoApp();
      const server = await startServer({ app, port });

      try {
        await run({
          rootDirectory,
          serverBaseUrl,
        });
      } finally {
        await server.stop();
      }
    });
  } finally {
    await fs.promises.rm(rootDirectory, { recursive: true, force: true });
  }
}
