import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";

import { isValidAbsoluteUrl } from "@content-relay/contracts";

import {
  sharePayloadSchema,
  consumePendingShareResponseSchema,
  type ShareCompletion,
  type SharePlugin,
} from "#src/platform/share-plugin.interface.js";

const androidSharePlugin = registerPlugin<SharePlugin>("AndroidShare");

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

export async function completeAndroidShareOverlay(input: ShareCompletion): Promise<void> {
  if (!isAndroidShareAvailable()) {
    throw new Error("Android share overlay is not available on this platform.");
  }

  await androidSharePlugin.completeShareOverlay(input);
}

function isAndroidShareAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

function parseShareDraft(payload: unknown): ShareDraft | null {
  const result = sharePayloadSchema.safeParse(payload);

  if (!result.success) {
    console.error("Received invalid Android share payload.", result.error);

    return null;
  }

  return createShareDraft(result.data);
}

export type ShareDraft = {
  shareId: string;
  itemType: "text" | "url";
  title: string;
  value: string;
};

function createShareDraft(input: {
  shareId: string;
  text: string;
  title?: string | null | undefined;
}): ShareDraft {
  return {
    shareId: input.shareId.trim(),
    itemType: isValidAbsoluteUrl(input.text.trim()) ? "url" : "text",
    title: input.title?.trim() ?? "",
    value: input.text.trim(),
  };
}
