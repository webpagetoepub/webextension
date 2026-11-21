import browser from "../lib/browser";
import registerBackground, {
  ConvertAndDownload,
  StartConversion,
} from "../background_core";
import convertPageToEpub from "../lib/convert_page_to_epub";
import downloadEpub from "../lib/download_epub";
import downloadEpubViaPage, {
  downloadsApiUnavailable,
} from "./download_via_page";

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

// Firefox-only toolbar wiring (Chrome declares default_popup in its manifest and is
// unaffected). The Firefox manifest omits default_popup because clearing it at
// runtime via setPopup({popup:""}) opens a blank page on Fenix; instead we set it
// here for desktop only, leaving Firefox Android with no popup so action.onClicked
// fires and the tap converts directly — on Fenix that tap is the only UI (no context
// menu, no popup). Pattern from MDN's bookmark-it example and the Mozilla Discourse
// "browserAction popup on Firefox Android" thread.
async function setDesktopPopup(): Promise<void> {
  const { os } = await browser.runtime.getPlatformInfo();
  if (os !== "android") {
    await browser.action.setPopup({ popup: "popup.html" });
  }
}

// No openPopupForProgress on tap: openPopup is a no-op on Android, and the saved file
// landing in Fenix's Downloads menu is the feedback (a notifications toast is avoided —
// unreliable on Android, needs a permission — for a sub-second task).
function registerToolbarTap(startConversion: StartConversion): void {
  browser.action.onClicked.addListener(startConversion);
  void setDesktopPopup();
}

registerToolbarTap(registerBackground(convertInlineAndDownload));
