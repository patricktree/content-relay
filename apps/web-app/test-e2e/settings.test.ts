import { expect, type Page } from "@playwright/test";

import { parseOkResponse, rpcClient } from "@content-relay/client";
import { withRelayHubTestEnvironment } from "@content-relay/relay-hub-test-utils";

import type { Settings } from "#pkg/settings-storage.js";

import { test } from "#pkg-test-e2e/globals.ts";
import { gotoWebApp, prepareWebApp } from "#pkg-test-e2e/helpers.ts";

test("save settings", async ({ page }) => {
  await withRelayHubTestEnvironment(async ({ relayHubBaseUrl }) => {
    const inviteDeviceBrowser = await parseOkResponse(
      rpcClient.createInvite(relayHubBaseUrl, { expiresInSeconds: 60 }),
    );
    const registerResultDeviceBrowser = await parseOkResponse(
      rpcClient.registerDevice(relayHubBaseUrl, {
        nickname: "test-device-browser",
        platform: "generic",
        invite: inviteDeviceBrowser.inviteCode,
      }),
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
    const inviteDeviceBrowser = await parseOkResponse(
      rpcClient.createInvite(relayHubBaseUrl, { expiresInSeconds: 60 }),
    );
    const registerResultDeviceBrowser = await parseOkResponse(
      rpcClient.registerDevice(relayHubBaseUrl, {
        nickname: "test-device-browser",
        platform: "generic",
        invite: inviteDeviceBrowser.inviteCode,
      }),
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
    await expect(page.getByRole("form", { name: "Send item" })).toBeVisible();
    await expect(page.getByText("No available devices")).toBeVisible();
  });
});

test("change settings", async ({ page }) => {
  await withRelayHubTestEnvironment(async ({ relayHubBaseUrl }) => {
    const inviteOldDeviceBrowser = await parseOkResponse(
      rpcClient.createInvite(relayHubBaseUrl, { expiresInSeconds: 60 }),
    );
    const registerResultOldDeviceBrowser = await parseOkResponse(
      rpcClient.registerDevice(relayHubBaseUrl, {
        nickname: "test-old-device-browser",
        platform: "generic",
        invite: inviteOldDeviceBrowser.inviteCode,
      }),
    );

    const inviteNewDeviceBrowser = await parseOkResponse(
      rpcClient.createInvite(relayHubBaseUrl, { expiresInSeconds: 60 }),
    );
    const registerResultNewDeviceBrowser = await parseOkResponse(
      rpcClient.registerDevice(relayHubBaseUrl, {
        nickname: "test-new-device-browser",
        platform: "generic",
        invite: inviteNewDeviceBrowser.inviteCode,
      }),
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

async function openSettings(page: Page): Promise<void> {
  await page.getByText("Settings").click();
}
