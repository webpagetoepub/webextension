import { mkdtemp, copyFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";
// @ts-expect-error - plain .mjs build helper without type declarations
import mergeManifest from "../../scripts/merge_manifest.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

// Builds an unpacked Chrome extension into a temp dir: the production popup plus
// a test-only harness page (real conversion code) and a trivial background
// service worker. The background SW exists solely so Playwright can read the
// extension id from context.serviceWorkers(); production ships no background.
export default async function buildTestExtension(): Promise<string> {
  const outDir = await mkdtemp(join(tmpdir(), "webpage2epub-ext-"));

  await esbuild.build({
    entryPoints: {
      popup: join(root, "src/popup/popup.ts"),
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
    join(root, "tests/harness/harness.html"),
    join(outDir, "harness.html"),
  );
  await writeFile(join(outDir, "background.js"), "// id-discovery only\n");

  const manifest = await mergeManifest("chrome");
  manifest.background = { service_worker: "background.js" };
  await writeFile(
    join(outDir, "manifest.json"),
    JSON.stringify(manifest, null, 2),
  );

  return outDir;
}
