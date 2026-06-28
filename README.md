# Webpage to ePub

A browser extension for **Chrome** and **Firefox** that converts the page you're
reading into an ePub file — entirely in your browser.

## Features

- Turns the current web page into a downloadable `.epub`;
- **100% client-side** — the page is converted locally and nothing is uploaded to a server;
- Two ways to trigger: the toolbar **popup button** or the **"Save page as ePub"** right-click menu entry;
- Live progress, and conversion keeps running even if you close the popup;
- Manifest V3, works on both Chrome and Firefox from a single codebase.

## Privacy

Everything runs in your browser. The page content is read from the open tab's
live DOM and converted on-device — no page text, URL, or file is sent anywhere.
Images embedded in the ePub are fetched directly from their origin so they can
be packaged into the file; that is the only network access the extension makes.

## Install

> Store listings are not published yet.

- Chrome Web Store — _coming soon_
- Firefox Add-ons (AMO) — _coming soon_

Until then, build it yourself and load it unpacked (see below).

## Build from source

Requirements: Node.js and npm.

```bash
npm install
npm run build          # produces dist/chrome and dist/firefox
```

Build a single target with `npm run build:chrome` or `npm run build:firefox`.

### Load the unpacked build

**Chrome** (111+)

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select `dist/chrome`.

**Firefox** (115+)

1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on…** and select any file inside `dist/firefox`
   (e.g. `manifest.json`).

## Permissions

| Permission              | Why it's needed                                                        |
| ----------------------- | ---------------------------------------------------------------------- |
| `host_permissions: <all_urls>` | Fetch images referenced by the page so they can be embedded in the ePub. |
| `scripting`             | Read the active tab's DOM on demand to capture the page content.        |
| `downloads`             | Save the generated ePub to your Downloads folder.                       |
| `contextMenus`          | Add the "Save page as ePub" right-click entry.                          |
| `offscreen` (Chrome)    | Run the converter in a hidden DOM document (the MV3 service worker has no DOM). |

## Development

```bash
npm run typecheck      # tsc --noEmit
npm run lint           # ESLint over src, tests, scripts
npm run format         # Prettier
npm test               # Playwright (Chromium) + Firefox via geckodriver
```

The conversion is powered by [`html2epub`](https://github.com/webpagetoepub/html2epub),
a sibling project bundled into the extension at build time (never fetched at
runtime). Because `html2epub` needs DOM globals, the background context differs
per browser: Chrome uses an offscreen document, Firefox uses its DOM-capable
background page.

For the full architecture, build pipeline, and testing notes, see
[`CLAUDE.md`](./CLAUDE.md).

## License

[MIT](./LICENSE) © Carlson Santana Cruz
