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

    await expect(expectItemSentNotification(page)).toBeVisible();

    const receivedDeliveries = await parseOkResponse(
      new RpcClient(relayHubBaseUrl)
        .createDeviceRpcClient(receiverDeviceId)
        .listDeliveries({ state: "pending" }),
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

    await expect(expectItemSentNotification(page)).toBeVisible();

    const receivedDeliveries = await parseOkResponse(
      new RpcClient(relayHubBaseUrl)
        .createDeviceRpcClient(receiverDeviceId)
        .listDeliveries({ state: "pending" }),
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

test("require a target device before sending", async ({ page }) => {
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

    await gotoWebApp(page);
    const sendItemForm = page.getByRole("form", { name: "Send item" });
    await sendItemForm.getByRole("textbox", { name: "Text:" }).fill("test-text");
    await sendItemForm.getByRole("button", { name: "Send" }).click();

    await expect(sendItemForm.getByText("Select a target device.")).toBeVisible();
    await expect(expectItemSentNotification(page)).not.toBeVisible();
  });
});

test("require text content before sending text item", async ({ page }) => {
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

    await gotoWebApp(page);
    const sendItemForm = await chooseTargetDevice(page, "test-device-generic (cli)");
    await sendItemForm.getByRole("button", { name: "Send" }).click();

    await expect(sendItemForm.getByText("Enter the text to send.")).toBeVisible();
    await expect(expectItemSentNotification(page)).not.toBeVisible();
  });
});

test("require an absolute URL before sending URL item", async ({ page }) => {
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

    await gotoWebApp(page);
    const sendItemForm = await chooseTargetDevice(page, "test-device-generic (cli)");
    await sendItemForm.getByRole("combobox", { name: "Item type:" }).selectOption("url");
    await sendItemForm.getByRole("textbox", { name: /URL:/ }).fill("example.com/article");
    await sendItemForm.getByRole("button", { name: "Send" }).click();

    await expect(sendItemForm.getByText("Enter a valid absolute URL.")).toBeVisible();
    await expect(expectItemSentNotification(page)).not.toBeVisible();
  });
});

test("switch item type between text and URL inputs", async ({ page }) => {
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

    await gotoWebApp(page);
    const sendItemForm = page.getByRole("form", { name: "Send item" });
    await expect(sendItemForm.getByRole("textbox", { name: "Text:" })).toBeVisible();

    await sendItemForm.getByRole("combobox", { name: "Item type:" }).selectOption("url");

    await expect(sendItemForm.getByRole("textbox", { name: "URL:" })).toBeVisible();

    await sendItemForm.getByRole("combobox", { name: "Item type:" }).selectOption("text");

    await expect(sendItemForm.getByRole("textbox", { name: "Text:" })).toBeVisible();
  });
});

test("trim text item values and omit blank title", async ({ page }) => {
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
    await sendItemForm.getByRole("textbox", { name: "Title:" }).fill("   ");
    await sendItemForm.getByRole("textbox", { name: "Text:" }).fill("  spaced text  ");
    await sendItemForm.getByRole("button", { name: "Send" }).click();

    await expect(expectItemSentNotification(page)).toBeVisible();

    const receivedDeliveries = await parseOkResponse(
      new RpcClient(relayHubBaseUrl)
        .createDeviceRpcClient(receiverDeviceId)
        .listDeliveries({ state: "pending" }),
    );
    expect(receivedDeliveries.deliveries).toHaveLength(1);
    expect(receivedDeliveries.deliveries[0]?.item).toMatchObject({
      title: null,
      text: "spaced text",
    });
  });
});

test("send an item to multiple target devices", async ({ page }) => {
  await withRelayHubTestEnvironment(async ({ relayHubBaseUrl }) => {
    const [firstReceiver, secondReceiver] = await seed.registerDevices(relayHubBaseUrl, [
      { nickname: "first-receiver", platform: "cli" },
      { nickname: "second-receiver", platform: "android" },
    ]);
    await prepareWebApp(page, {
      settings: {
        relayHubUrl: relayHubBaseUrl,
        deviceNickname: "test-device-browser",
      },
    });

    await gotoWebApp(page);
    const sendItemForm = page.getByRole("form", { name: "Send item" });
    await sendItemForm.getByRole("checkbox", { name: "first-receiver (cli)" }).check();
    await sendItemForm.getByRole("checkbox", { name: "second-receiver (android)" }).check();
    await sendItemForm.getByRole("textbox", { name: "Text:" }).fill("group text");
    await sendItemForm.getByRole("button", { name: "Send" }).click();

    await expect(expectItemSentNotification(page)).toBeVisible();

    for (const receiver of [firstReceiver, secondReceiver]) {
      const receivedDeliveries = await parseOkResponse(
        new RpcClient(relayHubBaseUrl)
          .createDeviceRpcClient(receiver.deviceId)
          .listDeliveries({ state: "pending" }),
      );
      expect(receivedDeliveries.deliveries).toHaveLength(1);
      expect(receivedDeliveries.deliveries[0]?.item).toMatchObject({ text: "group text" });
    }
  });
});

test("disable send button while text item submission is pending", async ({ page }) => {
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
    const sendRequest = createDeferred<void>();
    await page.route(`${relayHubBaseUrl}/items/text`, async (route) => {
      await sendRequest.promise;
      await route.continue();
    });

    await gotoWebApp(page);
    const sendItemForm = await chooseTargetDevice(page, "test-device-generic (cli)");
    await sendItemForm.getByRole("textbox", { name: "Text:" }).fill("test-text");
    await sendItemForm.getByRole("button", { name: "Send" }).click();

    const pendingSubmitButton = sendItemForm.getByRole("button", { name: "Sending…" });
    await expect(pendingSubmitButton).toBeDisabled();

    sendRequest.resolve();
    await expect(expectItemSentNotification(page)).toBeVisible();
  });
});

test("do not show success notification when text item submission fails", async ({ page }) => {
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
    await page.route(`${relayHubBaseUrl}/items/text`, async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "forced failure" }),
      });
    });

    await gotoWebApp(page);
    const sendItemForm = await chooseTargetDevice(page, "test-device-generic (cli)");
    await sendItemForm.getByRole("textbox", { name: "Text:" }).fill("test-text");
    await sendItemForm.getByRole("button", { name: "Send" }).click();

    await expect(expectItemSentNotification(page)).not.toBeVisible();
    const receivedDeliveries = await parseOkResponse(
      new RpcClient(relayHubBaseUrl)
        .createDeviceRpcClient(receiverDeviceId)
        .listDeliveries({ state: "pending" }),
    );
    expect(receivedDeliveries.deliveries).toHaveLength(0);
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

function expectItemSentNotification(page: Page): Locator {
  return page
    .getByRole("region", { name: "Notifications" })
    .getByRole("dialog", { name: "Item sent" });
}

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
};

function createDeferred<T>(): Deferred<T> {
  let resolve: Deferred<T>["resolve"] | undefined;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });

  if (resolve === undefined) {
    throw new Error("Expected deferred resolve callback to be initialized.");
  }

  return { promise, resolve };
}
