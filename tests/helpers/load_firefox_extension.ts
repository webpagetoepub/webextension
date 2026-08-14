import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { zipSync } from "fflate";
import { Builder, WebDriver } from "selenium-webdriver";
import firefox from "selenium-webdriver/firefox.js";
import { download } from "geckodriver";
import mergeManifest from "../../scripts/merge_manifest";

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

export interface LoadFirefoxExtensionOptions {
  // Pin the moz-extension:// host UUID so tests can navigate to a known
  // extension page (e.g. moz-extension://<uuid>/harness.html). Firefox otherwise
  // assigns a fresh random UUID per profile, which is unknowable ahead of time.
  uuid?: string;
  // Build the unpacked extension dir to package, overriding the default
  // production `dist/firefox` build. The conversion spec passes the test build
  // (with the harness page) so it can run the real conversion in an extension
  // page; the loads spec leaves it undefined to exercise the shipped build.
  buildExtension?: () => Promise<string>;
  // Extra Firefox prefs (about:config) to set before launch. The conversion
  // spec pins the MV3 base CSP here so the blob-worker block reproduces on any
  // Firefox version, not just ones that still enforce the strict default.
  prefs?: Record<string, string | number | boolean>;
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

// Default build: the shipped Firefox target. Returns the unpacked dist dir.
async function buildProductionFirefox(): Promise<string> {
  execFileSync("npm", ["run", "build:firefox"], { cwd: root, stdio: "pipe" });
  return firefoxDist;
}

// Zip an unpacked extension dir into an unsigned .xpi for temporary install.
async function packXpi(extensionDir: string): Promise<string> {
  const archive = zipSync(await collectFiles(extensionDir));
  const outDir = await mkdtemp(join(tmpdir(), "webpage2epub-xpi-"));
  const xpiPath = join(outDir, "webpage2epub.xpi");
  await writeFile(xpiPath, archive);
  return xpiPath;
}

// Build the Firefox target, launch a headless Firefox via geckodriver, and
// install the build as a temporary add-on. The caller owns driver.quit().
export default async function loadFirefoxExtension(
  options: LoadFirefoxExtensionOptions = {},
): Promise<LoadedFirefoxExtension> {
  const buildExtension = options.buildExtension ?? buildProductionFirefox;
  const xpiPath = await packXpi(await buildExtension());
  const geckodriverPath = await download(
    process.env.GECKODRIVER_VERSION,
    geckodriverCacheDir,
  );

  const firefoxOptions = new firefox.Options().addArguments("-headless");
  for (const [key, value] of Object.entries(options.prefs ?? {})) {
    firefoxOptions.setPreference(key, value);
  }
  // Pin moz-extension://<uuid> for the add-on id so the harness page has a
  // stable URL. The pref must be set before install — Firefox assigns the UUID
  // on first install and reuses the pre-seeded mapping if present.
  if (options.uuid) {
    const { browser_specific_settings } = await mergeManifest("firefox");
    const addonId = (browser_specific_settings as { gecko: { id: string } })
      .gecko.id;
    firefoxOptions.setPreference(
      "extensions.webextensions.uuids",
      JSON.stringify({ [addonId]: options.uuid }),
    );
  }

  // Firefox 138+ blocks WebDriver navigation to "unsafe" URLs (moz-extension://,
  // about:, chrome://) unless system access is explicitly allowed, so
  // driver.get("moz-extension://<uuid>/harness.html") now fails with
  // "Navigation to ... is not allowed in this context". geckodriver 0.36.0+
  // exposes --allow-system-access, which sets RemoteAgent.allowSystemAccess and
  // re-permits navigating to our own extension page. (See
  // remote/marionette/driver.sys.mjs isWebdriverSafeNavigationURL gate.)
  const service = new firefox.ServiceBuilder(geckodriverPath).addArguments(
    "--allow-system-access",
  );
  const driver = await new Builder()
    .forBrowser("firefox")
    .setFirefoxOptions(firefoxOptions)
    .setFirefoxService(service)
    .build();

  const addonId = await (driver as firefox.Driver).installAddon(xpiPath, true);
  return { driver, addonId };
}
