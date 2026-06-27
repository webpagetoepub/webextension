import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";
import loadFirefoxExtension, {
  LoadedFirefoxExtension,
} from "./helpers/load_firefox_extension";
import buildTestExtension from "./helpers/build_test_extension";
import startFixtureServer, { FixtureServer } from "./helpers/serve_fixture";

// Conversion coverage for the Firefox build. Playwright cannot load a Firefox
// add-on, so (like firefox_extension_loads.spec.ts) we drive a real Firefox
// through geckodriver. The add-on is installed with a pinned moz-extension UUID
// so we can navigate to its harness page and run the *real* bundled conversion
// (convert_page_to_epub) in an extension page — the same DOM-bearing environment
// the Firefox background page converts in.
//
// Regression guard for "Promised response from onMessage listener went out of
// scope": html2epub -> jepub calls fflate's async zip(), which for any archive
// member >= 160 KB deflates it in a `new Worker(URL.createObjectURL(blob))`.
// Firefox's MV3 extension CSP forbids blob: workers (only 'self'/'none'/
// 'wasm-unsafe-eval', un-relaxable in the manifest), so the worker is blocked,
// its callback never fires, and conversion hangs forever. The fix routes zipping
// through fflate's synchronous zipSync (src/lib/fflate_main_thread.ts), so no
// worker is spawned. Building + launching Firefox is slow, hence the wide
// timeout.
test.describe.configure({ timeout: 180_000 });

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

// Two conditions are required to reproduce the bug, and the test pins both so it
// fails deterministically on the pre-fix bundle regardless of Firefox version:
//
//  1. A large chapter. fflate only offloads to a Worker for members >= 160 KB;
//     small pages stay on the synchronous path and never hit the CSP block.
//  2. The strict MV3 base CSP. Newer Firefox builds (e.g. 151) relax the default
//     enough to permit extension-origin blob: workers, hiding the bug; pinning
//     the documented MV3 base policy via a pref restores the strict enforcement
//     the broken Firefox installs apply.
const LARGE_BODY =
  "<p>" + "Lorem ipsum dolor sit amet. ".repeat(12000) + "</p>";
const STRICT_MV3_CSP_PREFS = {
  "extensions.webextensions.base-content-security-policy.v3":
    "script-src 'self' 'wasm-unsafe-eval';",
};

interface ConversionResult {
  ok: boolean;
  length?: number;
  error?: string;
}

// Runs in the harness page: call the bundled conversion and report back through
// the executeAsyncScript callback (last argument) rather than throwing, so a
// rejection surfaces as a readable message instead of a raw stack.
const RUN_CONVERSION = `
  const done = arguments[arguments.length - 1];
  const url = arguments[0];
  const html = arguments[1];
  window
    .convertToEpubBytes(url, html)
    .then((bytes) => done({ ok: true, length: bytes.length }))
    .catch((error) => done({ ok: false, error: String((error && error.message) || error) }));
`;

let extension: LoadedFirefoxExtension;
let server: FixtureServer;

test.afterAll(async () => {
  await extension?.driver.quit();
  await server?.close();
});

test("converts a large active page to a valid ePub on Firefox", async () => {
  server = await startFixtureServer();
  const template = await readFile(join(fixturesDir, "article.html"), "utf8");
  const html = template
    .replace("__IMAGE_URL__", server.imageUrl)
    .replace("</main>", `${LARGE_BODY}</main>`);

  const uuid = randomUUID();
  extension = await loadFirefoxExtension({
    uuid,
    buildExtension: () => buildTestExtension("firefox"),
    prefs: STRICT_MV3_CSP_PREFS,
  });

  const { driver } = extension;
  await driver.get(`moz-extension://${uuid}/harness.html`);
  await driver.wait(
    () =>
      driver.executeScript(
        "return typeof window.convertToEpubBytes === 'function';",
      ),
    10_000,
  );

  // Bound the in-page conversion so the pre-fix blob-worker hang fails the test
  // instead of stalling the suite until the outer timeout.
  await driver.manage().setTimeouts({ script: 60_000 });
  const result = (await driver.executeAsyncScript(
    RUN_CONVERSION,
    "https://example.com/article",
    html,
  )) as ConversionResult;

  expect(result.error ?? "").toBe("");
  expect(result.ok).toBe(true);
  expect(result.length ?? 0).toBeGreaterThan(0);
});
