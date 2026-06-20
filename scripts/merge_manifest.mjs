import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const manifestDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "src",
  "manifest",
);

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Deep-merge browser overrides onto the base manifest. Objects merge recursively;
// arrays and scalars from the override replace the base value outright.
function deepMerge(base, override) {
  if (!isPlainObject(base) || !isPlainObject(override)) {
    return override;
  }
  const merged = { ...base };
  for (const [key, value] of Object.entries(override)) {
    merged[key] = key in base ? deepMerge(base[key], value) : value;
  }
  return merged;
}

async function readJson(name) {
  return JSON.parse(await readFile(join(manifestDir, name), "utf8"));
}

/** Build the final manifest object for a target browser ('chrome' | 'firefox'). */
export default async function mergeManifest(browser) {
  const base = await readJson("manifest.base.json");
  const override = await readJson(`manifest.${browser}.json`);
  return deepMerge(base, override);
}
