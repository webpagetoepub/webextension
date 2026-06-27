import { mkdtemp, copyFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";
import mergeManifest from "../../scripts/merge_manifest";
import fflateMainThreadPlugin from "../../scripts/fflate_main_thread_plugin";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

// esbuild target per browser so the bundle stays within the runtime each build
// loads into. Mirrors the production build scripts and the manifest minimums.
const esbuildTarget: Record<string, string> = {
  chrome: "chrome111",
  firefox: "firefox115",
};

// Builds an unpacked extension into a temp dir for the given target browser: the
// production popup, background and offscreen document, plus a test-only harness
// page (real conversion code) used by the structural specs. On Chrome the real
// background SW also doubles as the id source for context.serviceWorkers().
//
// The Firefox build reuses the same harness page so we can drive the real
// bundled conversion in an extension page under Firefox's MV3 CSP (the env where
// "Promised response from onMessage listener went out of scope" reproduces).
export default async function buildTestExtension(
  browser: string = "chrome",
): Promise<string> {
  const target = esbuildTarget[browser];
  if (!target) {
    throw new Error(
      `Unsupported test build target ${browser}; expected one of ${Object.keys(esbuildTarget).join(", ")}`,
    );
  }
  const outDir = await mkdtemp(join(tmpdir(), "webpage2epub-ext-"));

  await esbuild.build({
    entryPoints: {
      popup: join(root, "src/popup/popup.ts"),
      background: join(root, "src/background/background.ts"),
      offscreen: join(root, "src/offscreen/offscreen.ts"),
      harness: join(root, "tests/harness/harness.ts"),
    },
    bundle: true,
    format: "esm",
    target: [target],
    loader: { ".png": "dataurl" },
    plugins: [fflateMainThreadPlugin()],
    outdir: outDir,
  });

  await copyFile(
    join(root, "src/popup/popup.html"),
    join(outDir, "popup.html"),
  );
  await copyFile(
    join(root, "src/offscreen/offscreen.html"),
    join(outDir, "offscreen.html"),
  );
  await copyFile(
    join(root, "tests/harness/harness.html"),
    join(outDir, "harness.html"),
  );

  const iconsDir = join(root, "src/icons");
  const outIconsDir = join(outDir, "icons");
  await mkdir(outIconsDir, { recursive: true });
  const iconFiles = await readdir(iconsDir);
  await Promise.all(
    iconFiles.map((f) => copyFile(join(iconsDir, f), join(outIconsDir, f))),
  );

  // The merged manifest already declares the background entry (service worker on
  // Chrome, background page on Firefox) and any required permissions — no
  // test-only patching needed.
  const manifest = await mergeManifest(browser);
  await writeFile(
    join(outDir, "manifest.json"),
    JSON.stringify(manifest, null, 2),
  );

  return outDir;
}
