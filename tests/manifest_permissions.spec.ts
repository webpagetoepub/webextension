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
