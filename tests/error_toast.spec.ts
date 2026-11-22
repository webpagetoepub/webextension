import { test, expect, chromium, Browser, Page } from "@playwright/test";
import {
  ERROR_TOAST_MESSAGE,
  showErrorToast,
} from "../src/firefox/notify_error_in_page";
import reportConversionError from "../src/lib/report_conversion_error";
import { ConversionStatus } from "../src/lib/messages";

// Coverage for the Firefox Android failure toast. showErrorToast is the
// self-contained function injected into the active tab, so it's exercised in a
// real Chromium page (it touches document/window). The notify wrapper and the
// Android gate (getPlatformInfo) are verified manually on a device — geckodriver
// drives desktop Firefox and can't fake os === "android" (see CLAUDE.md). The
// background wiring is covered by the pure reportConversionError tests below.

const TOAST_SELECTOR = "#webpage2epub-error-toast";

// channel:'chromium' selects the installed Chromium (same as launch_extension.ts);
// the default `page` fixture needs the bundled headless-shell, which the project
// doesn't install.
let browser: Browser;

test.beforeAll(async () => {
  browser = await chromium.launch({ channel: "chromium", headless: true });
});

test.afterAll(async () => {
  await browser.close();
});

async function blankPage(): Promise<Page> {
  const page = await browser.newPage();
  await page.setContent("<body></body>");
  return page;
}

test("showErrorToast injects a single toast bearing the message", async () => {
  const page = await blankPage();
  await page.evaluate(showErrorToast, ERROR_TOAST_MESSAGE);

  const toast = page.locator(TOAST_SELECTOR);
  await expect(toast).toHaveCount(1);
  await expect(toast).toHaveText(ERROR_TOAST_MESSAGE);
  // Maxed z-index so page CSS can't bury it.
  await expect(toast).toHaveCSS("z-index", "2147483647");
});

test("a second toast replaces the first instead of stacking", async () => {
  const page = await blankPage();
  await page.evaluate(showErrorToast, "first");
  await page.evaluate(showErrorToast, "second");

  const toast = page.locator(TOAST_SELECTOR);
  await expect(toast).toHaveCount(1);
  await expect(toast).toHaveText("second");
});

test("tapping the toast dismisses it", async () => {
  const page = await blankPage();
  await page.evaluate(showErrorToast, ERROR_TOAST_MESSAGE);

  await page.locator(TOAST_SELECTOR).click();
  await expect(page.locator(TOAST_SELECTOR)).toHaveCount(0);
});

test("the toast auto-dismisses after the timeout", async () => {
  const page = await browser.newPage();
  await page.clock.install();
  await page.setContent("<body></body>");
  await page.evaluate(showErrorToast, ERROR_TOAST_MESSAGE);
  await expect(page.locator(TOAST_SELECTOR)).toHaveCount(1);

  await page.clock.fastForward(6000);
  await expect(page.locator(TOAST_SELECTOR)).toHaveCount(0);
});

// Named fakes (not inline stubs) per CLAUDE.md: record what the background's error
// path hands to each collaborator so we can assert on both.
class PublishedStatuses {
  readonly statuses: ConversionStatus[] = [];
  readonly publish = (status: ConversionStatus): void => {
    this.statuses.push(status);
  };
}

class ErrorNotifierSpy {
  readonly messages: string[] = [];
  readonly notify = (message: string): void => {
    this.messages.push(message);
  };
}

test("reportConversionError publishes the error and notifies with the message", () => {
  const published = new PublishedStatuses();
  const notifier = new ErrorNotifierSpy();

  reportConversionError(new Error("boom"), published.publish, notifier.notify);

  expect(published.statuses).toEqual([{ state: "error", message: "boom" }]);
  expect(notifier.messages).toEqual(["boom"]);
});

test("reportConversionError stringifies a non-Error thrown value", () => {
  const published = new PublishedStatuses();
  const notifier = new ErrorNotifierSpy();

  reportConversionError("plain string", published.publish, notifier.notify);

  expect(published.statuses).toEqual([
    { state: "error", message: "plain string" },
  ]);
  expect(notifier.messages).toEqual(["plain string"]);
});

test("reportConversionError still publishes when no notifier is given (Chrome)", () => {
  const published = new PublishedStatuses();

  expect(() =>
    reportConversionError(new Error("boom"), published.publish),
  ).not.toThrow();
  expect(published.statuses).toEqual([{ state: "error", message: "boom" }]);
});
