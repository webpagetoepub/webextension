import { test, expect } from "@playwright/test";
import statusView from "../src/popup/status_view";

// statusView is the pure mapping behind the popup's progress message, exercised
// for the context-menu flow where the popup must reflect a conversion it did not
// start. Each conversion state maps to specific text and button/error styling.

test("idle shows nothing and leaves the button enabled", () => {
  expect(statusView({ state: "idle" })).toEqual({
    text: "",
    isError: false,
    busy: false,
  });
});

test("converting with a title names the page and busies the button", () => {
  expect(statusView({ state: "converting", title: "My Page" })).toEqual({
    text: "Converting “My Page” to ePub…",
    isError: false,
    busy: true,
  });
});

test("converting without a title falls back to a generic message", () => {
  expect(statusView({ state: "converting" })).toEqual({
    text: "Converting to ePub…",
    isError: false,
    busy: true,
  });
});

test("done reports the saved title and re-enables the button", () => {
  expect(statusView({ state: "done", title: "My Page" })).toEqual({
    text: "Saved “My Page”.",
    isError: false,
    busy: false,
  });
});

test("error surfaces the message with error styling", () => {
  expect(statusView({ state: "error", message: "boom" })).toEqual({
    text: "boom",
    isError: true,
    busy: false,
  });
});
