import browser from "../lib/browser";
import serializeActiveTab from "../lib/serialize_active_tab";
import downloadEpub, { downloadFromBlobUrl } from "../lib/download_epub";
import convertViaOffscreen, {
  closeOffscreenDocument,
} from "../lib/convert_via_offscreen";
import { ConvertActiveTabMessage, ConvertResponse } from "../lib/messages";

// Orchestrates conversion off the popup so dismissing the popup no longer aborts
// it. The same file runs in two environments and branches on DOM availability:
//   - Chrome: a service worker (no DOM) -> drives an offscreen document.
//   - Firefox: a background page (full DOM) -> converts inline.
const RUNS_IN_SERVICE_WORKER = typeof document === "undefined";

function isConvertActiveTab(
  message: unknown,
): message is ConvertActiveTabMessage {
  return (
    typeof message === "object" &&
    message !== null &&
    (message as { type?: unknown }).type === "convert-active-tab"
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

async function convertActiveTab(): Promise<ConvertResponse> {
  try {
    const { url, html } = await serializeActiveTab();
    const title = RUNS_IN_SERVICE_WORKER
      ? await convertInOffscreenAndDownload(url, html)
      : await convertInlineAndDownload(url, html);
    return { title };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

browser.runtime.onMessage.addListener((message: unknown) => {
  if (!isConvertActiveTab(message)) {
    return undefined; // not ours — e.g. the offscreen document's own messages
  }
  return convertActiveTab();
});
