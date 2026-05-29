import { expect } from "@playwright/test";

import { withRelayHubTestEnvironment } from "@content-relay/relay-hub-test-utils";
import { seed } from "@content-relay/seeding-tool";

import { test } from "#pkg-test-e2e/globals.ts";
import { gotoWebApp, prepareWebApp } from "#pkg-test-e2e/helpers.ts";

test("keep send form unavailable when relay hub cannot be reached", async ({ page }) => {
  await prepareWebApp(page, {
    settings: {
      relayHubUrl: "http://127.0.0.1:9",
      deviceNickname: "test-device-browser",
    },
  });

  await gotoWebApp(page);

  await expect(page.getByRole("form", { name: "Send item" })).toBeHidden();
});

test("keep send form unavailable when device registration fails", async ({ page }) => {
  await withRelayHubTestEnvironment(async ({ relayHubBaseUrl }) => {
    await prepareWebApp(page, {
      settings: {
        relayHubUrl: relayHubBaseUrl,
        deviceNickname: "test-device-browser",
      },
    });
    await page.route(`${relayHubBaseUrl}/devices/register`, async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "forced registration failure" }),
      });
    });

    await gotoWebApp(page);

    await expect(page.getByRole("form", { name: "Send item" })).toBeHidden();
  });
});

test("keep target devices unavailable when device listing fails", async ({ page }) => {
  await withRelayHubTestEnvironment(async ({ relayHubBaseUrl }) => {
    await seed.registerDevices(relayHubBaseUrl, [
      { nickname: "test-device-generic", platform: "cli" },
    ]);
    await prepareWebApp(page, {
      settings: {
        relayHubUrl: relayHubBaseUrl,
        deviceNickname: "test-device-browser",
      },
    });
    await page.route(`${relayHubBaseUrl}/devices`, async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "forced list failure" }),
      });
    });

    await gotoWebApp(page);

    await expect(page.getByRole("form", { name: "Send item" })).toBeHidden();
  });
});
