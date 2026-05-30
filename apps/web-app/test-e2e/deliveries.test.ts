import { expect, type Page } from "@playwright/test";

import { parseOkResponse, RpcClient } from "@content-relay/client";
import type { DeliveryListResponse, DeviceListResponse } from "@content-relay/contracts";
import { withRelayHubTestEnvironment } from "@content-relay/relay-hub-test-utils";
import { seed } from "@content-relay/seeding-tool";

import { test } from "#pkg-test-e2e/globals.ts";
import { gotoWebApp, prepareWebApp } from "#pkg-test-e2e/helpers.ts";

const MOCK_RELAY_HUB_URL = "https://relay-hub.test";

test("show settings-required Delivery empty state", async ({ page }) => {
  await gotoWebApp(page);

  await expect(page.getByText("Save settings to load deliveries for this device.")).toBeVisible();
});

test("show empty Delivery state for the current Device", async ({ page }) => {
  await withRelayHubTestEnvironment(async ({ relayHubBaseUrl }) => {
    await prepareWebApp(page, {
      settings: {
        relayHubUrl: relayHubBaseUrl,
        deviceNickname: "test-device-browser",
      },
    });

    await gotoWebApp(page);

    await expect(page.getByText("No deliveries for this device yet.")).toBeVisible();
  });
});

test("matches empty Deliveries screenshot", async ({ page }) => {
  await prepareWebApp(page, {
    settings: {
      relayHubUrl: MOCK_RELAY_HUB_URL,
      deviceNickname: "test-device-browser",
    },
  });
  await routeStaticDeliveryDependencies(page, {
    deliveries: [],
    pageInfo: { nextCursor: null, hasNextPage: false },
  });

  await gotoWebApp(page);
  const deliveryRegion = page.getByRole("region", { name: "Deliveries" });
  await expect(deliveryRegion.getByText("No deliveries for this device yet.")).toBeVisible();

  await expect(deliveryRegion).toHaveScreenshot("deliveries-empty.png");
});

test("matches populated Deliveries screenshot", async ({ page }) => {
  await prepareWebApp(page, {
    settings: {
      relayHubUrl: MOCK_RELAY_HUB_URL,
      deviceNickname: "test-device-browser",
    },
  });
  await routeStaticDeliveryDependencies(page, createStaticDeliveryListResponse());

  await gotoWebApp(page);
  const deliveryRegion = page.getByRole("region", { name: "Deliveries" });
  await expect(deliveryRegion.getByText("Weekend notes")).toBeVisible();
  await expect(deliveryRegion.getByText("File delivery not supported yet")).toBeVisible();

  await expect(deliveryRegion).toHaveScreenshot("deliveries-populated.png");
});

test("matches Deliveries load failure screenshot", async ({ page }) => {
  await prepareWebApp(page, {
    settings: {
      relayHubUrl: MOCK_RELAY_HUB_URL,
      deviceNickname: "test-device-browser",
    },
  });
  await routeStaticDeliveryDependencies(page, "delivery-list-error");

  await gotoWebApp(page);
  const deliveryRegion = page.getByRole("region", { name: "Deliveries" });
  await expect(deliveryRegion.getByText("Could not load deliveries.")).toBeVisible();

  await expect(deliveryRegion).toHaveScreenshot("deliveries-load-error.png");
});

