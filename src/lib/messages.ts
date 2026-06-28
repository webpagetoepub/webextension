// Message contracts exchanged between the extension contexts. The popup, the
// background (Chrome service worker / Firefox background page) and the Chrome
// offscreen document all share one runtime.onMessage bus, so every message
// carries a distinct `type` and each listener early-returns on the others'.
//
// Conversion runs in the background instead of the popup so that dismissing the
// popup no longer aborts the in-flight html2epub work (see CLAUDE.md).

/** popup or context menu -> background: convert the active tab and save it. */
export interface ConvertActiveTabMessage {
  type: "convert-active-tab";
}

/** popup -> background: what is the conversion doing right now? */
export interface GetConversionStatusMessage {
  type: "get-conversion-status";
}

/**
 * The background owns conversion progress and shares it as one of these states.
 * A popup opened from the context menu (which it didn't trigger) reads the
 * current state on load; every transition is also broadcast (StatusUpdateMessage)
 * so an already-open popup updates live.
 */
export type ConversionStatus =
  | { state: "idle" }
  | { state: "converting"; title?: string }
  | { state: "done"; title: string }
  | { state: "error"; message: string };

/** background -> popup (broadcast): the conversion status changed. */
export interface StatusUpdateMessage {
  type: "status-update";
  status: ConversionStatus;
}

/** background -> offscreen (Chrome only): convert this page's HTML to an ePub. */
export interface OffscreenConvertMessage {
  type: "offscreen-convert";
  url: string;
  html: string;
}

/** offscreen -> background: the ePub blob URL plus its document title. */
export interface OffscreenConvertSucceeded {
  blobUrl: string;
  title: string;
}

/** Any handler's failure reply; `error` is the human-readable message. */
export interface OperationFailed {
  error: string;
}

export type OffscreenConvertResponse =
  | OffscreenConvertSucceeded
  | OperationFailed;

export function isFailure(response: unknown): response is OperationFailed {
  return (
    typeof response === "object" &&
    response !== null &&
    typeof (response as { error?: unknown }).error === "string"
  );
}
