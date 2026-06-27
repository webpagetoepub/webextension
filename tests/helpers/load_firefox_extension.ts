import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { zipSync } from "fflate";
import { Builder, WebDriver } from "selenium-webdriver";
import firefox from "selenium-webdriver/firefox.js";
import { download } from "geckodriver";

// Firefox extension coverage. Playwright can only load unpacked extensions in
// Chromium (see launch_extension.ts), so the Firefox build is exercised through
// geckodriver instead: geckodriver speaks the Marionette protocol to a real
// Firefox, and installAddon(..., temporary=true) is the same temporary-install
// path `web-ext run` uses, which bypasses add-on signing for unsigned MV3 zips.

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const firefoxDist = join(root, "dist", "firefox");

// geckodriver's download() caches by binary path and skips the network when the
// file already exists, but it defaults to os.tmpdir(), which gets wiped on
// reboot/tmp cleanup — forcing a re-download. Pin the cache to a persistent,
// git-ignored project dir so the binary is fetched once and reused. Override
// with GECKODRIVER_CACHE_DIR (e.g. a warm cache on CI).
const geckodriverCacheDir =
  process.env.GECKODRIVER_CACHE_DIR ||
  join(root, "node_modules", ".cache", "geckodriver");

export interface LoadedFirefoxExtension {
  driver: WebDriver;
  // The add-on id Firefox reports after install. For a temporary install this
  // is browser_specific_settings.gecko.id from the merged manifest, so matching
  // it proves Firefox parsed and accepted the manifest we shipped.
  addonId: string;
}

// Recursively read a built extension dir into the flat { "path/in/zip": bytes }
// map fflate expects, normalising separators to the forward slashes a zip uses.
async function collectFiles(
  dir: string,
  base: string = dir,
): Promise<Record<string, Uint8Array>> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: Record<string, Uint8Array> = {};
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      Object.assign(files, await collectFiles(full, base));
    } else {
      const zipPath = relative(base, full).split(sep).join("/");
      files[zipPath] = new Uint8Array(await readFile(full));
    }
  }
  return files;
}

async function packFirefoxXpi(): Promise<string> {
  execFileSync("npm", ["run", "build:firefox"], { cwd: root, stdio: "pipe" });
  const archive = zipSync(await collectFiles(firefoxDist));
  const outDir = await mkdtemp(join(tmpdir(), "webpage2epub-xpi-"));
  const xpiPath = join(outDir, "webpage2epub.xpi");
  await writeFile(xpiPath, archive);
  return xpiPath;
}

// Build the Firefox target, launch a headless Firefox via geckodriver, and
// install the build as a temporary add-on. The caller owns driver.quit().
export default async function loadFirefoxExtension(): Promise<LoadedFirefoxExtension> {
  const xpiPath = await packFirefoxXpi();
  const geckodriverPath = await download(
    process.env.GECKODRIVER_VERSION,
    geckodriverCacheDir,
  );

  const options = new firefox.Options().addArguments("-headless");
  const service = new firefox.ServiceBuilder(geckodriverPath);
  const driver = await new Builder()
    .forBrowser("firefox")
    .setFirefoxOptions(options)
    .setFirefoxService(service)
    .build();

  const addonId = await (driver as firefox.Driver).installAddon(xpiPath, true);
  return { driver, addonId };
}
