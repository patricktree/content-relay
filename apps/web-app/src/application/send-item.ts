import z from "zod";

import {
  deviceIdSchema,
  isValidAbsoluteUrl,
  relayItemTypeSchema,
  type DeviceId,
} from "@content-relay/contracts";

export const sendItemSchema = z
  .object({
    itemType: relayItemTypeSchema,
    targetDeviceIds: z.set(deviceIdSchema).min(1, "Select a target device."),
    title: z.string(),
    value: z.string(),
  })
  .superRefine((value, context) => {
    const trimmedValue = value.value.trim();

    if (value.itemType === "text" && trimmedValue.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["value"],
        message: "Enter the text to send.",
      });
    }

    if (value.itemType === "url" && !isValidAbsoluteUrl(trimmedValue)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["value"],
        message: "Enter a valid absolute URL.",
      });
    }
  });

export type SendItemInput = z.infer<typeof sendItemSchema>;

export type SendItem = (input: SendItemInput) => Promise<void>;

type CommonItemRequest = {
  targetDeviceIds: DeviceId[];
  title?: string;
};

type ItemSendingAdapters = {
  sendText: (request: CommonItemRequest & { text: string }) => Promise<void>;
  sendUrl: (request: CommonItemRequest & { url: string }) => Promise<void>;
  completePendingAndroidShare?: () => Promise<void>;
};

/** Internal construction seam for production and test adapters. */
export function createSendItem(adapters: ItemSendingAdapters): SendItem {
  return async function sendItem(input) {
    const parsedInput = sendItemSchema.parse(input);
    const title = parsedInput.title.trim();
    const commonRequest: CommonItemRequest = {
      targetDeviceIds: [...parsedInput.targetDeviceIds],
      ...(title === "" ? {} : { title }),
    };

    if (parsedInput.itemType === "text") {
      await adapters.sendText({
        ...commonRequest,
        text: parsedInput.value.trim(),
      });
    } else {
      await adapters.sendUrl({
        ...commonRequest,
        url: parsedInput.value.trim(),
      });
    }

    await adapters.completePendingAndroidShare?.();
  };
}
