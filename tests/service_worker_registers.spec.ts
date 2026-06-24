import { test, expect } from "@playwright/test";
import launchExtension, { LoadedExtension } from "./helpers/launch_extension";

// Regression guard for the html2epub-in-the-worker leak. Statically importing
// convert_page_to_epub (which pulls in html2epub's DOMParser usage) into
// background.ts bundled it into the Chrome MV3 service worker. The worker has no
// DOM, so its top-level evaluation died with "DOMParser is not defined", worker
// registration failed and the extension would not install — yet the suite
// stayed green because every other spec drives conversion through a DOM harness
// page and launch_extension reads the extension id from the worker URL, which
// exists before the module finishes evaluating. Nothing asserted the worker
// itself loaded. This spec does.

let extension: LoadedExtension;

test.beforeAll(async () => {
  extension = await launchExtension();
});

test.afterAll(async () => {
  await extension.context.close();
});

test("the background service worker fully evaluates without a DOM", async () => {
  const [worker] = extension.context.serviceWorkers();
  expect(worker, "no background service worker was registered").toBeTruthy();

  // A genuine MV3 service worker context: no DOM globals. This is the
  // environment the DOMParser leak crashed in.
  expect(await worker.evaluate(() => typeof DOMParser)).toBe("undefined");

  // background.ts ends by registering runtime.onMessage. hasListeners() is true
  // only if the module ran to completion — i.e. nothing (like an eager html2epub
  // import) threw before that final statement. Poll so worker startup/eviction
  // races don't flake; with the bug present this never becomes true.
  await expect
    .poll(
      () => worker.evaluate(() => chrome.runtime.onMessage.hasListeners()),
      {
        timeout: 5_000,
        message:
          "background module did not finish evaluating (onMessage listener never registered)",
      },
    )
    .toBe(true);
});
