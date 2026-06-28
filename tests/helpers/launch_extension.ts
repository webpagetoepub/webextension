import { chromium, BrowserContext, Worker } from "@playwright/test";
import buildTestExtension from "./build_test_extension";

export interface LoadedExtension {
  context: BrowserContext;
  extensionId: string;
}

// Playwright can only load unpacked extensions in Chromium, via a persistent
// context with --load-extension (per CLAUDE.md). channel:'chromium' selects the
// new-headless build that supports extensions headlessly.
export default async function launchExtension(): Promise<LoadedExtension> {
  const extensionPath = await buildTestExtension();

  const context = await chromium.launchPersistentContext("", {
    channel: "chromium",
    headless: true,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
  });

  let [worker]: Worker[] = context.serviceWorkers();
  if (!worker) {
    worker = await context.waitForEvent("serviceworker");
  }
  const extensionId = worker.url().split("/")[2];

  return { context, extensionId };
}
