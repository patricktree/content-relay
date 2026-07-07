import { serve } from "@hono/node-server";
import { createLogger } from "@patricktree-stack/o11y.logs";
import { processUtil } from "@patricktree/commons-node/utils/process";
import util from "node:util";

import type { createHonoApp } from "#src/http/hono-app.ts";
import { instrumentationScopeFromModuleURL } from "#src/observability/instrumentation-scope.ts";

const logger = createLogger(instrumentationScopeFromModuleURL(import.meta.url));

export async function startServer(options: {
  app: Awaited<ReturnType<typeof createHonoApp>>;
  port: number;
}) {
  const server = serve({ fetch: options.app.fetch, port: options.port });
  const closeServer = util.promisify(server.close.bind(server));
  async function stopServer() {
    logger.info("Stopping relay-hub...");
    await closeServer();
  }

  const unsubscribeExitHook = processUtil.asyncExitHook(
    async function shutdownHonoServerOnProcessExit() {
      logger.info("Process exiting, shutting down relay-hub...");
      await stopServer();
    },
    5_000,
  );

  return {
    async stop() {
      unsubscribeExitHook();
      await stopServer();
    },
  };
}
