// Message contracts exchanged between the extension contexts. The popup, the
// background (Chrome service worker / Firefox background page) and the Chrome
// offscreen document all share one runtime.onMessage bus, so every message
// carries a distinct `type` and each listener early-returns on the others'.
//
// Conversion runs in the background instead of the popup so that dismissing the
// popup no longer aborts the in-flight html2epub work (see CLAUDE.md).

/** popup -> background: convert the active tab and save the ePub. */
export interface ConvertActiveTabMessage {
  type: "convert-active-tab";
}

/** background -> offscreen (Chrome only): convert this page's HTML to an ePub. */
export interface OffscreenConvertMessage {
  type: "offscreen-convert";
  url: string;
  html: string;
}

/** background -> popup: conversion finished and the download was started. */
export interface ConvertSucceeded {
  title: string;
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

export type ConvertResponse = ConvertSucceeded | OperationFailed;
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
