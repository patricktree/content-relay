import type { Page } from "@playwright/test";

import type { Settings } from "#src/settings-storage.js";

export async function prepareWebApp(page: Page, opts: { settings: Settings }): Promise<void> {
  await page.addInitScript((storedSettings) => {
    window.localStorage.setItem("settings", JSON.stringify(storedSettings));
  }, opts.settings);
}

export async function gotoWebApp(page: Page, path = "/"): Promise<void> {
  await page.goto(path, { waitUntil: "networkidle" });
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
}
