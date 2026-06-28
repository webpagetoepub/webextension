import { test, expect } from "@playwright/test";
import loadFirefoxExtension, {
  LoadedFirefoxExtension,
} from "./helpers/load_firefox_extension";

// Smoke coverage for the Firefox build: it must install into a real Firefox.
// This only guarantees the manifest + bundled scripts load as an add-on, which
// Playwright cannot check because it loads extensions in Chromium only;
// conversion itself is covered by firefox_converts_page.spec.ts. Driving Firefox
// needs geckodriver, so building + launching is slow.
test.describe.configure({ timeout: 120_000 });

let extension: LoadedFirefoxExtension;

test.afterAll(async () => {
  await extension?.driver.quit();
});

test("installs the Firefox build as a temporary add-on", async () => {
  extension = await loadFirefoxExtension();

  // installAddon resolves with the add-on id only after Firefox has accepted
  // the manifest; a malformed manifest or bad bundle rejects the install. The
  // id is browser_specific_settings.gecko.id from manifest.firefox.json.
  expect(extension.addonId).toBe("webpage2epub@webpagetoepub.github.io");
});
