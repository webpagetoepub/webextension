import { rm, mkdir, copyFile, writeFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import * as esbuild from "esbuild";
import mergeManifest from "./merge_manifest";
import fflateMainThreadPlugin from "./fflate_main_thread_plugin";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ALL_BROWSERS = ["chrome", "firefox"] as const;
type Browser = (typeof ALL_BROWSERS)[number];

// esbuild targets per browser. html2epub ships raw TS and imports a .png as a
// data URL (node_modules/html2epub/src/load_images.ts), so we transpile deps and
// map .png -> dataurl. Output is ESM because the HTML pages and the (module-type)
// background load their scripts as modules.
function buildTargets(browser: Browser): string[] {
  return browser === "firefox" ? ["firefox115"] : ["chrome111"];
}

// All extension entry points. background runs on both browsers (Chrome service
// worker / Firefox background page); offscreen is Chrome-only and gated out of
// the Firefox build, which never references it (no manifest entry, inline path).
function entryPoints(browser: Browser): Record<string, string> {
  const entries: Record<string, string> = {
    popup: join(root, "src/popup/popup.ts"),
    background: join(root, "src/background/background.ts"),
  };
  if (browser === "chrome") {
    entries.offscreen = join(root, "src/offscreen/offscreen.ts");
  }
  return entries;
}

async function bundleEntryPoints(
  browser: Browser,
  outDir: string,
): Promise<void> {
  await esbuild.build({
    entryPoints: entryPoints(browser),
    bundle: true,
    // Split shared deps (html2epub, fflate, the polyfill) into chunk files so
    // they are stored once instead of being inlined into every entry point.
    // Works because all entries load as ESM modules: Chrome's service_worker and
    // Firefox's background.scripts are both manifest "type": "module", and the
    // HTML pages load their scripts as modules.
    splitting: true,
    format: "esm",
    target: buildTargets(browser),
    loader: { ".png": "dataurl" },
    plugins: [fflateMainThreadPlugin()],
    outdir: outDir,
    logLevel: "info",
  });
}

async function copyIcons(outDir: string): Promise<void> {
  const iconsDir = join(root, "src/icons");
  const outIconsDir = join(outDir, "icons");
  await mkdir(outIconsDir, { recursive: true });
  const files = await readdir(iconsDir);
  await Promise.all(
    files.map((f) => copyFile(join(iconsDir, f), join(outIconsDir, f))),
  );
}

async function buildBrowser(browser: Browser): Promise<void> {
  const outDir = join(root, "dist", browser);
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  await bundleEntryPoints(browser, outDir);
  await copyFile(
    join(root, "src/popup/popup.html"),
    join(outDir, "popup.html"),
  );
  // offscreen.html hosts the Chrome-only offscreen document; Firefox never loads
  // it, so it is gated out of the Firefox build alongside its bundle.
  if (browser === "chrome") {
    await copyFile(
      join(root, "src/offscreen/offscreen.html"),
      join(outDir, "offscreen.html"),
    );
  }
  await copyIcons(outDir);

  const manifest = await mergeManifest(browser);
  await writeFile(
    join(outDir, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );

  console.log(`Built dist/${browser}`);
}

const requested = process.argv[2];
const browsers: Browser[] = requested
  ? [requested as Browser]
  : [...ALL_BROWSERS];
if (requested && !(ALL_BROWSERS as readonly string[]).includes(requested)) {
  throw new Error(
    `Unknown browser "${requested}"; expected one of ${ALL_BROWSERS.join(", ")}`,
  );
}

await Promise.all(browsers.map(buildBrowser));
