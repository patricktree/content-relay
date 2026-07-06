import { Command, InvalidOptionArgumentError, Option } from "@commander-js/extra-typings";
import { numbers } from "@patricktree/commons-ecma/util/numbers";
import { processUtil } from "@patricktree/commons-node/utils/process";
import process from "node:process";

import { createLogger } from "@content-relay/o11y.logs";

import { runWithDiContainer } from "#src/dependency-container-context.ts";
import { createDependencyContainer } from "#src/dependency-container.ts";
import { createHonoApp } from "#src/http/hono-app.ts";
import { startServer } from "#src/http/hono-server.ts";
import { instrumentationScopeFromModuleURL } from "#src/observability/instrumentation-scope.ts";

const logger = createLogger(instrumentationScopeFromModuleURL(import.meta.url));

const program = new Command()
  .name("relay-hub")
  .description("Start the Relay Hub server")
  .showHelpAfterError()
  .addOption(
    new Option("--port <number>", "port to listen on").default(4000).argParser((value) => {
      const parsed = numbers.convert(value);

      if (parsed === undefined || !Number.isInteger(parsed) || parsed <= 0) {
        throw new InvalidOptionArgumentError(
          `Expected a positive integer port but received: ${value}`,
        );
      }

      return parsed;
    }),
  )
  .addOption(
    new Option("--data-dir <path>", "directory for SQLite metadata and filesystem blobs").default(
      ".relay-hub-data",
    ),
  )
  .addOption(
    new Option(
      "--base-url <url>",
      "public base URL advertised to clients; defaults to http://127.0.0.1:<port>",
    ),
  )
  .exitOverride();

program.parse(process.argv);

const options = program.opts();
const relayHubBaseUrl = options.baseUrl ?? `http://127.0.0.1:${options.port}`;

const diContainer = await createDependencyContainer({
  dataDirectory: options.dataDir,
  relayHubBaseUrl,
});

await runWithDiContainer(diContainer, async () => {
  try {
    const app = await createHonoApp();
    await startServer({ app, port: options.port });

    logger.info(`relay-hub listening on ${relayHubBaseUrl} using ${options.dataDir}`, {
      port: options.port,
      dataDirectory: options.dataDir,
      relayHubBaseUrl,
    });
  } catch (error) {
    logger.error({ error }, `Failed to start relay-hub`);
    processUtil.gracefulExit(1);
  }
});
