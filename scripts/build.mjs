import { rm, mkdir, copyFile, writeFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import * as esbuild from "esbuild";
import mergeManifest from "./merge_manifest.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ALL_BROWSERS = ["chrome", "firefox"];

// esbuild targets per browser. html2epub ships raw TS and imports a .png as a
// data URL (node_modules/html2epub/src/load_images.ts), so we transpile deps and
// map .png -> dataurl. Output is ESM because popup.html loads popup.js as a module.
function buildTargets(browser) {
  return browser === "firefox" ? ["firefox115"] : ["chrome111"];
}

async function bundlePopup(browser, outDir) {
  await esbuild.build({
    entryPoints: [join(root, "src/popup/popup.ts")],
    bundle: true,
    format: "esm",
    target: buildTargets(browser),
    loader: { ".png": "dataurl" },
    outfile: join(outDir, "popup.js"),
    logLevel: "info",
  });
}

async function copyIcons(outDir) {
  const iconsDir = join(root, "src/icons");
  const outIconsDir = join(outDir, "icons");
  await mkdir(outIconsDir, { recursive: true });
  const files = await readdir(iconsDir);
  await Promise.all(
    files.map((f) => copyFile(join(iconsDir, f), join(outIconsDir, f))),
  );
}

async function buildBrowser(browser) {
  const outDir = join(root, "dist", browser);
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  await bundlePopup(browser, outDir);
  await copyFile(
    join(root, "src/popup/popup.html"),
    join(outDir, "popup.html"),
  );
  await copyIcons(outDir);

  const manifest = await mergeManifest(browser);
  await writeFile(
    join(outDir, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );

  console.log(`Built dist/${browser}`);
}

const requested = process.argv[2];
const browsers = requested ? [requested] : ALL_BROWSERS;
if (requested && !ALL_BROWSERS.includes(requested)) {
  throw new Error(
    `Unknown browser "${requested}"; expected one of ${ALL_BROWSERS.join(", ")}`,
  );
}

await Promise.all(browsers.map(buildBrowser));
