// E2E test harness page. It runs INSIDE the loaded extension (extension origin),
// so it exercises the real bundled conversion path and the real cross-origin
// image fetch governed by host_permissions — the same code the popup runs.
import convertPageToEpub from "../../src/lib/convert_page_to_epub";

declare global {
  interface Window {
    convertToEpubBytes: (url: string, html: string) => Promise<number[]>;
  }
}

window.convertToEpubBytes = async (url, html) => {
  const { epub } = await convertPageToEpub(url, html);
  const bytes = new Uint8Array(await epub.arrayBuffer());
  // Returned to Node as a plain array because page.evaluate must serialise it.
  return Array.from(bytes);
};
