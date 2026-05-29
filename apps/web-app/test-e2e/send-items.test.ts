import { expect, type Locator, type Page } from "@playwright/test";

import { parseOkResponse, RpcClient } from "@content-relay/client";
import { withRelayHubTestEnvironment } from "@content-relay/relay-hub-test-utils";
import { seed } from "@content-relay/seeding-tool";

import { test } from "#pkg-test-e2e/globals.ts";
import { gotoWebApp, prepareWebApp } from "#pkg-test-e2e/helpers.ts";

test("send text item", async ({ page }) => {
  await withRelayHubTestEnvironment(async ({ relayHubBaseUrl }) => {
    const [{ deviceId: receiverDeviceId }] = await seed.registerDevices(relayHubBaseUrl, [
      { nickname: "test-device-generic", platform: "cli" },
    ]);

    await prepareWebApp(page, {
      settings: {
        relayHubUrl: relayHubBaseUrl,
        deviceNickname: "test-device-browser",
      },
    });

    await gotoWebApp(page);
    const sendItemForm = await chooseTargetDevice(page, "test-device-generic (cli)");
    await sendItemForm.getByRole("textbox", { name: "Title:" }).fill("test-title");
    await sendItemForm.getByRole("textbox", { name: "Text:" }).fill("test-text");
    await sendItemForm.getByRole("button", { name: "Send" }).click();

    await expectItemSentNotification(page);

    const receivedDeliveries = await parseOkResponse(
      new RpcClient(relayHubBaseUrl)
        .createDeviceRpcClient(receiverDeviceId)
        .fetchPendingDeliveries(),
    );
    expect(receivedDeliveries.deliveries).toHaveLength(1);
    expect(receivedDeliveries.deliveries[0]?.item).toMatchObject({
      type: "text",
      title: "test-title",
      text: "test-text",
      url: null,
    });
  });
});

test("send URL item", async ({ page }) => {
  await withRelayHubTestEnvironment(async ({ relayHubBaseUrl }) => {
    const [{ deviceId: receiverDeviceId }] = await seed.registerDevices(relayHubBaseUrl, [
      { nickname: "test-device-generic", platform: "cli" },
    ]);

    await prepareWebApp(page, {
      settings: {
        relayHubUrl: relayHubBaseUrl,
        deviceNickname: "test-device-browser",
      },
    });

    await gotoWebApp(page);
    const sendItemForm = await chooseTargetDevice(page, "test-device-generic (cli)");
    await sendItemForm.getByRole("combobox", { name: "Item type:" }).selectOption("url");
    await sendItemForm.getByRole("textbox", { name: "Title:" }).fill("test-url-title");
    await sendItemForm.getByRole("textbox", { name: /URL:/ }).fill("https://example.com/article");
    await sendItemForm.getByRole("button", { name: "Send" }).click();

    await expectItemSentNotification(page);

    const receivedDeliveries = await parseOkResponse(
      new RpcClient(relayHubBaseUrl)
        .createDeviceRpcClient(receiverDeviceId)
        .fetchPendingDeliveries(),
    );
    expect(receivedDeliveries.deliveries).toHaveLength(1);
    expect(receivedDeliveries.deliveries[0]?.item).toMatchObject({
      type: "url",
      title: "test-url-title",
      text: null,
      url: "https://example.com/article",
    });
  });
});

test("matches send form screenshot", async ({ page }) => {
  await withRelayHubTestEnvironment(async ({ relayHubBaseUrl }) => {
    await seed.registerDevices(relayHubBaseUrl, [
      { nickname: "Pixel 9", platform: "android" },
      { nickname: "iPhone", platform: "ios" },
      { nickname: "Desk Mac", platform: "macos" },
    ]);

    await prepareWebApp(page, {
      settings: {
        relayHubUrl: relayHubBaseUrl,
        deviceNickname: "MacBook",
      },
    });

    await gotoWebApp(page);
    const sendItemForm = page.getByRole("form", { name: "Send item" });
    await expect(sendItemForm.getByRole("checkbox", { name: "Pixel 9 (android)" })).toBeVisible();
    await expect(sendItemForm.getByRole("checkbox", { name: "iPhone (ios)" })).toBeVisible();
    await expect(sendItemForm.getByRole("checkbox", { name: "Desk Mac (macos)" })).toBeVisible();

    await expect(sendItemForm).toHaveScreenshot("send-form.png");
  });
});

async function chooseTargetDevice(page: Page, targetDevice: string): Promise<Locator> {
  const sendItemForm = page.getByRole("form", { name: "Send item" });
  const targetDeviceCheckbox = sendItemForm.getByRole("checkbox", {
    name: targetDevice,
  });
  await expect(targetDeviceCheckbox).toBeEnabled();
  await expect(sendItemForm.getByText("test-device-browser")).toBeHidden();
  await targetDeviceCheckbox.check();
  await expect(targetDeviceCheckbox).toBeChecked();

  return sendItemForm;
}

async function expectItemSentNotification(page: Page): Promise<void> {
  await expect(
    page.getByRole("region", { name: "Notifications" }).getByRole("dialog", { name: "Item sent" }),
  ).toBeVisible();
}
