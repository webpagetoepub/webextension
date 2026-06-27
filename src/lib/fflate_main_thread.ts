// Drop-in fflate replacement that zips on the main thread instead of in a Worker.
//
// WHY: html2epub -> jepub calls fflate's async `zip()`. For any archive member
// >= 160 KB, fflate offloads deflation to a Web Worker created from a blob: URL
// (`new Worker(URL.createObjectURL(new Blob([code])))`, fflate esm/browser.js).
// Firefox's Manifest V3 extension CSP only permits 'self'/'none'/'wasm-unsafe-eval'
// for script-src/worker-src — blob: (and eval) are forbidden and cannot be
// allowlisted in the manifest. So that worker is blocked, its callback never
// fires, and the conversion promise hangs forever; the user sees "Promised
// response from onMessage listener went out of scope". Small pages happened to
// work only because every member stayed under the 160 KB worker threshold.
//
// Routing through `zipSync` keeps all deflation in statically-bundled main-thread
// code (no blob worker, no eval), which is CSP-safe. The output archive is byte
// -for-byte the same; we only trade off-main-thread compression (irrelevant in
// the background context, where the popup has already closed).
//
// Wired in at build time: scripts/fflate_main_thread_plugin.ts resolves bare
// `fflate` imports (i.e. jepub's) to this module. This module pulls the real
// implementation from the `fflate/browser` subpath, which the plugin leaves
// untouched, so `zipSync` and everything re-exported below are genuine fflate.
import {
  zipSync,
  AsyncZippable,
  AsyncZipOptions,
  AsyncTerminable,
  FlateCallback,
  FlateError,
  Zippable,
  ZipOptions,
} from "fflate/browser";

export * from "fflate/browser";

// Mirrors fflate's async `zip` overloads so this is a true drop-in, but resolves
// synchronously via zipSync. The returned terminator is a no-op: synchronous
// work has already finished by the time the caller could abort it.
export function zip(data: AsyncZippable, cb: FlateCallback): AsyncTerminable;
export function zip(
  data: AsyncZippable,
  opts: AsyncZipOptions,
  cb: FlateCallback,
): AsyncTerminable;
export function zip(
  data: AsyncZippable,
  optsOrCb: AsyncZipOptions | FlateCallback,
  maybeCb?: FlateCallback,
): AsyncTerminable {
  const callback = typeof optsOrCb === "function" ? optsOrCb : maybeCb;
  if (!callback) {
    throw new Error(
      `fflate zip() requires a callback; got opts=${typeof optsOrCb}, cb=${typeof maybeCb}`,
    );
  }
  // AsyncZipOptions only adds worker knobs on top of ZipOptions, all ignored by
  // the synchronous path, so narrowing to ZipOptions is safe.
  const options: ZipOptions = typeof optsOrCb === "function" ? {} : optsOrCb;

  try {
    callback(null, zipSync(data as unknown as Zippable, options));
  } catch (error) {
    callback(error as FlateError, new Uint8Array(0));
  }
  return () => {};
}
