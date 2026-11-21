import { test, expect } from "@playwright/test";
import {
  bytesToBase64,
  downloadsApiUnavailable,
} from "../src/lib/download_via_page";

// Pure helpers behind the Firefox Android download fallback. They carry the ePub
// bytes into the active page (base64, because executeScript args are JSON-only)
// and decide when the downloads API is missing (Fenix, Bug 1538348). The injected
// DOM click itself is verified manually on a device (no Android test harness).

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

test("bytesToBase64 round-trips bytes including values above 0x7F", () => {
  const bytes = new Uint8Array([0, 1, 127, 128, 200, 255]);
  expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
});

test("bytesToBase64 encodes an empty array to an empty string", () => {
  expect(bytesToBase64(new Uint8Array([]))).toBe("");
});

test("bytesToBase64 round-trips a payload larger than one chunk", () => {
  // Exceeds the 0x8000-byte chunk so the String.fromCharCode arg-limit guard
  // (multiple chunks) is exercised, not just a single-shot encode.
  const bytes = new Uint8Array(0x8000 * 2 + 1);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = i % 256;
  }
  expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
});

test("downloadsApiUnavailable is true when the API is absent or non-callable", () => {
  expect(downloadsApiUnavailable(undefined)).toBe(true);
  expect(downloadsApiUnavailable({})).toBe(true);
  expect(downloadsApiUnavailable({ download: 123 })).toBe(true);
});

test("downloadsApiUnavailable is false when download is a function", () => {
  expect(downloadsApiUnavailable({ download: () => undefined })).toBe(false);
});
