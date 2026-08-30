import { createPlaywrightDockerConfig } from "@patricktree-stack/config-playwright/playwright-docker";
import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

const isCI = Boolean(process.env["CI"]);

const playwrightOutputDir = "./playwright-output";
const testResultsOutputDir = path.join(playwrightOutputDir, "test-results");
const htmlReportOutputDir = path.join(playwrightOutputDir, "html-report");

// Apply the shared configuration first so Playwright can merge these repository-specific settings
// with the Docker server, stable snapshot paths, CI safeguards, and debugging defaults.
export default defineConfig(createPlaywrightDockerConfig({ isCI }), {
  testDir: "./test-e2e",
  outputDir: testResultsOutputDir,
  retries: isCI ? 2 : 0,
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
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0,
    },
  },
  use: {
    baseURL: "http://localhost:4173",
    trace: "on",
  },
  // Playwright appends this repository-specific app server to the Docker browser server from the shared configuration.
  webServer: [
    {
      command: "pnpm run dev --port 4173 --strict-port",
      port: 4173,
      reuseExistingServer: !isCI,
    },
  ],
});
