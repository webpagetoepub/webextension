import browser from "../lib/browser";
import registerBackground, { ConvertAndDownload } from "./background_core";
import convertPageToEpub from "../lib/convert_page_to_epub";
import downloadEpub from "../lib/download_epub";
import downloadEpubViaPage, {
  downloadsApiUnavailable,
} from "../lib/download_via_page";

// Firefox entry point (background page). Unlike the Chrome service worker it has
// full DOM + downloads API, so it converts and saves inline here. convert_page_to_epub
// pulls in html2epub, which references DOM globals (DOMParser, XMLSerializer, …)
// in its module body — a plain static import is safe because this bundle is only
// ever loaded into the full-DOM background page, never a worker. (Chrome has its
// own entry, background.chrome.ts, that never imports this, so the dynamic-import
// workaround the shared file once needed is gone.)

// Whether to save via an in-page <a download> click instead of the downloads API.
// Firefox Android (Fenix) is the trigger: its downloads API is either absent OR
// present as a stub that never resolves (Bug 1538348), so a plain feature-check
// isn't enough — if downloads.download exists-but-hangs, downloadEpub would wait
// forever and freeze the conversion on "Converting…". So we treat os === "android"
// as via-page regardless, and still fall back when the API is outright missing.
async function savesEpubViaPage(): Promise<boolean> {
  if (downloadsApiUnavailable(browser.downloads)) {
    return true;
  }
  const { os } = await browser.runtime.getPlatformInfo();
  return os === "android";
}

const convertInlineAndDownload: ConvertAndDownload = async ({
  tabId,
  url,
  html,
}) => {
  console.log("[webpage2epub] converting inline…");
  const { title, epub } = await convertPageToEpub(url, html);
  const viaPage = await savesEpubViaPage();
  console.log(
    `[webpage2epub] epub ready (${epub.size} bytes); saving ${viaPage ? "via page" : "via downloads API"}`,
  );
  if (viaPage) {
    await downloadEpubViaPage(tabId, epub, title);
  } else {
    await downloadEpub(epub, title);
  }
  console.log("[webpage2epub] save complete");
  return title;
};

registerBackground(convertInlineAndDownload);
