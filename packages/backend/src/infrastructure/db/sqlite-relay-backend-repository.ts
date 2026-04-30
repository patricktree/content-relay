import Database from "better-sqlite3";
import { and, desc, eq, isNull } from "drizzle-orm";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import path from "node:path";
import { Temporal } from "temporal-polyfill";

import type { FileMetadata } from "@content-relay/shared";

import {
  deliveriesTable,
  devicesTable,
  fileMetadataTable,
  invitesTable,
  itemsTable,
  pushTokensTable,
  schema,
} from "#pkg/infrastructure/db/schema.ts";
import type {
  IRelayBackendRepository,
  CreateDeviceRegistrationInput,
  DeliveryRecord,
  DeviceRecord,
  InviteRecord,
  ItemRecord,
  PushTokenRecord,
} from "#pkg/interfaces/relay-backend-repository.interface.ts";

export type SqliteRelayBackendRepositoryOptions = {
  databaseDirectory: string;
};

export class SqliteRelayBackendRepository implements IRelayBackendRepository {
  readonly #sqlite: Database.Database;
  readonly #db: BetterSQLite3Database<typeof schema>;

  constructor(options: SqliteRelayBackendRepositoryOptions) {
    const databaseFilePath = path.join(options.databaseDirectory, "content-relay.sqlite");
    this.#sqlite = new Database(databaseFilePath);
    this.#sqlite.pragma("foreign_keys = ON");
    this.#initializeSchema();
    this.#db = drizzle(this.#sqlite, { schema });
  }

  async createInvite(invite: InviteRecord): Promise<void> {
    this.#db.insert(invitesTable).values(invite).run();
  }

  async getInviteByCode(code: string): Promise<InviteRecord | null> {
    const invite = this.#db.select().from(invitesTable).where(eq(invitesTable.code, code)).get();

    return invite ?? null;
  }

  async markInviteUsed(inviteId: string, usedAt: string): Promise<void> {
    this.#db.update(invitesTable).set({ usedAt }).where(eq(invitesTable.id, inviteId)).run();
  }

  async createDevice(device: DeviceRecord): Promise<void> {
    this.#db.insert(devicesTable).values(device).run();
  }

