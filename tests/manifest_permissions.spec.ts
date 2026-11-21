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
