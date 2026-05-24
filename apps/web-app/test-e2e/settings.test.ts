import { expect, type Page } from "@playwright/test";

import { parseOkResponse, RpcClient } from "@content-relay/client";
import { withRelayHubTestEnvironment } from "@content-relay/relay-hub-test-utils";

import type { Settings } from "#pkg/settings-storage.js";

import { test } from "#pkg-test-e2e/globals.ts";
import { gotoWebApp, prepareWebApp } from "#pkg-test-e2e/helpers.ts";

test("save settings", async ({ page }) => {
  await withRelayHubTestEnvironment(async ({ relayHubBaseUrl }) => {
    const registerResultDeviceBrowser = await registerTestDevice(
      relayHubBaseUrl,
      "test-device-browser",
    );

    await gotoWebApp(page);
    await openSettings(page);

    await page.getByRole("textbox", { name: "Relay Hub URL:" }).fill(relayHubBaseUrl);
    await page
      .getByRole("textbox", { name: "Device ID:" })
      .fill(registerResultDeviceBrowser.deviceId);
    await page.getByRole("button", { name: "Save" }).click();

    await expect(
      page
        .getByRole("region", { name: "Notifications" })
        .getByRole("dialog", { name: "Settings saved" }),
    ).toBeVisible();

    await expect(page.evaluate(() => window.localStorage.getItem("settings"))).resolves.toBe(
      JSON.stringify({
        relayHubUrl: relayHubBaseUrl,
        deviceId: registerResultDeviceBrowser.deviceId,
      } satisfies Settings),
    );
  });
});

test("automatically loads saved settings on page load", async ({ page }) => {
  await withRelayHubTestEnvironment(async ({ relayHubBaseUrl }) => {
    const registerResultDeviceBrowser = await registerTestDevice(
      relayHubBaseUrl,
      "test-device-browser",
    );

    await prepareWebApp(page, {
      settings: {
        relayHubUrl: relayHubBaseUrl,
        deviceId: registerResultDeviceBrowser.deviceId,
      },
    });

    await gotoWebApp(page);
    await openSettings(page);

    await expect(page.getByRole("textbox", { name: "Relay Hub URL:" })).toHaveValue(
      relayHubBaseUrl,
    );
    await expect(page.getByRole("textbox", { name: "Device ID:" })).toHaveValue(
      registerResultDeviceBrowser.deviceId,
    );
    const sendItemForm = page.getByRole("form", { name: "Send item" });
    await expect(sendItemForm).toBeVisible();
    await expect(sendItemForm.getByRole("checkbox")).toHaveCount(0);
  });
});

test("change settings", async ({ page }) => {
  await withRelayHubTestEnvironment(async ({ relayHubBaseUrl }) => {
    const registerResultOldDeviceBrowser = await registerTestDevice(
      relayHubBaseUrl,
      "test-old-device-browser",
    );
    const registerResultNewDeviceBrowser = await registerTestDevice(
      relayHubBaseUrl,
      "test-new-device-browser",
    );

    await prepareWebApp(page, {
      settings: {
        relayHubUrl: relayHubBaseUrl,
        deviceId: registerResultOldDeviceBrowser.deviceId,
      },
    });

    await gotoWebApp(page);
    await openSettings(page);

    await page.getByRole("textbox", { name: "Relay Hub URL:" }).fill(relayHubBaseUrl);
    await page
      .getByRole("textbox", { name: "Device ID:" })
      .fill(registerResultNewDeviceBrowser.deviceId);
    await page.getByRole("button", { name: "Save" }).click();

    await expect(
      page
        .getByRole("region", { name: "Notifications" })
        .getByRole("dialog", { name: "Settings saved" }),
    ).toBeVisible();

    await expect(page.evaluate(() => window.localStorage.getItem("settings"))).resolves.toBe(
      JSON.stringify({
        relayHubUrl: relayHubBaseUrl,
        deviceId: registerResultNewDeviceBrowser.deviceId,
      } satisfies Settings),
    );
  });
});

async function registerTestDevice(relayHubBaseUrl: string, nickname: string) {
  return parseOkResponse(
    new RpcClient(relayHubBaseUrl).registerDevice({
      nickname,
      platform: "generic",
    }),
  );
}

async function openSettings(page: Page): Promise<void> {
  await page.getByText("Settings").click();
}
