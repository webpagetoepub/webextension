# webpagetoepub — webextension

Browser extension for Chrome and Firefox that converts the current web page into an ePub file. The conversion happens entirely client-side using [`html2epub`](https://github.com/webpagetoepub/html2epub) bundled into the extension.

## Stack

- **Language**: TypeScript, compiled to JavaScript for browser execution.
- **Framework**: None. Vanilla web extension APIs + a hand-written `manifest.json`. No WXT/Plasmo/CRXJS.
- **Manifest**: Manifest V3. A single shared `manifest.json` source is used, with browser-specific tweaks (e.g. `browser_specific_settings` for Firefox) applied at build time. No background/service worker key — MV3 allows extensions without one.
- **Bundler**: esbuild. Bundles `src/popup/popup.ts` and inlines `html2epub` so everything runs browser-side. No remote code, no backend.

## Capabilities

- **Trigger**: Toolbar popup button only. No context menu, no background script.
- **Content extraction**: The active tab's live DOM is read on demand via `chrome.scripting.executeScript` (injected function returning `document.documentElement.outerHTML`). The page is never refetched.
- **Conversion**: `html2epub` runs entirely inside the popup page, which provides the DOM globals it requires (`DOMParser`, `XMLSerializer`, `fetch`, etc.). Cross-origin image fetching is covered by `host_permissions: ["<all_urls>"]`.
- **Output**: The generated ePub is saved to the user's Downloads folder via `browser.downloads.download` (`webextension-polyfill` normalises the API across browsers).

## Layout

```
src/
  popup/           # popup UI (HTML + TS) — the only extension entry point
  lib/             # shared helpers: browser shim, html2epub wrapper, logger, downloader
  types/           # hand-written .d.ts stubs (html2epub, for typecheck only)
manifest/
  manifest.base.json
  manifest.chrome.json
  manifest.firefox.json
build/             # esbuild scripts that merge manifests and bundle src/
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
- `npm run lint` — ESLint over `src/`, `tests/`, and `build/`.
- `npm run format` — Prettier.
- `npm test` — Playwright.

## Testing

Playwright is the test runner. **Caveat: Playwright only supports loading unpacked extensions in Chromium** (via `chromium.launchPersistentContext` with `--disable-extensions-except` and `--load-extension`). Firefox extension loading is not supported by Playwright at this time, so Firefox tests are limited to manual verification or `web-ext run` smoke checks. Write the automated suite against the Chromium build and treat Firefox as a manual/CI smoke target.

For Chromium tests:
- A test-only build (`tests/helpers/build_test_extension.ts`) bundles the popup alongside a thin `harness.html` page that exposes `window.convertToEpubBytes(url, html)` — this avoids driving the real popup UI and returns raw bytes for structural assertions.
- A trivial `background.js` is added to the test build only so that `context.serviceWorkers()` can discover the extension ID. It does nothing else.
- Assertions use `fflate.unzipSync` to inspect the ePub archive structure in Node.

## Conventions

- Use `chrome.*` only behind `src/lib/browser.ts` (re-exports `webextension-polyfill`) so the same code works on Firefox.
- Keep `html2epub` invocation in `src/lib/convert_page_to_epub.ts` — the single conversion entry point.
- Never fetch remote scripts at runtime (MV3 forbids it and Firefox AMO rejects it).
- The popup must stay open during conversion; closing it aborts the in-flight `html2epub` call.

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
