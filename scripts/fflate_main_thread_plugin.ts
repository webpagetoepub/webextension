import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "esbuild";

const wrapperPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "src",
  "lib",
  "fflate_main_thread.ts",
);

// Redirect bare `fflate` imports (jepub's, reached via html2epub) to our
// main-thread wrapper, so conversion never spawns fflate's CSP-blocked blob:
// Worker on Firefox MV3. The filter is anchored to the exact specifier so the
// wrapper's own `fflate/browser` import resolves to the real package — see
// src/lib/fflate_main_thread.ts for the full rationale.
export default function fflateMainThreadPlugin(): Plugin {
  return {
    name: "fflate-main-thread",
    setup(build) {
      build.onResolve({ filter: /^fflate$/ }, () => ({ path: wrapperPath }));
    },
  };
}
