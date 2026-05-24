import { registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import { z } from "zod";

import { isValidAbsoluteUrl, type RelayItemType } from "@content-relay/contracts";

const androidSharePayloadSchema = z.object({
  shareId: z.uuid(),
  text: z.string().trim().min(1),
  title: z.string().trim().min(1).nullable().optional(),
});
const consumePendingShareResponseSchema = z.object({
  share: androidSharePayloadSchema.nullable().optional(),
});

type ConsumePendingShreResponse = z.infer<typeof consumePendingShareResponseSchema>;
type AndroidSharePayload = z.infer<typeof androidSharePayloadSchema>;
type Events = {
  shareIntentReceived: {
    payload: AndroidSharePayload;
  };
};
type AndroidShareCompletion = { message: string };

type AndroidSharePlugin = {
  consumePendingShare(): Promise<ConsumePendingShreResponse>;
  addListener<EventName extends keyof Events>(
    eventName: EventName,
    listenerFunc: (payload: Events[EventName]) => void,
  ): Promise<PluginListenerHandle>;
  completeShareOverlay(input: AndroidShareCompletion): Promise<void>;
  closeShareOverlay(): Promise<void>;
};

const androidSharePlugin = registerPlugin<AndroidSharePlugin>("AndroidShare");

type SharePayload = {
  dedupeKey: string;
  itemType: "text" | "url";
  title: string;
  value: string;
};

export const androidShareAdapter = {
  addShareListener,
  consumePendingShare,
  closeShareOverlay,
  completeShareOverlay,
};

async function addShareListener(
  listener: (sharePayload: SharePayload) => void,
): Promise<PluginListenerHandle | null> {
  return androidSharePlugin.addListener("shareIntentReceived", (androidSharePayload) => {
    const sharePayload = parseSharePayload(androidSharePayload);
    listener(sharePayload);
  });
}

async function consumePendingShare(): Promise<SharePayload | null> {
  const result = consumePendingShareResponseSchema.parse(
    await androidSharePlugin.consumePendingShare(),
  );

  if (result.share === undefined || result.share === null) {
    return null;
  }

  return parseSharePayload(result.share);
}

async function closeShareOverlay(): Promise<void> {
  await androidSharePlugin.closeShareOverlay();
}

async function completeShareOverlay(input: AndroidShareCompletion): Promise<void> {
  await androidSharePlugin.completeShareOverlay(input);
}

function parseSharePayload(input: unknown): SharePayload {
  const result = androidSharePayloadSchema.safeParse(input);

  if (!result.success) {
    throw new Error(`Received invalid Android share payload. Reason: ${result.error.message}`);
  }

  let itemType: RelayItemType;
  if (isValidAbsoluteUrl(result.data.text)) {
    itemType = "url";
  } else {
    itemType = "text";
  }

  return {
    dedupeKey: result.data.shareId,
    itemType,
    title: result.data.title ?? "",
    value: result.data.text,
  };
}
