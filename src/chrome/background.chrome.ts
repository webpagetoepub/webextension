import registerBackground, { ConvertAndDownload } from "../background_core";
import { downloadFromBlobUrl } from "../lib/download_epub";
import convertViaOffscreen, {
  closeOffscreenDocument,
} from "./convert_via_offscreen";

// Chrome entry point (MV3 service worker). The worker has no DOM, so html2epub
// runs in an offscreen document: it converts and creates the blob URL, then the
// worker triggers the download and closes the document once the download settles.
// This module imports only the offscreen path, never convert_page_to_epub, so the
// worker bundle stays DOM-free and registers cleanly (service_worker_registers.spec.ts).
const convertInOffscreenAndDownload: ConvertAndDownload = async ({
  url,
  html,
}) => {
  const { blobUrl, title } = await convertViaOffscreen(url, html);
  await downloadFromBlobUrl(blobUrl, title, () => {
    void closeOffscreenDocument();
  });
  return title;
};

registerBackground(convertInOffscreenAndDownload);
