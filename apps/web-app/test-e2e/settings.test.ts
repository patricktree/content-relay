import { expect } from "@playwright/test";

import { withRelayHubTestEnvironment } from "@content-relay/relay-hub-test-utils";

import type { Settings } from "#pkg/settings-storage.js";

import { test } from "#pkg-test-e2e/globals.ts";
import { gotoWebApp, prepareWebApp } from "#pkg-test-e2e/helpers.ts";

test("save settings", async ({ page }) => {
  await withRelayHubTestEnvironment(async ({ relayHubBaseUrl }) => {
    await gotoWebApp(page);

    await page.getByRole("textbox", { name: "Relay Hub URL:" }).fill(relayHubBaseUrl);
    await page.getByRole("textbox", { name: "Device Nickname:" }).fill("test-device-browser");
    await page.getByRole("button", { name: "Save" }).click();

    await expect(
      page
        .getByRole("region", { name: "Notifications" })
        .getByRole("dialog", { name: "Settings saved" }),
    ).toBeVisible();

    await expect(page.evaluate(() => window.localStorage.getItem("settings"))).resolves.toBe(
      JSON.stringify({
        relayHubUrl: relayHubBaseUrl,
        deviceNickname: "test-device-browser",
      } satisfies Settings),
    );
  });
});

test("automatically loads saved settings on page load", async ({ page }) => {
  await withRelayHubTestEnvironment(async ({ relayHubBaseUrl }) => {
    await prepareWebApp(page, {
      settings: {
        relayHubUrl: relayHubBaseUrl,
        deviceNickname: "test-device-browser",
      },
    });

    await gotoWebApp(page);

    await expect(page.getByRole("textbox", { name: "Relay Hub URL:" })).toHaveValue(
      relayHubBaseUrl,
    );
    await expect(page.getByRole("textbox", { name: "Device Nickname:" })).toHaveValue(
      "test-device-browser",
    );
    const sendItemForm = page.getByRole("form", { name: "Send item" });
    await expect(sendItemForm).toBeVisible();
    await expect(sendItemForm.getByRole("checkbox")).toHaveCount(0);
  });
});

test("change settings", async ({ page }) => {
  await withRelayHubTestEnvironment(async ({ relayHubBaseUrl }) => {
    await prepareWebApp(page, {
      settings: {
        relayHubUrl: relayHubBaseUrl,
        deviceNickname: "test-old-device-browser",
      },
    });

    await gotoWebApp(page);

    await page.getByRole("textbox", { name: "Relay Hub URL:" }).fill(relayHubBaseUrl);
    await page.getByRole("textbox", { name: "Device Nickname:" }).fill("test-new-device-browser");
    await page.getByRole("button", { name: "Save" }).click();

    await expect(
      page
        .getByRole("region", { name: "Notifications" })
        .getByRole("dialog", { name: "Settings saved" }),
    ).toBeVisible();

    await expect(page.evaluate(() => window.localStorage.getItem("settings"))).resolves.toBe(
      JSON.stringify({
        relayHubUrl: relayHubBaseUrl,
        deviceNickname: "test-new-device-browser",
      } satisfies Settings),
    );
  });
});

test("hide send form until settings are saved", async ({ page }) => {
  await gotoWebApp(page);

  await expect(page.getByRole("form", { name: "Send item" })).toBeHidden();
});

test("fail fast when saved settings are malformed JSON", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("settings", "not-json");
  });
  const pageErrorPromise = page.waitForEvent("pageerror");

  await gotoWebApp(page);

  const pageError = await pageErrorPromise;
  expect(pageError.message).toContain("JSON");
  await expect(page.getByRole("form", { name: "Send item" })).toBeHidden();
});

test("fail fast when saved settings do not match the schema", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "settings",
      JSON.stringify({ relayHubUrl: "not-a-url", deviceNickname: "test-device-browser" }),
    );
  });
  const pageErrorPromise = page.waitForEvent("pageerror");

  await gotoWebApp(page);

  const pageError = await pageErrorPromise;
  expect(pageError.message).toContain("Invalid URL");
  await expect(page.getByRole("form", { name: "Send item" })).toBeHidden();
});

test("reject invalid relay hub URL settings", async ({ page }) => {
  await gotoWebApp(page);

  await page.getByRole("textbox", { name: "Relay Hub URL:" }).fill("not-a-url");
  await page.getByRole("textbox", { name: "Device Nickname:" }).fill("test-device-browser");
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page.getByText("Invalid URL")).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "Notifications" })
      .getByRole("dialog", { name: "Settings saved" }),
  ).toBeHidden();
  await expect(page.evaluate(() => window.localStorage.getItem("settings"))).resolves.toBeNull();
});

test("keep saved settings after reload", async ({ page }) => {
  await withRelayHubTestEnvironment(async ({ relayHubBaseUrl }) => {
    await gotoWebApp(page);

    await page.getByRole("textbox", { name: "Relay Hub URL:" }).fill(relayHubBaseUrl);
    await page.getByRole("textbox", { name: "Device Nickname:" }).fill("test-device-browser");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(
      page
        .getByRole("region", { name: "Notifications" })
        .getByRole("dialog", { name: "Settings saved" }),
    ).toBeVisible();

    await page.reload({ waitUntil: "networkidle" });

    await expect(page.getByRole("textbox", { name: "Relay Hub URL:" })).toHaveValue(
      relayHubBaseUrl,
    );
    await expect(page.getByRole("textbox", { name: "Device Nickname:" })).toHaveValue(
      "test-device-browser",
    );
  });
});

test("close settings saved notification", async ({ page }) => {
  await withRelayHubTestEnvironment(async ({ relayHubBaseUrl }) => {
    await gotoWebApp(page);

    await page.getByRole("textbox", { name: "Relay Hub URL:" }).fill(relayHubBaseUrl);
    await page.getByRole("textbox", { name: "Device Nickname:" }).fill("test-device-browser");
    await page.getByRole("button", { name: "Save" }).click();
    const notification = page
      .getByRole("region", { name: "Notifications" })
      .getByRole("dialog", { name: "Settings saved" });
    await expect(notification).toBeVisible();

    await notification.getByText("X").click();

    await expect(notification).toBeHidden();
  });
});
