// E2E test harness page. It runs INSIDE the loaded extension (extension origin),
// so it exercises the real bundled conversion path and the real cross-origin
// image fetch governed by host_permissions — the same code the popup runs.
//
// Cross-context runtime messaging does not work in Playwright's headless
// extension harness (verified: page<->service worker sendMessage never settles),
// so we cannot drive popup -> background -> offscreen here. Instead the harness
// invokes the same production library functions the background calls, in a real
// extension page, to cover conversion and the chrome.downloads save path.
import convertPageToEpub from "../../src/lib/convert_page_to_epub";
import downloadEpub from "../../src/lib/download_epub";

declare global {
  interface Window {
    convertToEpubBytes: (url: string, html: string) => Promise<number[]>;
    convertAndDownload: (
      url: string,
      html: string,
    ) => Promise<{ downloadId: number; title: string }>;
  }
}

window.convertToEpubBytes = async (url, html) => {
  const { epub } = await convertPageToEpub(url, html);
  const bytes = new Uint8Array(await epub.arrayBuffer());
  // Returned to Node as a plain array because page.evaluate must serialise it.
  return Array.from(bytes);
};

// Runs the real conversion + download_epub.ts path (the whole Firefox flow, and
// the blob -> chrome.downloads half of the Chrome flow).
window.convertAndDownload = async (url, html) => {
  const { title, epub } = await convertPageToEpub(url, html);
  const downloadId = await downloadEpub(epub, title);
  return { downloadId, title };
};
