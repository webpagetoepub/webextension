import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect, Page } from "@playwright/test";
import launchExtension, { LoadedExtension } from "./helpers/launch_extension";
import startFixtureServer, { FixtureServer } from "./helpers/serve_fixture";

// Integration coverage for the conversion -> download save path that the
// background runs (convert_page_to_epub + download_epub). It runs in a real
// extension page because cross-context runtime messaging does not work in
// Playwright's headless extension harness, so the popup -> service worker ->
// offscreen message hops cannot be driven here; those hops are thin,
// type-guarded passthroughs. The ePub byte structure is covered separately by
// convert_valid_epub.spec.ts / convert_images.spec.ts.

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

let extension: LoadedExtension;
let server: FixtureServer;

test.beforeAll(async () => {
  extension = await launchExtension();
  server = await startFixtureServer();
});

test.afterAll(async () => {
  await extension.context.close();
  await server.close();
});

async function openHarness(): Promise<Page> {
  const page = await extension.context.newPage();
  await page.goto(`chrome-extension://${extension.extensionId}/harness.html`);
  await page.waitForFunction(
    () => typeof window.convertAndDownload === "function",
  );
  return page;
}

test("converts the page and saves it as a completed .epub download", async () => {
  const template = await readFile(join(fixturesDir, "article.html"), "utf8");
  const html = template.replace("__IMAGE_URL__", server.imageUrl);

  const page = await openHarness();

  // Real path: convert_page_to_epub -> download_epub (createObjectURL ->
  // chrome.downloads.download -> onDownloadSettled -> revoke).
  const { downloadId, title } = await page.evaluate(
    ([url, pageHtml]) => window.convertAndDownload(url, pageHtml),
    ["https://example.com/article", html],
  );

  expect(title).toBe("Test Article");
  expect(typeof downloadId).toBe("number");

  // The download reaches a terminal "complete" state. (Playwright captures the
  // file under its artifacts dir with a generated name, so we assert state, not
  // the on-disk filename.)
  await expect
    .poll(
      () =>
        page.evaluate(async (id) => {
          const [item] = await chrome.downloads.search({ id });
          return item?.state;
        }, downloadId),
      { timeout: 15_000, message: "download did not reach a terminal state" },
    )
    .toBe("complete");

  await page.close();
});
