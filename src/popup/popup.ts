import browser from "../lib/browser";
import {
  ConversionStatus,
  ConvertActiveTabMessage,
  GetConversionStatusMessage,
  StatusUpdateMessage,
} from "../lib/messages";
import statusView from "./status_view";

// The popup is a passive view over the background's conversion status. The
// background owns the work and broadcasts every status change, so the popup
// shows progress no matter which trigger started it — the toolbar button or the
// page context menu (which opens this popup via chrome.action.openPopup). Closing
// the popup mid-conversion no longer aborts it; the download still completes.

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing #${id} element in popup.html`);
  }
  return element as T;
}

const button = requireElement<HTMLButtonElement>("convert");
const status = requireElement<HTMLParagraphElement>("status");

function render(state: ConversionStatus): void {
  const view = statusView(state);
  status.textContent = view.text;
  status.classList.toggle("error", view.isError);
  button.disabled = view.busy;
}

function startConversion(): void {
  const message: ConvertActiveTabMessage = { type: "convert-active-tab" };
  // Fire and forget: the UI is driven by status-update broadcasts, and the
  // background keeps converting even if this popup closes.
  void browser.runtime.sendMessage(message).catch(() => undefined);
}

function isStatusUpdate(message: unknown): message is StatusUpdateMessage {
  return (
    typeof message === "object" &&
    message !== null &&
    (message as { type?: unknown }).type === "status-update"
  );
}

// A popup opened from the context menu may miss the "converting" broadcast that
// fired before its listener was ready, so it asks the background for the current
// status on load to catch up.
async function showCurrentStatus(): Promise<void> {
  const query: GetConversionStatusMessage = { type: "get-conversion-status" };
  const snapshot = (await browser.runtime.sendMessage(query)) as
    | ConversionStatus
    | undefined;
  if (snapshot) {
    render(snapshot);
  }
}

browser.runtime.onMessage.addListener((message: unknown) => {
  if (isStatusUpdate(message)) {
    render(message.status);
  }
  return undefined;
});

button.addEventListener("click", startConversion);
void showCurrentStatus();