test("matches seeded Deliveries screenshot", async ({ page }) => {
  await withRelayHubTestEnvironment(async ({ relayHubBaseUrl }) => {
    const [cliDevice, phoneDevice, cameraDevice, targetDevice] = await seed.registerDevices(
      relayHubBaseUrl,
      [
        { nickname: "Desk CLI", platform: "cli" },
        { nickname: "Pixel Phone", platform: "android" },
        { nickname: "Camera", platform: "generic" },
        { nickname: "test-device-browser", platform: "generic" },
      ],
    );

    if (
      cliDevice === undefined ||
      phoneDevice === undefined ||
      cameraDevice === undefined ||
      targetDevice === undefined
    ) {
      throw new Error("Expected source and target devices to be seeded.");
    }

    await parseOkResponse(
      new RpcClient(relayHubBaseUrl).createDeviceRpcClient(cliDevice.deviceId).sendText({
        targetDeviceIds: [targetDevice.deviceId],
        title: "Pending note",
        text: "Pick up coffee beans on the way home.",
      }),
    );
    const deliveredUrl = await parseOkResponse(
      new RpcClient(relayHubBaseUrl).createDeviceRpcClient(phoneDevice.deviceId).sendUrl({
        targetDeviceIds: [targetDevice.deviceId],
        title: "Delivered article",
        url: "https://example.com/delivered-article",
      }),
    );
    const viewedFile = await parseOkResponse(
      new RpcClient(relayHubBaseUrl).createDeviceRpcClient(cameraDevice.deviceId).sendFiles({
        targetDeviceIds: [targetDevice.deviceId],
        title: "Viewed file bundle",
        files: [
          { basename: "receipt.pdf", content: new TextEncoder().encode("receipt") },
          { basename: "photo.jpg", content: new TextEncoder().encode("photo") },
        ],
      }),
    );

    const deliveredUrlDelivery = deliveredUrl.deliveries[0];
    const viewedFileDelivery = viewedFile.deliveries[0];

    if (deliveredUrlDelivery === undefined || viewedFileDelivery === undefined) {
      throw new Error("Expected seeded Items to create Deliveries.");
    }

    await parseOkResponse(
      new RpcClient(relayHubBaseUrl)
        .createDeviceRpcClient(targetDevice.deviceId)
        .acknowledgeDelivery({ deliveryId: deliveredUrlDelivery.deliveryId }),
    );
    await parseOkResponse(
      new RpcClient(relayHubBaseUrl)
        .createDeviceRpcClient(targetDevice.deviceId)
        .markDeliveryViewed({ deliveryId: viewedFileDelivery.deliveryId }),
    );

    await prepareWebApp(page, {
      settings: {
        relayHubUrl: relayHubBaseUrl,
        deviceNickname: "test-device-browser",
      },
    });

    await gotoWebApp(page);
    const deliveryRegion = page.getByRole("region", { name: "Deliveries" });
    await expect(deliveryRegion.getByText("Pending note")).toBeVisible();
    await expect(deliveryRegion.getByText("Delivered article")).toBeVisible();
    await expect(deliveryRegion.getByText("Viewed file bundle")).toBeVisible();
    await expect(deliveryRegion.getByText("pending", { exact: true })).toBeVisible();
    await expect(deliveryRegion.getByText("delivered", { exact: true })).toBeVisible();
    await expect(deliveryRegion.getByText("viewed", { exact: true })).toBeVisible();
    await expect(deliveryRegion.getByText("Source Device: Desk CLI")).toBeVisible();
    await expect(deliveryRegion.getByText("Source Device: Pixel Phone")).toBeVisible();
    await expect(deliveryRegion.getByText("Source Device: Camera")).toBeVisible();
    await page.addStyleTag({
      content: `
        [aria-labelledby="deliveries-heading"] time {
          display: inline-block;
          width: 180px;
        }
      `,
    });

    await expect(deliveryRegion).toHaveScreenshot("deliveries-seeded.png", {
      mask: [deliveryRegion.locator("time")],
    });
  });
});

test("render text, URL, and unsupported File Deliveries", async ({ page }) => {
  await withRelayHubTestEnvironment(async ({ relayHubBaseUrl }) => {
    const [sourceDevice, targetDevice] = await seed.registerDevices(relayHubBaseUrl, [
      { nickname: "source-device", platform: "cli" },
      { nickname: "test-device-browser", platform: "generic" },
    ]);

    if (sourceDevice === undefined || targetDevice === undefined) {
      throw new Error("Expected source and target devices to be seeded.");
    }

    const sourceRpcClient = new RpcClient(relayHubBaseUrl).createDeviceRpcClient(
      sourceDevice.deviceId,
    );
    await parseOkResponse(
      sourceRpcClient.sendText({
        targetDeviceIds: [targetDevice.deviceId],
        title: "Text title",
        text: "Text body for the delivery list",
      }),
    );
    await parseOkResponse(
      sourceRpcClient.sendUrl({
        targetDeviceIds: [targetDevice.deviceId],
        title: "URL title",
        url: "https://example.com/article",
      }),
    );
    await parseOkResponse(
      sourceRpcClient.sendFiles({
        targetDeviceIds: [targetDevice.deviceId],
        title: "File title",
        files: [{ basename: "notes.txt", content: new TextEncoder().encode("notes") }],
      }),
    );

    await prepareWebApp(page, {
      settings: {
        relayHubUrl: relayHubBaseUrl,
        deviceNickname: "test-device-browser",
      },
    });

    await gotoWebApp(page);

    const deliveries = page.getByRole("list", { name: "Deliveries" });
    await expect(deliveries.getByText("Text title")).toBeVisible();
    await expect(deliveries.getByText("Text body for the delivery list")).toBeVisible();
    await expect(deliveries.getByText("URL title")).toBeVisible();
    await expect(deliveries.getByText("https://example.com/article")).toBeVisible();
    await expect(deliveries.getByText("Source Device: source-device")).toHaveCount(3);
    const fileDeliveryRow = page.getByRole("listitem").filter({ hasText: "File title" });
    await expect(fileDeliveryRow.getByText("File delivery not supported yet")).toBeVisible();
    await expect(fileDeliveryRow.getByRole("button", { name: "Open" })).toBeDisabled();
  });
});

