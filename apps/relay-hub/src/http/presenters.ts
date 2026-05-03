import type {
  CreateInviteResponse,
  CreateItemResponse,
  DeliveryActionResponse,
  DeliveryListResponse,
  DeliveryResource,
  DeviceListResponse,
  DeviceSummary,
  DownloadDeliveryResponse,
  EmptyResponse,
  ErrorResponse,
  FileMetadata,
  ItemListEntry,
  ItemListResponse,
  ItemResource,
  RegisterDeviceResponse,
} from "@content-relay/shared";

import type {
  DeliveryRecord,
  DeviceRecord,
  ItemRecord,
} from "#pkg/interfaces/relay-hub-repository.interface.ts";
import type { CreateFileItemOutput } from "#pkg/use-cases/create-file-item.ts";
import type { CreateInviteOutput } from "#pkg/use-cases/create-invite.ts";
import type { CreateItemOutput } from "#pkg/use-cases/create-item.ts";
import type { DownloadDeliveryOutput } from "#pkg/use-cases/download-delivery.ts";
import type { LoadedDelivery } from "#pkg/use-cases/load-delivery.ts";
import type { LoadedItem } from "#pkg/use-cases/load-item.ts";
import type { RegisterDeviceOutput } from "#pkg/use-cases/register-device.ts";

export function presentCreateInviteOutput(result: CreateInviteOutput): CreateInviteResponse {
  return {
    inviteCode: result.inviteCode,
    inviteUrl: result.inviteUrl,
    expiresAt: result.expiresAt,
  };
}

export function presentRegisterDeviceOutput(result: RegisterDeviceOutput): RegisterDeviceResponse {
  return {
    deviceId: result.deviceId,
    nickname: result.nickname,
    platform: result.platform,
    relayHubBaseUrl: result.relayHubBaseUrl,
    createdAt: result.createdAt,
  };
}

export function presentDeviceList(devices: DeviceRecord[]): DeviceListResponse {
  return devices.map((device) => presentDeviceSummary(device));
}

export function presentCreateItemOutput(
  result: CreateItemOutput | CreateFileItemOutput,
): CreateItemResponse {
  const item = presentItem(result.item, "files" in result ? result.files : []);

  return {
    item,
    deliveries: result.deliveries.map((delivery) => presentDelivery(delivery, item)),
  };
}

export function presentDeliveryList(deliveries: LoadedDelivery[]): DeliveryListResponse {
  return {
    deliveries: deliveries.map((delivery) => presentLoadedDelivery(delivery)),
  };
}

export function presentDeliveryAction(result: LoadedDelivery): DeliveryActionResponse {
  return {
    delivery: presentLoadedDelivery(result),
  };
}

export function presentLoadedDelivery(result: LoadedDelivery): DeliveryResource {
  return presentDelivery(result.delivery, presentItem(result.item, result.files));
}

export function presentItemList(items: LoadedItem[]): ItemListResponse {
  return {
    items: items.map((item) => presentLoadedItem(item)),
  };
}

export function presentLoadedItem(result: LoadedItem): ItemListEntry {
  return {
    item: presentItem(result.item, result.files),
    deliveries: result.deliveries.map((delivery) => ({
      deliveryId: delivery.id,
      targetDeviceId: delivery.targetDeviceId,
      state: delivery.state,
      createdAt: delivery.createdAt,
      acknowledgedAt: delivery.acknowledgedAt,
      viewedAt: delivery.viewedAt,
    })),
  };
}

export function presentDownloadDeliveryOutput(
  result: DownloadDeliveryOutput,
): DownloadDeliveryResponse {
  return {
    item: presentItem(
      result.item,
      result.files.map((file) => file.metadata),
    ),
    files: result.files.map((file) => ({
      fileId: file.metadata.fileId,
      fileName: file.metadata.fileName,
      contentType: file.metadata.contentType,
      sizeBytes: file.metadata.sizeBytes,
      base64Content: Buffer.from(file.content).toString("base64"),
    })),
  };
}

export function presentDeviceSummary(device: DeviceRecord): DeviceSummary {
  return {
    deviceId: device.id,
    nickname: device.nickname,
    platform: device.platform,
    createdAt: device.createdAt,
    updatedAt: device.updatedAt,
  };
}

export function presentEmptyResponse(): EmptyResponse {
  return null;
}

export function presentErrorResponse(error: unknown): ErrorResponse {
  return {
    error: getErrorMessage(error),
  };
}

function presentItem(item: ItemRecord, files: FileMetadata[]): ItemResource {
  return {
    itemId: item.id,
    type: item.type,
    title: item.title,
    sourceDeviceId: item.sourceDeviceId,
    text: item.textContent,
    url: item.url,
    files,
    createdAt: item.createdAt,
  };
}

function presentDelivery(delivery: DeliveryRecord, item: ItemResource): DeliveryResource {
  return {
    deliveryId: delivery.id,
    itemId: delivery.itemId,
    targetDeviceId: delivery.targetDeviceId,
    state: delivery.state,
    createdAt: delivery.createdAt,
    acknowledgedAt: delivery.acknowledgedAt,
    viewedAt: delivery.viewedAt,
    item,
  };
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim() !== "") {
    return error.message;
  }

  return "Unexpected Relay Hub error.";
}
