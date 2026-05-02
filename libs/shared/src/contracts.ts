import { z } from "zod";

export const devicePlatforms = ["cli", "macos", "ios", "android", "generic"] as const;
export const mobileDevicePlatforms = ["ios", "android"] as const;
export const relayItemTypes = ["text", "url", "file"] as const;
export const deliveryStates = ["pending", "delivered", "viewed"] as const;
export const deliveryListStates = [...deliveryStates, "all"] as const;

export const devicePlatformSchema = z.enum(devicePlatforms);
export const pushRegistrationSchema = z.object({
  token: z.string().trim().min(1),
});

export const relayItemTypeSchema = z.enum(relayItemTypes);
export const deliveryStateSchema = z.enum(deliveryStates);

export const deliveryListStateSchema = z.enum(deliveryListStates);

export const registerDeviceRequestSchema = z
  .object({
    nickname: z.string().trim().min(1),
    platform: devicePlatformSchema,
    invite: z.string().trim().min(1),
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

export const registerDeviceResponseSchema = z.object({
  deviceId: z.string(),
  nickname: z.string(),
  platform: devicePlatformSchema,
  serverBaseUrl: z.string().url(),
  createdAt: z.string(),
});

export const createInviteRequestSchema = z.object({
  expiresInSeconds: z
    .number()
    .int()
    .positive()
    .max(60 * 60 * 24)
    .default(900),
});

export const createInviteResponseSchema = z.object({
  inviteCode: z.string(),
  inviteUrl: z.string(),
  expiresAt: z.string(),
});

export const errorResponseSchema = z.object({
  error: z.string(),
});

export const emptyResponseSchema = z.null();

export const deviceSummarySchema = z.object({
  deviceId: z.string(),
  nickname: z.string(),
  platform: devicePlatformSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const deviceListResponseSchema = z.array(deviceSummarySchema);

export const createTextItemRequestSchema = z.object({
  text: z.string().min(1),
  title: z.string().trim().min(1).optional(),
  targetDeviceIds: z.array(z.string()).min(1),
});

export const createUrlItemRequestSchema = z.object({
  url: z.string().url(),
  title: z.string().trim().min(1).optional(),
  targetDeviceIds: z.array(z.string()).min(1),
});

export const fileMetadataSchema = z.object({
  fileId: z.string(),
  itemId: z.string(),
  order: z.number().int().nonnegative(),
  fileName: z.string(),
  storedFileName: z.string(),
  contentType: z.string(),
  sizeBytes: z.number().int().nonnegative(),
});

export const itemResourceSchema = z.object({
  itemId: z.string(),
  type: relayItemTypeSchema,
  title: z.string().nullable(),
  sourceDeviceId: z.string(),
  text: z.string().nullable(),
  url: z.string().nullable(),
  files: z.array(fileMetadataSchema),
  createdAt: z.string(),
});

export const deliveryResourceSchema = z.object({
  deliveryId: z.string(),
  itemId: z.string(),
  targetDeviceId: z.string(),
  state: deliveryStateSchema,
  createdAt: z.string(),
  acknowledgedAt: z.string().nullable(),
  viewedAt: z.string().nullable(),
  item: itemResourceSchema,
});

export const createItemResponseSchema = z.object({
  item: itemResourceSchema,
  deliveries: z.array(deliveryResourceSchema),
});

export const deliveryListResponseSchema = z.object({
  deliveries: z.array(deliveryResourceSchema),
});

export const itemListEntrySchema = z.object({
  item: itemResourceSchema,
  deliveries: z.array(
    z.object({
      deliveryId: z.string(),
      targetDeviceId: z.string(),
      state: deliveryStateSchema,
      createdAt: z.string(),
      acknowledgedAt: z.string().nullable(),
      viewedAt: z.string().nullable(),
    }),
  ),
});

export const itemListResponseSchema = z.object({
  items: z.array(itemListEntrySchema),
});

export const deliveryActionResponseSchema = z.object({
  delivery: deliveryResourceSchema,
});

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

export const updateDeviceRequestSchema = z.object({
  nickname: z.string().trim().min(1),
});

export const pushTokenRequestSchema = z.object({
  token: z.string().trim().min(1),
});

export type DevicePlatform = z.infer<typeof devicePlatformSchema>;
export type MobileDevicePlatform = (typeof mobileDevicePlatforms)[number];
export type RelayItemType = z.infer<typeof relayItemTypeSchema>;
export type DeliveryState = z.infer<typeof deliveryStateSchema>;
export type DeliveryListState = z.infer<typeof deliveryListStateSchema>;
export type RegisterDeviceRequest = z.infer<typeof registerDeviceRequestSchema>;
export type RegisterDeviceResponse = z.infer<typeof registerDeviceResponseSchema>;
export type CreateInviteRequest = z.infer<typeof createInviteRequestSchema>;
export type CreateInviteResponse = z.infer<typeof createInviteResponseSchema>;
export type ErrorResponse = z.infer<typeof errorResponseSchema>;
export type EmptyResponse = z.infer<typeof emptyResponseSchema>;
export type DeviceSummary = z.infer<typeof deviceSummarySchema>;
export type DeviceListResponse = z.infer<typeof deviceListResponseSchema>;
export type CreateTextItemRequest = z.infer<typeof createTextItemRequestSchema>;
export type CreateUrlItemRequest = z.infer<typeof createUrlItemRequestSchema>;
export type FileMetadata = z.infer<typeof fileMetadataSchema>;
export type ItemResource = z.infer<typeof itemResourceSchema>;
export type DeliveryResource = z.infer<typeof deliveryResourceSchema>;
export type CreateItemResponse = z.infer<typeof createItemResponseSchema>;
export type DeliveryListResponse = z.infer<typeof deliveryListResponseSchema>;
export type ItemListEntry = z.infer<typeof itemListEntrySchema>;
export type ItemListResponse = z.infer<typeof itemListResponseSchema>;
export type DeliveryActionResponse = z.infer<typeof deliveryActionResponseSchema>;
export type DownloadDeliveryResponse = z.infer<typeof downloadDeliveryResponseSchema>;
export type UpdateDeviceRequest = z.infer<typeof updateDeviceRequestSchema>;
export type PushRegistration = z.infer<typeof pushRegistrationSchema>;
export type PushTokenRequest = z.infer<typeof pushTokenRequestSchema>;

export type AuthHeaders = {
  "x-relay-device-id": string;
};

export function isMobileDevicePlatform(platform: DevicePlatform): platform is MobileDevicePlatform {
  return mobileDevicePlatforms.includes(platform as MobileDevicePlatform);
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
