import { test, expect } from "@playwright/test";
import mergeManifest from "../scripts/merge_manifest";

// The page context-menu entry needs the "contextMenus" permission in every
// build. Chrome's manifest fragment replaces the base `permissions` array
// outright (deepMerge swaps arrays, it doesn't union them), so the permission
// must be declared in both fragments — this guards the easy regression of
// dropping it from one of them.
for (const browser of ["chrome", "firefox"] as const) {
  test(`${browser} build requests the contextMenus permission`, async () => {
    const manifest = await mergeManifest(browser);
    expect(manifest.permissions).toContain("contextMenus");
  });
}

// The Firefox build must declare gecko_android or AMO keeps the add-on desktop-only.
// The downloads permission must survive the merge — desktop Firefox and Chrome still
// use downloads.download; only Firefox Android falls back to the in-page save.
test("firefox build is marked Android-compatible and keeps downloads", async () => {
  const manifest = await mergeManifest("firefox");
  const settings = manifest.browser_specific_settings as {
    gecko_android?: unknown;
  };
  expect(settings.gecko_android).toBeTruthy();
  expect(manifest.permissions).toContain("downloads");
});

// Firefox Android's toolbar tap must fire action.onClicked to convert directly,
// and onClicked never fires while a popup is set. So the Firefox manifest must NOT
// declare default_popup (the background sets it at runtime for desktop only);
// Chrome, which has no Android build, keeps the declarative popup. Guards the exact
// regression of re-adding default_popup to the base/Firefox manifest.
test("chrome declares the action popup, firefox does not", async () => {
  const chrome = (await mergeManifest("chrome")).action as {
    default_popup?: unknown;
  };
  const firefox = (await mergeManifest("firefox")).action as {
    default_popup?: unknown;
  };
  expect(chrome.default_popup).toBe("popup.html");
  expect(firefox.default_popup).toBeUndefined();
});
