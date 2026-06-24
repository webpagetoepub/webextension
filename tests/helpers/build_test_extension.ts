import { mkdtemp, copyFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";
import mergeManifest from "../../scripts/merge_manifest";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

// Builds an unpacked Chrome extension into a temp dir: the production popup,
// background service worker and offscreen document, plus a test-only harness page
// (real conversion code) used by the fast structural specs. The real background
// SW also doubles as the id source for context.serviceWorkers().
export default async function buildTestExtension(): Promise<string> {
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
    target: ["chrome111"],
    loader: { ".png": "dataurl" },
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

  // The merged chrome manifest already declares the background service worker
  // and the offscreen permission — no test-only patching needed.
  const manifest = await mergeManifest("chrome");
  await writeFile(
    join(outDir, "manifest.json"),
    JSON.stringify(manifest, null, 2),
  );

  return outDir;
}
