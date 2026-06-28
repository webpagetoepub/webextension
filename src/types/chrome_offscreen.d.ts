// The Chrome Offscreen Documents API is not part of webextension-polyfill (it is
// Chrome-only), so we hand-type just the subset we call from the service worker
// to drive conversion in a hidden DOM context. Mirrors the public shape at
// https://developer.chrome.com/docs/extensions/reference/api/offscreen.
// `chrome` may be absent at runtime (Firefox background page), so callers guard
// on `typeof chrome.offscreen !== "undefined"` before using it.

declare namespace chrome {
  namespace offscreen {
    type Reason =
      | "DOM_PARSER"
      | "BLOBS"
      | "DOM_SCRAPING"
      | "WORKERS"
      | "IFRAME_SCRIPTING";

    interface CreateParameters {
      url: string;
      reasons: Reason[];
      justification: string;
    }

    function createDocument(parameters: CreateParameters): Promise<void>;
    function closeDocument(): Promise<void>;
  }
}
