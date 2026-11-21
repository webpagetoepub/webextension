// Firefox Android (Fenix) has no working downloads API — it was removed in Firefox
// 79 and never reimplemented (Bug 1538348, https://bugzilla.mozilla.org/show_bug.cgi?id=1538348).
// Depending on the build it's either absent or present as a stub whose promise
// never resolves, so downloads.download would either throw or hang conversion
// forever. This module instead saves the ePub the way page JavaScript does: an
// <a download> click on a blob: URL, which drives Fenix's native download manager
// so the file lands in the Downloads menu with the right filename, no API required.

// base64 encodes 3 bytes per 4 chars, so chunk on a multiple of 3 to keep each
// String.fromCharCode(...) call well under the engine's argument-count limit
// (spreading a whole multi-MB array at once overflows the call stack).
const BASE64_CHUNK_BYTES = 0x8000;

/** Encode bytes as base64, chunked to avoid String.fromCharCode arg limits. */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += BASE64_CHUNK_BYTES) {
    const chunk = bytes.subarray(offset, offset + BASE64_CHUNK_BYTES);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

/**
 * True when the downloads API is outright absent. One of the two signals the
 * background uses to pick the in-page fallback (the other is os === "android",
 * for Fenix builds that expose a non-resolving stub rather than omitting it).
 */
export function downloadsApiUnavailable(
  downloads: { download?: unknown } | undefined,
): boolean {
  return typeof downloads?.download !== "function";
}

// Returned to the background so a failure inside the page surfaces as an error
// rather than a silent non-result: Firefox doesn't always reject executeScript
// when an injected function throws, so we report via the return value instead.
interface InPageDownloadResult {
  ok: boolean;
  error?: string;
}

// Injected into the active tab, so it must be fully self-contained (no imports or
// outer references) to survive serialization — same rule as serializeCurrentDocument.
//
// It builds the blob URL HERE, inside the page, with URL.createObjectURL: Firefox
// treats blob: URLs as same-origin, so the download attribute (hence the filename)
// is honored. A blob URL created in the background page would carry the
// moz-extension origin, be cross-origin to this page, and have its download
// attribute ignored (Firefox would navigate instead) — which is why the bytes are
// shipped in as base64 rather than as a ready-made URL. A data: URL is avoided too:
// in extension contexts it opens a new tab instead of downloading.
//
// Revoke on a timeout: Firefox Android has no downloads.onChanged to signal
// completion, and the blob stays alive in this page's context, so a delay long
// enough for the download manager to read the bytes is safe.
function saveBase64AsDownload(
  base64: string,
  filename: string,
): InPageDownloadResult {
  try {
    if (!document.body) {
      return { ok: false, error: `active document has no <body>` };
    }
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: "application/epub+zip" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Save an ePub by driving the active tab's native download manager, for platforms
 * where browser.downloads.download is absent (Firefox Android). The bytes are
 * handed to the page as base64 because executeScript args are JSON-serializable
 * only, so a Blob/ArrayBuffer cannot cross intact.
 *
 * @example
 *   await downloadEpubViaPage(tabId, epubBlob, "My Article");
 */
export default async function downloadEpubViaPage(
  tabId: number,
  epub: Blob,
  title: string,
): Promise<void> {
  // Deferred imports: webextension-polyfill throws at import time outside an
  // extension, so importing it lazily keeps this module (and its pure helpers)
  // loadable and unit-testable in plain Node. Same pattern as background.ts.
  const [{ default: browser }, { toEpubFilename }] = await Promise.all([
    import("./browser"),
    import("./download_epub"),
  ]);
  const bytes = new Uint8Array(await epub.arrayBuffer());
  const base64 = bytesToBase64(bytes);
  const filename = toEpubFilename(title);
  console.log(
    `[webpage2epub] injecting in-page download into tab ${tabId} (${base64.length} base64 chars) as "${filename}"`,
  );
  const results = await browser.scripting.executeScript({
    target: { tabId },
    func: saveBase64AsDownload,
    args: [base64, filename],
  });
  const result = results[0]?.result as InPageDownloadResult | undefined;
  console.log(
    `[webpage2epub] in-page download result: ${JSON.stringify(result)}`,
  );
  if (!result?.ok) {
    throw new Error(
      `In-page download failed in tab ${tabId}: ${result?.error ?? "no result returned from injected script"}`,
    );
  }
}
