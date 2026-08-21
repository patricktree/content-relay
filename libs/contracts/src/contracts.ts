import { z } from "zod";

export const devicePlatforms = ["cli", "macos", "ios", "android", "generic"] as const;
export const mobileDevicePlatforms = ["ios", "android"] as const;
export const relayItemTypes = ["text", "url", "file"] as const;
export const deliveryStates = ["pending", "delivered", "viewed"] as const;
export const deliveryListStates = [...deliveryStates, "all"] as const;

export const devicePlatformSchema = z.enum(devicePlatforms);
export type DevicePlatform = z.infer<typeof devicePlatformSchema>;

export const mobileDevicePlatformSchema = z.enum(mobileDevicePlatforms);
export type MobileDevicePlatform = (typeof mobileDevicePlatforms)[number];

export const pushRegistrationSchema = z.object({
  token: z.string().trim().min(1),
});
export type PushRegistration = z.infer<typeof pushRegistrationSchema>;

export const relayItemTypeSchema = z.enum(relayItemTypes);
export type RelayItemType = z.infer<typeof relayItemTypeSchema>;

export const deliveryStateSchema = z.enum(deliveryStates);
export type DeliveryState = z.infer<typeof deliveryStateSchema>;

export const deliveryListStateSchema = z.enum(deliveryListStates);
export type DeliveryListState = z.infer<typeof deliveryListStateSchema>;

export const registerDeviceRequestSchema = z
  .object({
    nickname: z.string().trim().min(1),
    platform: devicePlatformSchema,
    pushRegistration: pushRegistrationSchema.optional(),
  })
  .superRefine((value, context) => {
    if (isMobileDevicePlatform(value.platform)) {
      if (value.pushRegistration === undefined) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["pushRegistration"],
          message: "pushRegistration is required for ios and android devices.",
        });
      }

      return;
    }

    if (value.pushRegistration !== undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["pushRegistration"],
        message: "pushRegistration is only allowed for ios and android devices.",
      });
    }
  });
export type RegisterDeviceRequest = z.infer<typeof registerDeviceRequestSchema>;

export const deviceIdSchema = z.string();
export type DeviceId = z.infer<typeof deviceIdSchema>;

export const registerDeviceResponseSchema = z.object({
  deviceId: deviceIdSchema,
  nickname: z.string(),
  platform: devicePlatformSchema,
  relayHubBaseUrl: z.url(),
  createdAt: z.string(),
});
export type RegisterDeviceResponse = z.infer<typeof registerDeviceResponseSchema>;

export const errorResponseSchema = z.object({
  error: z.string(),
});
export type ErrorResponse = z.infer<typeof errorResponseSchema>;

export const emptyResponseSchema = z.null();
export type EmptyResponse = z.infer<typeof emptyResponseSchema>;

