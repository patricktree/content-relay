import { App } from "@capacitor/app";
import { Capacitor, type PluginListenerHandle } from "@capacitor/core";

export async function addAndroidResumeListener(
  listener: () => void,
): Promise<PluginListenerHandle | null> {
  if (!isAndroidAppLifecycleAvailable()) {
    return null;
  }

  return App.addListener("resume", listener);
}

function isAndroidAppLifecycleAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}
