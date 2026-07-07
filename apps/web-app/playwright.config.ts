import { defineConfig, devices } from "@playwright/test";
import os from "node:os";
import path from "node:path";

const PLAYWRIGHT_VERSION = "1.61.1";
const PLAYWRIGHT_SERVER_PORT_ENV = "PLAYWRIGHT_SERVER_PORT";

const isDebug = process.env["PWDEBUG"] === "1";
const isCI = Boolean(process.env["CI"]);
const useDocker = !isDebug;

const playwrightOutputDir = "./playwright-output";
const testResultsOutputDir = path.join(playwrightOutputDir, "test-results");
const htmlReportOutputDir = path.join(playwrightOutputDir, "html-report");

export default defineConfig({
  testDir: "./test-e2e",
  fullyParallel: true,
  forbidOnly: isCI,
  outputDir: testResultsOutputDir,
  retries: isCI ? 2 : 0,
  // More than 4 parallel test workers run into timeouts even on beefy machines.
  workers: Math.min(4, os.availableParallelism()),
  timeout: 10_000,
  reporter: isCI
    ? [["html", { open: "never", outputFolder: htmlReportOutputDir }], ["github"]]
    : [["html", { open: "never", outputFolder: htmlReportOutputDir }]],
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
      },
    },
  ],
  snapshotPathTemplate: `{testDir}/../snapshots/{testFilePath}/{arg}-{projectName}-${
    useDocker ? "docker" : "{platform}"
  }{ext}`,
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0,
    },
  },
  use: {
    baseURL: "http://localhost:4173",
    trace: "on",
    connectOptions: useDocker
      ? {
          wsEndpoint: `ws://127.0.0.1:${process.env[PLAYWRIGHT_SERVER_PORT_ENV] ?? ""}/`,
        }
      : undefined,
  },
  webServer: [
    {
      command: "pnpm run dev --port 4173 --strict-port",
      port: 4173,
      reuseExistingServer: !isCI,
    },
    ...(useDocker
      ? [
          {
            command: `docker run --rm --init --workdir /home/pwuser --user pwuser --network host mcr.microsoft.com/playwright:v${PLAYWRIGHT_VERSION}-noble /bin/sh -c "npx -y playwright@${PLAYWRIGHT_VERSION} run-server --host 0.0.0.0"`,
            wait: {
              stdout: new RegExp(
                String.raw`Listening on ws:\/\/0\.0\.0\.0:(?<${PLAYWRIGHT_SERVER_PORT_ENV}>\d+)`,
              ),
            },
            stdout: "pipe",
            stderr: "pipe",
            timeout: 60_000,
            gracefulShutdown: {
              signal: "SIGTERM",
              timeout: 10_000,
            },
            reuseExistingServer: !isCI,
          } as const,
        ]
      : []),
  ],
});
