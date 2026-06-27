# webpagetoepub — webextension

Browser extension for Chrome and Firefox that converts the current web page into an ePub file. The conversion happens entirely client-side using [`html2epub`](https://github.com/webpagetoepub/html2epub) bundled into the extension.

## Stack

- **Language**: TypeScript, compiled to JavaScript for browser execution.
- **Framework**: None. Vanilla web extension APIs + a hand-written `manifest.json`. No WXT/Plasmo/CRXJS.
- **Manifest**: Manifest V3. A single shared `manifest.json` source is used, with browser-specific tweaks applied at build time. The background is declared per browser: Chrome uses a `service_worker`, Firefox uses `background.scripts` (a background page). Chrome additionally holds the `offscreen` permission.
- **Bundler**: esbuild. Bundles `src/popup/popup.ts`, `src/background/background.ts`, `src/offscreen/offscreen.ts` and inlines `html2epub` so everything runs browser-side. No remote code, no backend.

## Capabilities

- **Trigger**: Toolbar popup button. The popup is a thin trigger — it sends a `convert-active-tab` message to the background and the background does the work, so dismissing the popup no longer aborts conversion.
- **Content extraction**: The active tab's live DOM is read on demand via `chrome.scripting.executeScript` (injected function returning `document.documentElement.outerHTML`). The page is never refetched.
- **Conversion**: `html2epub` needs DOM globals (`DOMParser`, `XMLSerializer`, `fetch`, …). It runs in the background context, which differs by browser:
  - **Chrome**: the MV3 service worker has no DOM, so it spins up an **offscreen document** (`chrome.offscreen`, `src/offscreen/`) to convert and create the blob URL; the worker then triggers the download.
  - **Firefox**: there is no offscreen API, but the background page has full DOM and API access, so it converts and downloads inline.
  The split lives in `src/background/background.ts`, branching on `typeof document === "undefined"`. Cross-origin image fetching is covered by `host_permissions: ["<all_urls>"]`.
- **Output**: The generated ePub is saved to the user's Downloads folder via `browser.downloads.download` (`webextension-polyfill` normalises the API across browsers).

## Layout

```
src/
  popup/           # popup UI (HTML + TS) — thin trigger that messages the background
  background/      # background.ts — Chrome service worker / Firefox background page
  offscreen/       # offscreen.html + .ts — Chrome-only hidden DOM host for html2epub
  lib/             # shared helpers: browser shim, html2epub wrapper, logger, downloader,
                   #   convert_via_offscreen (Chrome), messages (cross-context contracts)
  types/           # hand-written .d.ts stubs (html2epub, chrome.offscreen; typecheck only)
  manifest/        # per-browser manifest fragments, merged at build time
    manifest.base.json
    manifest.chrome.json
    manifest.firefox.json
scripts/           # esbuild scripts that merge manifests and bundle src/
dist/              # generated; git-ignored
  chrome/
  firefox/
tests/
  fixtures/        # article.html + PNG served by a local HTTP server
  helpers/         # launch_extension, build_test_extension, serve_fixture, …
  *.spec.ts        # Playwright specs (Chromium only)
```

## Build & tooling

- `npm run build` — produce `dist/chrome` and `dist/firefox` (load each as an unpacked extension).
- `npm run build:chrome` / `npm run build:firefox` — build a single target.
- `npm run typecheck` — `tsc --noEmit` via `tsconfig.typecheck.json` (uses a path stub for `html2epub` to keep type-checking scoped to our own code).
- `npm run lint` — ESLint over `src/`, `tests/`, and `scripts/`.
- `npm run format` — Prettier.
- `npm test` — Playwright.

## Testing

Playwright is the test runner. **Caveat: Playwright only supports loading unpacked extensions in Chromium** (via `chromium.launchPersistentContext` with `--disable-extensions-except` and `--load-extension`). So the conversion/download suite is Chromium-only. Firefox gets a separate, narrower automated check driven through geckodriver (see below); both live under `tests/` and run from the single `npm test`.

For Firefox (`tests/firefox_extension_loads.spec.ts`):
- Playwright cannot load a Firefox extension, so the spec drives a real Firefox through **geckodriver** (the Marionette/WebDriver path, same as `web-ext run`). `tests/helpers/load_firefox_extension.ts` builds `dist/firefox`, zips it into an `.xpi` with `fflate`, downloads the geckodriver binary via the `geckodriver` package, then `installAddon(xpi, /* temporary */ true)` installs it unsigned.
- **Scope: this only asserts the build *loads* as a temporary add-on** (the resolved add-on id equals `browser_specific_settings.gecko.id`). It does not exercise conversion — Firefox conversion is currently broken, and this guards against manifest/bundle regressions that would stop the extension loading at all.
- Requires a system Firefox. The geckodriver binary is downloaded once into `node_modules/.cache/geckodriver` (git-ignored) and reused; only the first run needs network. Override the location with `GECKODRIVER_CACHE_DIR` or pin the version with `GECKODRIVER_VERSION` for offline/CI.

For Chromium tests:

For Chromium tests:
- A test-only build (`tests/helpers/build_test_extension.ts`) bundles the production popup, background and offscreen scripts alongside a thin `harness.html` page that exposes `window.convertToEpubBytes(url, html)` and `window.convertAndDownload(url, html)` — this avoids driving the real popup UI and returns raw bytes / a download id for assertions. The real background service worker also serves as the `context.serviceWorkers()` id source.
- **Caveat: cross-context runtime messaging does not work in this headless harness** (verified: page↔service-worker `chrome.runtime.sendMessage` never settles). So the popup → service worker → offscreen message hops cannot be exercised end-to-end here; they are thin, type-guarded passthroughs. Tests instead call the production library functions (`convert_page_to_epub`, `download_epub`) directly in a real extension page.
- Assertions use `fflate.unzipSync` to inspect the ePub archive structure in Node; the download path is checked by polling `chrome.downloads.search` for a `complete` state (Playwright captures the file under its artifacts dir with a generated name, so assert state, not the on-disk filename).

## Conventions

- Use `chrome.*` only behind `src/lib/browser.ts` (re-exports `webextension-polyfill`) so the same code works on Firefox. The one exception is `chrome.offscreen` (Chrome-only, absent from the polyfill), used solely in `src/lib/convert_via_offscreen.ts` behind the service-worker branch.
- Keep `html2epub` invocation in `src/lib/convert_page_to_epub.ts` — the single conversion entry point.
- Never fetch remote scripts at runtime (MV3 forbids it and Firefox AMO rejects it).
- Conversion runs in the background, not the popup, so the popup may be closed mid-conversion without aborting it. Cross-context message shapes live in `src/lib/messages.ts`.

## Code style

- Functions: 4-20 lines. Split if longer.
- Files: under 500 lines. Split by responsibility.
- One thing per function, one responsibility per module (SRP).
- Names: specific and unique. Avoid `data`, `handler`, `Manager`.
  Prefer names that return <5 grep hits in the codebase.
- Types: explicit. No `any`, no `Dict`, no untyped functions.
- No code duplication. Extract shared logic into a function/module.
- Early returns over nested ifs. Max 2 levels of indentation.
- Exception messages must include the offending value and expected shape.

## Comments

- Keep your own comments. Don't strip them on refactor — they carry
  intent and provenance.
- Write WHY, not WHAT. Skip `// increment counter` above `i++`.
- Docstrings on public functions: intent + one usage example.
- Reference issue numbers / commit SHAs when a line exists because
  of a specific bug or upstream constraint.

## Tests

- Tests run with a single command: `npm test`.
- Every new function gets a test. Bug fixes get a regression test.
- Mock external I/O (API, DB, filesystem) with named fake classes,
  not inline stubs.
- Tests must be F.I.R.S.T: fast, independent, repeatable,
  self-validating, timely.

## Formatting

- Use the language default formatter `prettier`. Don't discuss style beyond that.
