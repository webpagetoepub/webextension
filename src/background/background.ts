import browser from "../lib/browser";
import serializeActiveTab from "../lib/serialize_active_tab";
import downloadEpub, { downloadFromBlobUrl } from "../lib/download_epub";
import convertViaOffscreen, {
  closeOffscreenDocument,
} from "../lib/convert_via_offscreen";
import {
  ConversionStatus,
  ConvertActiveTabMessage,
  GetConversionStatusMessage,
  StatusUpdateMessage,
} from "../lib/messages";

// Orchestrates conversion off the popup so dismissing the popup no longer aborts
// it. The same file runs in two environments and branches on DOM availability:
//   - Chrome: a service worker (no DOM) -> drives an offscreen document.
//   - Firefox: a background page (full DOM) -> converts inline.
const RUNS_IN_SERVICE_WORKER = typeof document === "undefined";

// The background owns conversion progress so both triggers (popup button and
// page context menu) feed one status stream. A popup opened from the context
// menu — which it didn't start — reads this on load to catch up, and every
// transition is broadcast so an already-open popup updates live.
let currentStatus: ConversionStatus = { state: "idle" };

function publishStatus(status: ConversionStatus): void {
  currentStatus = status;
  const message: StatusUpdateMessage = { type: "status-update", status };
  // Rejects with "receiving end does not exist" when no popup is open; expected.
  void browser.runtime.sendMessage(message).catch(() => undefined);
}

function isConvertActiveTab(
  message: unknown,
): message is ConvertActiveTabMessage {
  return (
    typeof message === "object" &&
    message !== null &&
    (message as { type?: unknown }).type === "convert-active-tab"
  );
}

function isGetConversionStatus(
  message: unknown,
): message is GetConversionStatusMessage {
  return (
    typeof message === "object" &&
    message !== null &&
    (message as { type?: unknown }).type === "get-conversion-status"
  );
}

// Firefox background page: full DOM + downloads API, so convert and save here.
//
// convert_page_to_epub pulls in html2epub, which references DOM globals
// (DOMParser, XMLSerializer, …) in its module body. It is loaded with a dynamic
// import so esbuild keeps it out of the worker's top-level evaluation: on Chrome
// this branch never runs, so the worker (which has no DOM) registers cleanly.
// A static import bundled it into the worker and broke registration with
// "DOMParser is not defined".
async function convertInlineAndDownload(
  url: string,
  html: string,
): Promise<string> {
  const { default: convertPageToEpub } =
    await import("../lib/convert_page_to_epub");
  const { title, epub } = await convertPageToEpub(url, html);
  await downloadEpub(epub, title);
  return title;
}

// Chrome service worker: convert in the offscreen document, then download the
// blob URL it produced and close that document once the download settles.
async function convertInOffscreenAndDownload(
  url: string,
  html: string,
): Promise<string> {
  const { blobUrl, title } = await convertViaOffscreen(url, html);
  await downloadFromBlobUrl(blobUrl, title, () => {
    void closeOffscreenDocument();
  });
  return title;
}

async function activeTabTitle(): Promise<string | undefined> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  return tab?.title;
}

// Runs the whole conversion, narrating progress through publishStatus so any
// open popup reflects it. Returns void: callers don't read a reply, they watch
// the status. The guard drops a second trigger while one is already in flight.
async function convertActiveTab(): Promise<void> {
  if (currentStatus.state === "converting") {
    return;
  }
  publishStatus({ state: "converting", title: await activeTabTitle() });
  try {
    const { url, html } = await serializeActiveTab();
    const title = RUNS_IN_SERVICE_WORKER
      ? await convertInOffscreenAndDownload(url, html)
      : await convertInlineAndDownload(url, html);
    publishStatus({ state: "done", title });
  } catch (error) {
    publishStatus({
      state: "error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

browser.runtime.onMessage.addListener((message: unknown) => {
  if (isConvertActiveTab(message)) {
    // Returning the promise keeps the MV3 worker alive until conversion ends.
    return convertActiveTab();
  }
  if (isGetConversionStatus(message)) {
    return Promise.resolve(currentStatus);
  }
  return undefined; // not ours — e.g. the offscreen document's own messages
});

// A page context-menu entry mirrors the toolbar popup: both convert the active
// tab. Created on install/update (the only time a menu may be registered);
// removeAll first so an update doesn't trip "duplicate id". The entry persists
// across service-worker restarts, but onClicked must be wired up synchronously
// at top level so the listener exists when an MV3 worker wakes to handle a click.
const CONVERT_MENU_ID = "convert-active-tab";

async function registerConvertMenu(): Promise<void> {
  await browser.contextMenus.removeAll();
  browser.contextMenus.create({
    id: CONVERT_MENU_ID,
    title: "Save page as ePub",
    contexts: ["page"],
  });
}

// Open the toolbar popup so the user sees the same progress message they'd get
// from clicking the button. Best-effort: chrome.action.openPopup() needs Chrome
// 127+ (manifest min is 111) and a user gesture, so on older Chrome it throws —
// conversion still runs and the result shows when the popup is opened manually.
// Called before any await so the click still counts as the gesture Firefox needs.
function openPopupForProgress(): void {
  void browser.action.openPopup?.().catch(() => undefined);
}

browser.runtime.onInstalled.addListener(() => {
  void registerConvertMenu();
});

browser.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId !== CONVERT_MENU_ID) {
    return; // another extension's menu item shares this bus
  }
  openPopupForProgress();
  void convertActiveTab();
});
