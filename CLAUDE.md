# webpagetoepub — webextension

Browser extension for Chrome and Firefox that converts the current web page into an ePub file. The conversion happens entirely client-side using [`html2epub`](https://github.com/webpagetoepub/html2epub) bundled into the extension.

## Stack

- **Language**: TypeScript, compiled to JavaScript for browser execution.
- **Framework**: None. Vanilla web extension APIs + a hand-written `manifest.json`. No WXT/Plasmo/CRXJS.
- **Manifest**: Manifest V3. A single shared `manifest.json` source is used, with browser-specific tweaks (e.g. `background.service_worker` for Chrome vs. `background.scripts` for Firefox, and the `browser_specific_settings` block for Firefox) applied at build time.
- **Bundler**: Bundle the extension scripts (popup, background/service worker, content script) and inline `html2epub` so everything runs browser-side. No remote code, no backend.

## Capabilities

- **Triggers**: The user can start a conversion either from the toolbar popup button or from a page context menu entry.
- **Content extraction**: The active tab's full DOM is captured (via a content script, e.g. `document.documentElement.outerHTML`) and passed to `html2epub`.
- **Output**: The generated ePub is saved to the user's Downloads folder via `chrome.downloads.download` (`browser.downloads.download` on Firefox — use the `webextension-polyfill` or a thin shim).

## Layout (target)

```
src/
  background/      # service worker / background script (context menu, download orchestration)
  popup/           # popup UI (HTML + TS)
  content/         # content script that serializes the page DOM
  lib/             # shared helpers, html2epub wrapper, browser API shim
manifest/
  manifest.base.json
  manifest.chrome.json
  manifest.firefox.json
build/             # build scripts that merge the manifest variants and bundle src/
dist/
  chrome/
  firefox/
tests/             # Playwright tests
```

## Build & tooling

- `npm run build` — produce `dist/chrome` and `dist/firefox` (load each as an unpacked extension).
- `npm run lint` — ESLint over `src/` and `tests/`.
- `npm run format` — Prettier.
- `npm test` — Playwright.

## Testing

Playwright is the test runner. **Caveat: Playwright only supports loading unpacked extensions in Chromium** (via `chromium.launchPersistentContext` with `--disable-extensions-except` and `--load-extension`). Firefox extension loading is not supported by Playwright at this time, so Firefox tests are limited to manual verification or `web-ext run` smoke checks. Write the automated suite against the Chromium build and treat Firefox as a manual/CI smoke target.

For Chromium tests:
- Launch a persistent context pointing at `dist/chrome`.
- Get the service worker via `context.serviceWorkers()` (wait for it if needed).
- Drive the popup by opening `chrome-extension://<id>/popup.html` in a page, or trigger the context menu programmatically from a test helper exposed by the background script.

## Conventions

- Use `chrome.*` only behind a thin polyfill so the same code works on Firefox.
- Keep `html2epub` invocation in `src/lib/` so popup and context-menu paths share a single conversion entry point.
- Never fetch remote scripts at runtime (MV3 forbids it and Firefox AMO rejects it).
