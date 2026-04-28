import { Token } from "dioma";
import { type InferSelectModel } from "drizzle-orm";

import type { DeliveryState, FileMetadata } from "@content-relay/shared";

import {
  deliveriesTable,
  devicesTable,
  invitesTable,
  itemsTable,
  pushTokensTable,
} from "#pkg/infrastructure/db/schema.ts";

export const relayRepositoryToken = new Token<IRelayBackendRepository>("RelayRepository");

export type DeviceRecord = InferSelectModel<typeof devicesTable>;
export type InviteRecord = InferSelectModel<typeof invitesTable>;
export type ItemRecord = InferSelectModel<typeof itemsTable>;
export type DeliveryRecord = InferSelectModel<typeof deliveriesTable>;
export type PushTokenRecord = InferSelectModel<typeof pushTokensTable>;

export type IRelayBackendRepository = {
  createInvite(invite: InviteRecord): Promise<void>;
  getInviteByCode(code: string): Promise<InviteRecord | null>;
  markInviteUsed(inviteId: string, usedAt: string): Promise<void>;
  createDevice(device: DeviceRecord): Promise<void>;
  findActiveDeviceById(deviceId: string): Promise<DeviceRecord | null>;
  listActiveDevices(): Promise<DeviceRecord[]>;
  updateDeviceNickname(
    deviceId: string,
    nickname: string,
    updatedAt: string,
  ): Promise<DeviceRecord>;
  softDeleteDevice(deviceId: string, deletedAt: string): Promise<void>;
  createItem(item: ItemRecord): Promise<void>;
  createDeliveries(deliveries: DeliveryRecord[]): Promise<void>;
  createFileMetadata(fileMetadata: FileMetadata[]): Promise<void>;
  getItemById(itemId: string): Promise<ItemRecord | null>;
  getFileMetadataByItemId(itemId: string): Promise<FileMetadata[]>;
  getDeliveryById(deliveryId: string): Promise<DeliveryRecord | null>;
  listDeliveriesForTarget(
    targetDeviceId: string,
    state: DeliveryState | "all",
    limit: number,
  ): Promise<DeliveryRecord[]>;
  acknowledgeDelivery(deliveryId: string, acknowledgedAt: string): Promise<DeliveryRecord>;
  markDeliveryViewed(deliveryId: string, viewedAt: string): Promise<DeliveryRecord>;
  listItemsBySourceDevice(sourceDeviceId: string, limit: number): Promise<ItemRecord[]>;
  listDeliveriesByItemId(itemId: string): Promise<DeliveryRecord[]>;
  upsertPushToken(pushToken: PushTokenRecord): Promise<void>;
};
