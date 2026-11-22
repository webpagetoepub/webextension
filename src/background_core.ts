import browser from "./lib/browser";
import serializeActiveTab, { SerializedPage } from "./lib/serialize_active_tab";
import {
  ConversionStatus,
  ConvertActiveTabMessage,
  GetConversionStatusMessage,
  StatusUpdateMessage,
} from "./lib/messages";
import reportConversionError from "./lib/report_conversion_error";

// Browser-agnostic background orchestration. Owns conversion status, the two
// triggers (popup button + page context menu) and the context menu itself, and
// delegates the one browser-specific step — convert the serialized page and save
// it — to an injected strategy. The per-browser entry files (background.chrome.ts,
// background.firefox.ts) supply that strategy, so this module depends on neither
// the Chrome offscreen path nor the Firefox inline path.

// Per-browser convert+download step. Receives the serialized active tab and
// returns the resulting document title (used for the "done" status).
export type ConvertAndDownload = (page: SerializedPage) => Promise<string>;

// Optional per-browser failure notifier. The published "error" status is enough on
// Chrome and Firefox desktop (the popup renders it), but Firefox Android has no
// popup, so its entry supplies this to surface the failure in-page. Chrome omits it.
export type NotifyConversionError = (message: string) => void;

// The background owns conversion progress so both triggers feed one status
// stream. A popup opened from the context menu — which it didn't start — reads
// this on load to catch up, and every transition is broadcast so an already-open
// popup updates live.
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

async function activeTabTitle(): Promise<string | undefined> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  return tab?.title;
}

// Runs the whole conversion, narrating progress through publishStatus so any
// open popup reflects it. Returns void: callers don't read a reply, they watch
// the status. The guard drops a second trigger while one is already in flight.
async function convertActiveTab(
  convertAndDownload: ConvertAndDownload,
  onConversionError?: NotifyConversionError,
): Promise<void> {
  if (currentStatus.state === "converting") {
    return;
  }
  publishStatus({ state: "converting", title: await activeTabTitle() });
  try {
    const page = await serializeActiveTab();
    console.log(
      `[webpage2epub] serialized tab ${page.tabId} (${page.html.length} chars of HTML)`,
    );
    const title = await convertAndDownload(page);
    publishStatus({ state: "done", title });
  } catch (error) {
    reportConversionError(error, publishStatus, onConversionError);
  }
}

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

// Starts a conversion of the active tab. Status-managed and drops a re-entrant
// call while one is in flight (see convertActiveTab). Returned by registerBackground
// so a per-browser entry can wire its own extra trigger — the Firefox toolbar tap
// (src/firefox/background.firefox.ts) uses it for Fenix, where the tap is the only UI.
export type StartConversion = () => void;

/**
 * Wire up the browser-agnostic background: the message listeners and the page
 * context menu, returning the trigger that starts a conversion. All registration
 * runs synchronously so an MV3 worker wake-up finds the onMessage listener already
 * attached. The browser-specific convert+download step is injected, and the
 * returned trigger lets an entry add browser-specific triggers (e.g. the Firefox
 * toolbar tap); Chrome relies only on the popup + context menu and ignores it.
 *
 * @example
 *   registerBackground(convertInOffscreenAndDownload); // Chrome entry
 */
export default function registerBackground(
  convertAndDownload: ConvertAndDownload,
  onConversionError?: NotifyConversionError,
): StartConversion {
  const startConversion: StartConversion = () => {
    void convertActiveTab(convertAndDownload, onConversionError);
  };

  browser.runtime.onMessage.addListener((message: unknown) => {
    if (isConvertActiveTab(message)) {
      // Returning the promise keeps the MV3 worker alive until conversion ends.
      return convertActiveTab(convertAndDownload, onConversionError);
    }
    if (isGetConversionStatus(message)) {
      return Promise.resolve(currentStatus);
    }
    return undefined; // not ours — e.g. the offscreen document's own messages
  });

  // The page context menu doesn't exist on Firefox Android — browser.contextMenus
  // is undefined there (not merely a no-op), so touching it throws — so only wire
  // it where the API exists. See anonaddy/browser-extension#67.
  if (!browser.contextMenus) {
    return startConversion;
  }
  browser.runtime.onInstalled.addListener(() => {
    void registerConvertMenu();
  });
  browser.contextMenus.onClicked.addListener((info) => {
    if (info.menuItemId !== CONVERT_MENU_ID) {
      return; // another extension's menu item shares this bus
    }
    openPopupForProgress();
    startConversion();
  });

  return startConversion;
}
