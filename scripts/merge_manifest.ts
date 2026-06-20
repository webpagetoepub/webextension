import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

type JsonValue = string | number | boolean | null | JsonValue[] | JsonObject;
type JsonObject = { [key: string]: JsonValue };

const manifestDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "src",
  "manifest",
);

function isPlainObject(value: JsonValue): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Deep-merge browser overrides onto the base manifest. Objects merge recursively;
// arrays and scalars from the override replace the base value outright.
function deepMerge(base: JsonValue, override: JsonValue): JsonValue {
  if (!isPlainObject(base) || !isPlainObject(override)) {
    return override;
  }
  const merged: JsonObject = { ...base };
  for (const [key, value] of Object.entries(override)) {
    merged[key] = key in base ? deepMerge(base[key], value) : value;
  }
  return merged;
}

async function readJson(name: string): Promise<JsonValue> {
  return JSON.parse(
    await readFile(join(manifestDir, name), "utf8"),
  ) as JsonValue;
}

/** Build the final manifest object for a target browser ('chrome' | 'firefox'). */
export default async function mergeManifest(
  browser: string,
): Promise<JsonObject> {
  const base = await readJson("manifest.base.json");
  const override = await readJson(`manifest.${browser}.json`);
  return deepMerge(base, override) as JsonObject;
}
