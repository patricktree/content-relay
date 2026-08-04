import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";

import type { AndroidShareAdapter } from "#src/application/android-share-intake.js";

type AndroidSharePlugin = {
  closeShareOverlay(): Promise<void>;
  completeShareOverlay(input: { message: string }): Promise<void>;
  consumePendingShare(): Promise<unknown>;
  addListener(
    eventName: "shareIntentReceived",
    listener: (payload: unknown) => void,
  ): Promise<PluginListenerHandle>;
};

const androidSharePlugin = registerPlugin<AndroidSharePlugin>("AndroidShare");

export const capacitorAndroidShareAdapter: AndroidShareAdapter = {
  isAvailable() {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
  },
  consumePendingShare() {
    return androidSharePlugin.consumePendingShare();
  },
  async addShareListener(listener) {
    const handle = await androidSharePlugin.addListener("shareIntentReceived", listener);
    return async () => handle.remove();
  },
  async cancelShare() {
    await androidSharePlugin.closeShareOverlay();
  },
  async completeShare(input) {
    await androidSharePlugin.completeShareOverlay(input);
  },
};