  async createDeviceRegistration(input: CreateDeviceRegistrationInput): Promise<void> {
    this.#sqlite.transaction((registration: CreateDeviceRegistrationInput) => {
      this.#db.insert(devicesTable).values(registration.device).run();

      if (registration.pushToken !== undefined) {
        this.#upsertPushTokenRecord(registration.pushToken);
      }

      this.#db
        .update(invitesTable)
        .set({ usedAt: registration.usedAt })
        .where(eq(invitesTable.id, registration.inviteId))
        .run();
    })(input);
  }

  async findActiveDeviceById(deviceId: string): Promise<DeviceRecord | null> {
    const device = this.#db
      .select()
      .from(devicesTable)
      .where(and(eq(devicesTable.id, deviceId), isNull(devicesTable.deletedAt)))
      .get();

    return (device as DeviceRecord | undefined) ?? null;
  }

  async listActiveDevices(): Promise<DeviceRecord[]> {
    return this.#db
      .select()
      .from(devicesTable)
      .where(isNull(devicesTable.deletedAt))
      .orderBy(devicesTable.nickname)
      .all() as DeviceRecord[];
  }

  async updateDeviceNickname(
    deviceId: string,
    nickname: string,
    updatedAt: string,
  ): Promise<DeviceRecord> {
    this.#db
      .update(devicesTable)
      .set({ nickname, updatedAt })
      .where(eq(devicesTable.id, deviceId))
      .run();

    const device = await this.findActiveDeviceById(deviceId);
    if (device === null) {
      throw new Error(`Device not found after rename: ${deviceId}`);
    }

    return device;
  }

  async softDeleteDevice(deviceId: string, deletedAt: string): Promise<void> {
    this.#db
      .update(devicesTable)
      .set({ deletedAt, updatedAt: deletedAt })
      .where(eq(devicesTable.id, deviceId))
      .run();
  }

  async createItem(item: ItemRecord): Promise<void> {
    this.#db.insert(itemsTable).values(item).run();
  }

  async createDeliveries(deliveries: DeliveryRecord[]): Promise<void> {
    if (deliveries.length === 0) {
      return;
    }

    this.#db.insert(deliveriesTable).values(deliveries).run();
  }

  async createFileMetadata(fileMetadata: FileMetadata[]): Promise<void> {
    if (fileMetadata.length === 0) {
      return;
    }

    this.#db
      .insert(fileMetadataTable)
      .values(
        fileMetadata.map((file) => ({
          id: file.fileId,
          itemId: file.itemId,
          sortOrder: file.order,
          fileName: file.fileName,
          storedFileName: file.storedFileName,
          contentType: file.contentType,
          sizeBytes: file.sizeBytes,
          createdAt: Temporal.Now.instant().toString(),
        })),
      )
      .run();
  }

  async getItemById(itemId: string): Promise<ItemRecord | null> {
    const item = this.#db
      .select({
        id: itemsTable.id,
        type: itemsTable.type,
        title: itemsTable.title,
        sourceDeviceId: itemsTable.sourceDeviceId,
        textContent: itemsTable.textContent,
        url: itemsTable.url,
        createdAt: itemsTable.createdAt,
      })
      .from(itemsTable)
      .where(eq(itemsTable.id, itemId))
      .get();

    return (item as ItemRecord | undefined) ?? null;
  }

  async getFileMetadataByItemId(itemId: string): Promise<FileMetadata[]> {
    const files = this.#db
      .select()
      .from(fileMetadataTable)
      .where(eq(fileMetadataTable.itemId, itemId))
      .orderBy(fileMetadataTable.sortOrder)
      .all();

    return files.map((file) => ({
      fileId: file.id,
      itemId: file.itemId,
      order: file.sortOrder,
      fileName: file.fileName,
      storedFileName: file.storedFileName,
      contentType: file.contentType,
      sizeBytes: file.sizeBytes,
    }));
  }

  async getDeliveryById(deliveryId: string): Promise<DeliveryRecord | null> {
    const delivery = this.#db
      .select({
        id: deliveriesTable.id,
        itemId: deliveriesTable.itemId,
        targetDeviceId: deliveriesTable.targetDeviceId,
        state: deliveriesTable.state,
        createdAt: deliveriesTable.createdAt,
        acknowledgedAt: deliveriesTable.acknowledgedAt,
        viewedAt: deliveriesTable.viewedAt,
      })
      .from(deliveriesTable)
      .where(eq(deliveriesTable.id, deliveryId))
      .get();

    return (delivery as DeliveryRecord | undefined) ?? null;
  }

  async listDeliveriesForTarget(
    targetDeviceId: string,
    state: DeliveryRecord["state"] | "all",
    limit: number,
  ): Promise<DeliveryRecord[]> {
    return (this.#db
      .select({
        id: deliveriesTable.id,
        itemId: deliveriesTable.itemId,
        targetDeviceId: deliveriesTable.targetDeviceId,
        state: deliveriesTable.state,
        createdAt: deliveriesTable.createdAt,
        acknowledgedAt: deliveriesTable.acknowledgedAt,
        viewedAt: deliveriesTable.viewedAt,
      })
      .from(deliveriesTable)
      .where(
        state === "all"
          ? eq(deliveriesTable.targetDeviceId, targetDeviceId)
          : and(
              eq(deliveriesTable.targetDeviceId, targetDeviceId),
              eq(deliveriesTable.state, state),
            ),
      )
      .orderBy(desc(deliveriesTable.createdAt))
      .limit(limit)
      .all() ?? []) as DeliveryRecord[];
  }

  async acknowledgeDelivery(deliveryId: string, acknowledgedAt: string): Promise<DeliveryRecord> {
    const delivery = await this.getDeliveryById(deliveryId);
    if (delivery === null) {
      throw new Error(`Delivery not found: ${deliveryId}`);
    }

    if (delivery.state === "pending") {
      this.#db
        .update(deliveriesTable)
        .set({ state: "delivered", acknowledgedAt })
        .where(eq(deliveriesTable.id, deliveryId))
        .run();
    }

    const updatedDelivery = await this.getDeliveryById(deliveryId);
    if (updatedDelivery === null) {
      throw new Error(`Delivery disappeared after ack: ${deliveryId}`);
    }

    return updatedDelivery;
  }

  async markDeliveryViewed(deliveryId: string, viewedAt: string): Promise<DeliveryRecord> {
    const delivery = await this.getDeliveryById(deliveryId);
    if (delivery === null) {
      throw new Error(`Delivery not found: ${deliveryId}`);
    }

    const acknowledgedAt = delivery.acknowledgedAt ?? viewedAt;
    this.#db
      .update(deliveriesTable)
      .set({
        state: "viewed",
        acknowledgedAt,
        viewedAt,
      })
      .where(eq(deliveriesTable.id, deliveryId))
      .run();

    const updatedDelivery = await this.getDeliveryById(deliveryId);
    if (updatedDelivery === null) {
      throw new Error(`Delivery disappeared after viewed transition: ${deliveryId}`);
    }

    return updatedDelivery;
  }

  async listItemsBySourceDevice(sourceDeviceId: string, limit: number): Promise<ItemRecord[]> {
    return (this.#db
      .select({
        id: itemsTable.id,
        type: itemsTable.type,
        title: itemsTable.title,
        sourceDeviceId: itemsTable.sourceDeviceId,
        textContent: itemsTable.textContent,
        url: itemsTable.url,
        createdAt: itemsTable.createdAt,
      })
      .from(itemsTable)
      .where(eq(itemsTable.sourceDeviceId, sourceDeviceId))
      .orderBy(desc(itemsTable.createdAt))
      .limit(limit)
      .all() ?? []) as ItemRecord[];
  }

  async listDeliveriesByItemId(itemId: string): Promise<DeliveryRecord[]> {
    return (this.#db
      .select({
        id: deliveriesTable.id,
        itemId: deliveriesTable.itemId,
        targetDeviceId: deliveriesTable.targetDeviceId,
        state: deliveriesTable.state,
        createdAt: deliveriesTable.createdAt,
        acknowledgedAt: deliveriesTable.acknowledgedAt,
        viewedAt: deliveriesTable.viewedAt,
      })
      .from(deliveriesTable)
      .where(eq(deliveriesTable.itemId, itemId))
      .orderBy(deliveriesTable.createdAt)
      .all() ?? []) as DeliveryRecord[];
  }

  async upsertPushToken(pushToken: PushTokenRecord): Promise<void> {
    this.#upsertPushTokenRecord(pushToken);
  }

  #upsertPushTokenRecord(pushToken: PushTokenRecord): void {
    const existingToken = this.#db
      .select()
      .from(pushTokensTable)
      .where(eq(pushTokensTable.deviceId, pushToken.deviceId))
      .get();

    if (existingToken === undefined) {
      this.#db.insert(pushTokensTable).values(pushToken).run();

      return;
    }

    this.#db
      .update(pushTokensTable)
      .set({ token: pushToken.token, updatedAt: pushToken.updatedAt })
      .where(eq(pushTokensTable.deviceId, pushToken.deviceId))
      .run();
  }

  #initializeSchema(): void {
    this.#sqlite.exec(`
      CREATE TABLE IF NOT EXISTS invites (
        id TEXT PRIMARY KEY NOT NULL,
        code TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        used_at TEXT
      );

      CREATE TABLE IF NOT EXISTS devices (
        id TEXT PRIMARY KEY NOT NULL,
        nickname TEXT NOT NULL,
        platform TEXT NOT NULL,
        auth_token_hash TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT
      );

      CREATE UNIQUE INDEX IF NOT EXISTS devices_nickname_idx ON devices (nickname);

      CREATE TABLE IF NOT EXISTS items (
        id TEXT PRIMARY KEY NOT NULL,
        type TEXT NOT NULL,
        title TEXT,
        source_device_id TEXT NOT NULL,
        text_content TEXT,
        url TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (source_device_id) REFERENCES devices (id)
      );

      CREATE TABLE IF NOT EXISTS file_metadata (
        id TEXT PRIMARY KEY NOT NULL,
        item_id TEXT NOT NULL,
        sort_order INTEGER NOT NULL,
        file_name TEXT NOT NULL,
        stored_file_name TEXT NOT NULL,
        content_type TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (item_id) REFERENCES items (id)
      );

      CREATE TABLE IF NOT EXISTS deliveries (
        id TEXT PRIMARY KEY NOT NULL,
        item_id TEXT NOT NULL,
        target_device_id TEXT NOT NULL,
        state TEXT NOT NULL,
        created_at TEXT NOT NULL,
        acknowledged_at TEXT,
        viewed_at TEXT,
        FOREIGN KEY (item_id) REFERENCES items (id),
        FOREIGN KEY (target_device_id) REFERENCES devices (id)
      );

      CREATE TABLE IF NOT EXISTS push_tokens (
        id TEXT PRIMARY KEY NOT NULL,
        device_id TEXT NOT NULL,
        token TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (device_id) REFERENCES devices (id)
      );

      CREATE UNIQUE INDEX IF NOT EXISTS push_tokens_device_idx ON push_tokens (device_id);
    `);
  }
}
