import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { deliveryStates, devicePlatforms, relayItemTypes } from "@content-relay/contracts";

export const devicesTable = sqliteTable(
  "devices",
  {
    id: text("id").primaryKey(),
    nickname: text("nickname").notNull(),
    platform: text("platform", { enum: devicePlatforms }).notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    deletedAt: text("deleted_at"),
  },
  (table) => [uniqueIndex("devices_nickname_idx").on(table.nickname)],
);

export const itemsTable = sqliteTable("items", {
  id: text("id").primaryKey(),
  type: text("type", { enum: relayItemTypes }).notNull(),
  title: text("title"),
  sourceDeviceId: text("source_device_id")
    .notNull()
    .references(() => devicesTable.id),
  textContent: text("text_content"),
  url: text("url"),
  createdAt: text("created_at").notNull(),
});

export const fileMetadataTable = sqliteTable("file_metadata", {
  id: text("id").primaryKey(),
  itemId: text("item_id")
    .notNull()
    .references(() => itemsTable.id),
  sortOrder: integer("sort_order").notNull(),
  fileName: text("file_name").notNull(),
  storedFileName: text("stored_file_name").notNull(),
  contentType: text("content_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  createdAt: text("created_at").notNull(),
});

export const deliveriesTable = sqliteTable("deliveries", {
  id: text("id").primaryKey(),
  itemId: text("item_id")
    .notNull()
    .references(() => itemsTable.id),
  targetDeviceId: text("target_device_id")
    .notNull()
    .references(() => devicesTable.id),
  state: text("state", { enum: deliveryStates }).notNull(),
  createdAt: text("created_at").notNull(),
  acknowledgedAt: text("acknowledged_at"),
  viewedAt: text("viewed_at"),
});

export const pushTokensTable = sqliteTable(
  "push_tokens",
  {
    id: text("id").primaryKey(),
    deviceId: text("device_id")
      .notNull()
      .references(() => devicesTable.id),
    token: text("token").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [uniqueIndex("push_tokens_device_idx").on(table.deviceId)],
);

export const schema = {
  devicesTable,
  itemsTable,
  fileMetadataTable,
  deliveriesTable,
  pushTokensTable,
};