test("open a text Delivery and mark it Viewed", async ({ page }) => {
  await withRelayHubTestEnvironment(async ({ relayHubBaseUrl }) => {
    const [sourceDevice, targetDevice] = await seed.registerDevices(relayHubBaseUrl, [
      { nickname: "source-device", platform: "cli" },
      { nickname: "test-device-browser", platform: "generic" },
    ]);

    if (sourceDevice === undefined || targetDevice === undefined) {
      throw new Error("Expected source and target devices to be seeded.");
    }

    await parseOkResponse(
      new RpcClient(relayHubBaseUrl).createDeviceRpcClient(sourceDevice.deviceId).sendText({
        targetDeviceIds: [targetDevice.deviceId],
        title: "Readable text",
        text: "Full text body",
      }),
    );

    await prepareWebApp(page, {
      settings: {
        relayHubUrl: relayHubBaseUrl,
        deviceNickname: "test-device-browser",
      },
    });

    await gotoWebApp(page);
    await page
      .getByRole("listitem")
      .filter({ hasText: "Readable text" })
      .getByRole("button", { name: "Open" })
      .click();

    await expect(page.getByRole("dialog", { name: "Readable text" })).toContainText(
      "Full text body",
    );
    await expect(page.getByText("viewed")).toBeVisible();
  });
});

test("open a URL Delivery in a new browser surface without navigating away", async ({ page }) => {
  await withRelayHubTestEnvironment(async ({ relayHubBaseUrl }) => {
    const [sourceDevice, targetDevice] = await seed.registerDevices(relayHubBaseUrl, [
      { nickname: "source-device", platform: "cli" },
      { nickname: "test-device-browser", platform: "generic" },
    ]);

    if (sourceDevice === undefined || targetDevice === undefined) {
      throw new Error("Expected source and target devices to be seeded.");
    }

    await parseOkResponse(
      new RpcClient(relayHubBaseUrl).createDeviceRpcClient(sourceDevice.deviceId).sendUrl({
        targetDeviceIds: [targetDevice.deviceId],
        title: "Article",
        url: "https://example.com/article",
      }),
    );

    await prepareWebApp(page, {
      settings: {
        relayHubUrl: relayHubBaseUrl,
        deviceNickname: "test-device-browser",
      },
    });

    await gotoWebApp(page);
    const popupPromise = page.waitForEvent("popup");
    await page
      .getByRole("listitem")
      .filter({ hasText: "Article" })
      .getByRole("button", { name: "Open" })
      .click();

    const popup = await popupPromise;
    await expect(popup).toHaveURL("https://example.com/article");
    await popup.close();
    await expect(page.getByRole("dialog", { name: "Article" })).not.toBeVisible();
    await expect(page).toHaveURL("http://localhost:4173/");
  });
});

test("keep Delivery detail open when marking Viewed fails", async ({ page }) => {
  await withRelayHubTestEnvironment(async ({ relayHubBaseUrl }) => {
    const [sourceDevice, targetDevice] = await seed.registerDevices(relayHubBaseUrl, [
      { nickname: "source-device", platform: "cli" },
      { nickname: "test-device-browser", platform: "generic" },
    ]);

    if (sourceDevice === undefined || targetDevice === undefined) {
      throw new Error("Expected source and target devices to be seeded.");
    }

    await parseOkResponse(
      new RpcClient(relayHubBaseUrl).createDeviceRpcClient(sourceDevice.deviceId).sendText({
        targetDeviceIds: [targetDevice.deviceId],
        title: "Failure detail",
        text: "Still visible",
      }),
    );
    await page.route(`${relayHubBaseUrl}/deliveries/*/viewed?*`, async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "forced viewed failure" }),
      });
    });

    await prepareWebApp(page, {
      settings: {
        relayHubUrl: relayHubBaseUrl,
        deviceNickname: "test-device-browser",
      },
    });

    await gotoWebApp(page);
    await page
      .getByRole("listitem")
      .filter({ hasText: "Failure detail" })
      .getByRole("button", { name: "Open" })
      .click();

    const dialog = page.getByRole("dialog", { name: "Failure detail" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Could not mark delivery viewed");
  });
});

