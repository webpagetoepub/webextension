import convertDocumentToEPub from "html2epub";
import { consoleLogger, Logger } from "./logger";

export interface ConvertedEpub {
  title: string;
  epub: Blob;
}

// Image loader handed to html2epub. Runs in the popup (extension origin), so the
// fetch is governed by the extension's host_permissions rather than the page CSP
// — that is what lets cross-origin images (CDNs, other hosts) be embedded.
function fetchImageAsBlob(url: string): Promise<Blob> {
  return fetch(url).then((response) => {
    if (!response.ok) {
      throw new Error(`Image fetch failed for ${url}: HTTP ${response.status}`);
    }
    return response.blob();
  });
}

/**
 * Convert an already-loaded page's HTML into an EPUB blob using html2epub.
 *
 * The single entry point for conversion so both UI and tests share one path
 * (CLAUDE.md: keep html2epub invocation in src/lib/).
 *
 * @example
 *   const { title, epub } = await convertPageToEpub(url, html);
 */
export default function convertPageToEpub(
  url: string,
  html: string,
  logger: Logger = consoleLogger,
): Promise<ConvertedEpub> {
  return convertDocumentToEPub(
    url,
    Promise.resolve(html),
    fetchImageAsBlob,
    () => {},
    () => {},
    logger,
  );
}