export const deviceSummarySchema = z.object({
  deviceId: deviceIdSchema,
  nickname: z.string(),
  platform: devicePlatformSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type DeviceSummary = z.infer<typeof deviceSummarySchema>;

export const deviceListResponseSchema = z.array(deviceSummarySchema);
export type DeviceListResponse = z.infer<typeof deviceListResponseSchema>;

export const createTextItemRequestSchema = z.object({
  sourceDeviceId: deviceIdSchema,
  text: z.string().min(1),
  title: z.string().trim().min(1).optional(),
  targetDeviceIds: z.array(deviceIdSchema).min(1),
});
export type CreateTextItemRequest = z.infer<typeof createTextItemRequestSchema>;

export const createUrlItemRequestSchema = z.object({
  sourceDeviceId: deviceIdSchema,
  url: z.string().url(),
  title: z.string().trim().min(1).optional(),
  targetDeviceIds: z.array(deviceIdSchema).min(1),
});
export type CreateUrlItemRequest = z.infer<typeof createUrlItemRequestSchema>;

export const fileMetadataSchema = z.object({
  fileId: z.string(),
  itemId: z.string(),
  order: z.number().int().nonnegative(),
  fileName: z.string(),
  storedFileName: z.string(),
  contentType: z.string(),
  sizeBytes: z.number().int().nonnegative(),
});
export type FileMetadata = z.infer<typeof fileMetadataSchema>;

export const itemResourceSchema = z.object({
  itemId: z.string(),
  type: relayItemTypeSchema,
  title: z.string().nullable(),
  sourceDeviceId: deviceIdSchema,
  text: z.string().nullable(),
  url: z.string().nullable(),
  files: z.array(fileMetadataSchema),
  createdAt: z.string(),
});
export type ItemResource = z.infer<typeof itemResourceSchema>;

export const deliveryResourceSchema = z.object({
  deliveryId: z.string(),
  itemId: z.string(),
  targetDeviceId: deviceIdSchema,
  state: deliveryStateSchema,
  createdAt: z.string(),
  acknowledgedAt: z.string().nullable(),
  viewedAt: z.string().nullable(),
  item: itemResourceSchema,
});
export type DeliveryResource = z.infer<typeof deliveryResourceSchema>;

export const createItemResponseSchema = z.object({
  item: itemResourceSchema,
  deliveries: z.array(deliveryResourceSchema),
});
export type CreateItemResponse = z.infer<typeof createItemResponseSchema>;

export const deliveryListPageInfoSchema = z.object({
  nextCursor: z.string().nullable(),
  hasNextPage: z.boolean(),
});
export type DeliveryListPageInfo = z.infer<typeof deliveryListPageInfoSchema>;

export const deliveryListResponseSchema = z.object({
  deliveries: z.array(deliveryResourceSchema),
  pageInfo: deliveryListPageInfoSchema,
});
export type DeliveryListResponse = z.infer<typeof deliveryListResponseSchema>;

export const itemListEntrySchema = z.object({
  item: itemResourceSchema,
  deliveries: z.array(
    z.object({
      deliveryId: z.string(),
      targetDeviceId: deviceIdSchema,
      state: deliveryStateSchema,
      createdAt: z.string(),
      acknowledgedAt: z.string().nullable(),
      viewedAt: z.string().nullable(),
    }),
  ),
});
export type ItemListEntry = z.infer<typeof itemListEntrySchema>;

export const itemListResponseSchema = z.object({
  items: z.array(itemListEntrySchema),
});
export type ItemListResponse = z.infer<typeof itemListResponseSchema>;

export const deliveryActionResponseSchema = z.object({
  delivery: deliveryResourceSchema,
});
export type DeliveryActionResponse = z.infer<typeof deliveryActionResponseSchema>;

export const downloadDeliveryResponseSchema = z.object({
  item: itemResourceSchema,
  files: z.array(
    z.object({
      fileId: z.string(),
      fileName: z.string(),
      contentType: z.string(),
      sizeBytes: z.number().int().nonnegative(),
      base64Content: z.string(),
    }),
  ),
});
export type DownloadDeliveryResponse = z.infer<typeof downloadDeliveryResponseSchema>;

export const updateDeviceRequestSchema = z.object({
  nickname: z.string().trim().min(1),
});
export type UpdateDeviceRequest = z.infer<typeof updateDeviceRequestSchema>;

export const pushTokenRequestSchema = z.object({
  token: z.string().trim().min(1),
});
export type PushTokenRequest = z.infer<typeof pushTokenRequestSchema>;

export function isMobileDevicePlatform(platform: DevicePlatform): platform is MobileDevicePlatform {
  return mobileDevicePlatformSchema.safeParse(platform).success;
}

export function isValidAbsoluteUrl(value: string): boolean {
  try {
    const url = new URL(value);

    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function assertValidAbsoluteUrl(value: string): string {
  if (!isValidAbsoluteUrl(value)) {
    throw new Error(`Expected a valid absolute URL but received: ${value}`);
  }

  return value;
}
