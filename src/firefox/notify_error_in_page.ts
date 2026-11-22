// Firefox Android (Fenix) has no popup and no context menu — the toolbar tap is
// the only UI (see background.firefox.ts) — so the "error" status the background
// publishes has nowhere to render and a failed conversion is otherwise silent.
// This module surfaces the failure by injecting a toast into the active tab, the
// same self-contained-function-over-executeScript pattern as download_via_page.ts.
// No new permission: it reuses "scripting" + host_permissions already held.

// Fixed user-facing line shown in the toast. The raw error.message is logged, not
// shown: html2epub/DOM internals are noise on a phone.
export const ERROR_TOAST_MESSAGE = "Couldn't save this page as ePub.";

// Injected into the active tab, so it must be fully self-contained (no imports or
// outer references) to survive serialization — same rule as serializeCurrentDocument
// and saveBase64AsDownload, which is why the element id and dismiss delay are inlined
// here rather than shared constants. Inline styles (not a stylesheet) and a maxed-out
// z-index so the page's own CSS can't hide or restyle it. Dismisses on tap or after
// the timeout, whichever comes first; a fixed id means a repeat failure replaces the
// prior toast instead of stacking.
export function showErrorToast(message: string): void {
  if (!document.body) {
    return;
  }
  document.getElementById("webpage2epub-error-toast")?.remove();
  const toast = document.createElement("div");
  toast.id = "webpage2epub-error-toast";
  toast.textContent = message;
  toast.setAttribute("role", "alert");
  toast.style.cssText = [
    "position:fixed",
    "left:16px",
    "right:16px",
    "bottom:16px",
    "z-index:2147483647",
    "margin:0 auto",
    "max-width:420px",
    "padding:14px 18px",
    "border-radius:10px",
    "background:#b3261e",
    "color:#fff",
    "font:500 15px/1.4 sans-serif",
    "text-align:center",
    "box-shadow:0 2px 10px rgba(0,0,0,0.35)",
    "cursor:pointer",
  ].join(";");
  const remove = (): void => toast.remove();
  toast.addEventListener("click", remove);
  window.setTimeout(remove, 6000);
  document.body.appendChild(toast);
}

/**
 * Show a failed-conversion toast in the active tab — but only on Firefox Android,
 * where there is no popup to render the published error status. The toast shows the
 * fixed ERROR_TOAST_MESSAGE; the detailed errorMessage is logged for debugging.
 * Best-effort: an uninjectable target (about:, PDF viewer, moz-extension) must not
 * throw back out of the background's error handler, so failures are swallowed.
 *
 * The Android gate lives here (not in registerBackground) so the background entry
 * can wire this synchronously at module load without awaiting getPlatformInfo.
 *
 * @example
 *   registerBackground(convert, (message) => void notifyErrorInPage(message));
 */
export default async function notifyErrorInPage(
  errorMessage: string,
): Promise<void> {
  console.log(`[webpage2epub] conversion failed: ${errorMessage}`);
  // Deferred import: webextension-polyfill throws at import time outside an
  // extension, so importing it lazily keeps this module's pure parts
  // (ERROR_TOAST_MESSAGE, showErrorToast) loadable and unit-testable in Node.
  const { default: browser } = await import("../lib/browser");
  try {
    const { os } = await browser.runtime.getPlatformInfo();
    if (os !== "android") {
      return; // desktop Firefox renders the error in its popup
    }
    const [tab] = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (!tab?.id) {
      return;
    }
    await browser.scripting.executeScript({
      target: { tabId: tab.id },
      func: showErrorToast,
      args: [ERROR_TOAST_MESSAGE],
    });
  } catch (error) {
    console.log(`[webpage2epub] could not show error toast in page: ${error}`);
  }
}
