import browser from "./browser";
import {
  OffscreenConvertMessage,
  OffscreenConvertResponse,
  OffscreenConvertSucceeded,
  isFailure,
} from "./messages";

// Chrome-only path: the MV3 service worker has no DOM, so it delegates html2epub
// to an offscreen document. We use chrome.offscreen directly (it is Chrome-only
// and absent from webextension-polyfill — a deliberate exception to the
// browser.ts rule, scoped to this module).

const OFFSCREEN_URL = "offscreen.html";

// Chrome rejects a second createDocument with this message. Catching it (rather
// than calling getContexts) keeps us off the newer API and avoids a
// minimum_chrome_version bump.
const ALREADY_EXISTS = "Only a single offscreen document";

async function ensureOffscreenDocument(): Promise<void> {
  try {
    await chrome.offscreen.createDocument({
      url: OFFSCREEN_URL,
      reasons: ["DOM_PARSER"],
      justification:
        "Convert page HTML into an ePub using DOM APIs the service worker lacks.",
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    if (!reason.includes(ALREADY_EXISTS)) {
      throw error;
    }
  }
}

/** Tear down the offscreen document, revoking any blob URLs it created. */
export async function closeOffscreenDocument(): Promise<void> {
  // Swallow "no offscreen document" races — closing an absent one is a no-op.
  await chrome.offscreen.closeDocument().catch(() => {});
}

/**
 * Convert a page in the offscreen document and return the resulting ePub blob
 * URL plus its title. The offscreen document keeps the blob alive until
 * closeOffscreenDocument() runs.
 *
 * @example
 *   const { blobUrl, title } = await convertViaOffscreen(url, html);
 */
export default async function convertViaOffscreen(
  url: string,
  html: string,
): Promise<OffscreenConvertSucceeded> {
  await ensureOffscreenDocument();

  const message: OffscreenConvertMessage = {
    type: "offscreen-convert",
    url,
    html,
  };
  const response = (await browser.runtime.sendMessage(
    message,
  )) as OffscreenConvertResponse;

  if (isFailure(response)) {
    throw new Error(`Offscreen conversion failed: ${response.error}`);
  }
  return response;
}