async function routeStaticDeliveryDependencies(
  page: Page,
  deliveriesResponse: DeliveryListResponse | "delivery-list-error",
): Promise<void> {
  await page.route(`${MOCK_RELAY_HUB_URL}/devices/register`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        deviceId: "dev_browser",
        nickname: "test-device-browser",
        platform: "generic",
        relayHubBaseUrl: MOCK_RELAY_HUB_URL,
        createdAt: "2026-05-30T08:00:00.000Z",
      }),
    });
  });
  await page.route(`${MOCK_RELAY_HUB_URL}/devices`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(createStaticDeviceListResponse()),
    });
  });
  await page.route(`${MOCK_RELAY_HUB_URL}/deliveries?*`, async (route) => {
    if (deliveriesResponse === "delivery-list-error") {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "forced Delivery list failure" }),
      });

      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(deliveriesResponse),
    });
  });
}

function createStaticDeviceListResponse(): DeviceListResponse {
  return [
    {
      deviceId: "dev_browser",
      nickname: "Browser",
      platform: "generic",
      createdAt: "2026-05-30T08:00:00.000Z",
      updatedAt: "2026-05-30T08:00:00.000Z",
    },
    {
      deviceId: "dev_source_cli",
      nickname: "Desk CLI",
      platform: "cli",
      createdAt: "2026-05-30T08:00:00.000Z",
      updatedAt: "2026-05-30T08:00:00.000Z",
    },
    {
      deviceId: "dev_source_phone",
      nickname: "Phone",
      platform: "android",
      createdAt: "2026-05-30T08:00:00.000Z",
      updatedAt: "2026-05-30T08:00:00.000Z",
    },
    {
      deviceId: "dev_source_camera",
      nickname: "Camera",
      platform: "generic",
      createdAt: "2026-05-30T08:00:00.000Z",
      updatedAt: "2026-05-30T08:00:00.000Z",
    },
  ];
}

function createStaticDeliveryListResponse(): DeliveryListResponse {
  return {
    deliveries: [
      {
        deliveryId: "del_text_weekend_notes",
        itemId: "item_text_weekend_notes",
        targetDeviceId: "dev_browser",
        state: "pending",
        createdAt: "2026-05-30T08:45:00.000Z",
        acknowledgedAt: null,
        viewedAt: null,
        item: {
          itemId: "item_text_weekend_notes",
          type: "text",
          title: "Weekend notes",
          sourceDeviceId: "dev_source_cli",
          text: "Bring the charger and the field recorder.",
          url: null,
          files: [],
          createdAt: "2026-05-30T08:45:00.000Z",
        },
      },
      {
        deliveryId: "del_url_article",
        itemId: "item_url_article",
        targetDeviceId: "dev_browser",
        state: "delivered",
        createdAt: "2026-05-30T08:30:00.000Z",
        acknowledgedAt: "2026-05-30T08:31:00.000Z",
        viewedAt: null,
        item: {
          itemId: "item_url_article",
          type: "url",
          title: "Reference article",
          sourceDeviceId: "dev_source_phone",
          text: null,
          url: "https://example.com/reference",
          files: [],
          createdAt: "2026-05-30T08:30:00.000Z",
        },
      },
      {
        deliveryId: "del_file_archive",
        itemId: "item_file_archive",
        targetDeviceId: "dev_browser",
        state: "viewed",
        createdAt: "2026-05-30T08:15:00.000Z",
        acknowledgedAt: "2026-05-30T08:16:00.000Z",
        viewedAt: "2026-05-30T08:17:00.000Z",
        item: {
          itemId: "item_file_archive",
          type: "file",
          title: "Trip photos",
          sourceDeviceId: "dev_source_camera",
          text: null,
          url: null,
          files: [
            {
              fileId: "file_photo_1",
              itemId: "item_file_archive",
              order: 0,
              fileName: "photo-1.jpg",
              storedFileName: "stored-photo-1.jpg",
              contentType: "image/jpeg",
              sizeBytes: 1024,
            },
            {
              fileId: "file_photo_2",
              itemId: "item_file_archive",
              order: 1,
              fileName: "photo-2.jpg",
              storedFileName: "stored-photo-2.jpg",
              contentType: "image/jpeg",
              sizeBytes: 2048,
            },
          ],
          createdAt: "2026-05-30T08:15:00.000Z",
        },
      },
    ],
    pageInfo: {
      nextCursor: null,
      hasNextPage: false,
    },
  };
}
