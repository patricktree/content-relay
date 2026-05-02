import type { DeliveryResource, DevicePlatform, RelayItemType } from "@content-relay/shared";

export type SimulatedDeliveryAction =
  | "printed"
  | "notification-created"
  | "auto-opened-browser"
  | "auto-opened-text-window"
  | "file-detail-available";

export type SimulatedDeliveryResult = {
  delivery: DeliveryResource;
  itemType: RelayItemType;
  action: SimulatedDeliveryAction;
  shouldMarkViewed: boolean;
  summary: string;
};

export function simulatePlatformDelivery(
  platform: DevicePlatform,
  delivery: DeliveryResource,
): SimulatedDeliveryResult {
  switch (platform) {
    case "macos":
      return simulateMacosDelivery(delivery);
    case "ios":
    case "android":
      return {
        delivery,
        itemType: delivery.item.type,
        action: "notification-created",
        shouldMarkViewed: false,
        summary: buildNotificationSummary(delivery),
      };
    case "cli":
    case "generic":
      return {
        delivery,
        itemType: delivery.item.type,
        action: "printed",
        shouldMarkViewed: false,
        summary: buildPlainSummary(delivery),
      };
    default:
      return assertUnreachable(platform);
  }
}

function simulateMacosDelivery(delivery: DeliveryResource): SimulatedDeliveryResult {
  switch (delivery.item.type) {
    case "url":
      return {
        delivery,
        itemType: delivery.item.type,
        action: "auto-opened-browser",
        shouldMarkViewed: true,
        summary: `Auto-opened URL in default browser: ${delivery.item.url}`,
      };
    case "text":
      return {
        delivery,
        itemType: delivery.item.type,
        action: "auto-opened-text-window",
        shouldMarkViewed: true,
        summary: `Auto-opened text in dedicated app window: ${truncatePreview(delivery.item.text ?? "", 80)}`,
      };
    case "file":
      return {
        delivery,
        itemType: delivery.item.type,
        action: "file-detail-available",
        shouldMarkViewed: false,
        summary: buildNotificationSummary(delivery),
      };
    default:
      return assertUnreachable(delivery.item.type);
  }
}

function buildNotificationSummary(delivery: DeliveryResource): string {
  switch (delivery.item.type) {
    case "text":
      return `Notification: ${truncatePreview(delivery.item.text ?? "", 80)}`;
    case "url":
      return `Notification: ${delivery.item.url}`;
    case "file":
      return `Notification: ${formatFileNotificationLabel(delivery)}`;
    default:
      return assertUnreachable(delivery.item.type);
  }
}

function buildPlainSummary(delivery: DeliveryResource): string {
  switch (delivery.item.type) {
    case "text":
      return `Text delivery ${delivery.deliveryId}: ${truncatePreview(delivery.item.text ?? "", 80)}`;
    case "url":
      return `URL delivery ${delivery.deliveryId}: ${delivery.item.url}`;
    case "file":
      return `File delivery ${delivery.deliveryId}: ${formatFileNotificationLabel(delivery)}`;
    default:
      return assertUnreachable(delivery.item.type);
  }
}

export function formatFileNotificationLabel(delivery: DeliveryResource): string {
  const firstFile = delivery.item.files[0];

  if (delivery.item.files.length === 1 && firstFile !== undefined) {
    return firstFile.fileName;
  }

  return `${delivery.item.files.length} files`;
}

function truncatePreview(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 1))}…`;
}

function assertUnreachable(value: never): never {
  throw new Error(`Unexpected value: ${JSON.stringify(value)}`);
}
