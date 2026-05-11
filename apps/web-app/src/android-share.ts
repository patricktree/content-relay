import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import { z } from "zod";

import { createShareDraft, type ShareDraft } from "#pkg/share-draft.ts";

const androidSharePayloadSchema = z.object({
  shareId: z.uuid(),
  text: z.string().trim().min(1),
  title: z.string().trim().min(1).nullable().optional(),
});
const consumePendingShareResponseSchema = z.object({
  share: androidSharePayloadSchema.nullable().optional(),
});

export type AndroidShareCompletion = {
  message: string;
};

type AndroidSharePayload = z.infer<typeof androidSharePayloadSchema>;

type AndroidSharePlugin = {
  closeShareOverlay(): Promise<void>;
  completeShareOverlay(input: AndroidShareCompletion): Promise<void>;
  consumePendingShare(): Promise<z.infer<typeof consumePendingShareResponseSchema>>;
  addListener(
    eventName: "shareIntentReceived",
    listenerFunc: (payload: AndroidSharePayload) => void,
  ): Promise<PluginListenerHandle>;
};

const androidSharePlugin = registerPlugin<AndroidSharePlugin>("AndroidShare");

export async function addAndroidShareListener(
  listener: (shareDraft: ShareDraft) => void,
): Promise<PluginListenerHandle | null> {
  if (!isAndroidShareAvailable()) {
    return null;
  }

  return androidSharePlugin.addListener("shareIntentReceived", (payload) => {
    const shareDraft = parseShareDraft(payload);

    if (shareDraft === null) {
      return;
    }

    listener(shareDraft);
  });
}

export async function consumePendingAndroidShare(): Promise<ShareDraft | null> {
  if (!isAndroidShareAvailable()) {
    return null;
  }

  const result = consumePendingShareResponseSchema.parse(
    await androidSharePlugin.consumePendingShare(),
  );

  if (result.share === undefined || result.share === null) {
    return null;
  }

  return parseShareDraft(result.share);
}

export async function closeAndroidShareOverlay(): Promise<void> {
  if (!isAndroidShareAvailable()) {
    throw new Error("Android share overlay is not available on this platform.");
  }

  await androidSharePlugin.closeShareOverlay();
}

export async function completeAndroidShareOverlay(input: AndroidShareCompletion): Promise<void> {
  if (!isAndroidShareAvailable()) {
    throw new Error("Android share overlay is not available on this platform.");
  }

  await androidSharePlugin.completeShareOverlay(input);
}

function isAndroidShareAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

function parseShareDraft(payload: unknown): ShareDraft | null {
  const result = androidSharePayloadSchema.safeParse(payload);

  if (!result.success) {
    console.error("Received invalid Android share payload.", result.error);

    return null;
  }

  return createShareDraft(result.data);
}
