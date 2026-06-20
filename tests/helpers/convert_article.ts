import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { BrowserContext } from "@playwright/test";
import { unzipSync } from "fflate";

const fixturesDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "fixtures",
);

// Runs the real bundled conversion inside the extension's harness page against
// the article fixture (with its <img> pointed at the live fixture server), then
// unzips the resulting EPUB so specs can assert over its entries.
export default async function convertArticle(
  context: BrowserContext,
  extensionId: string,
  imageUrl: string,
): Promise<Record<string, Uint8Array>> {
  const template = await readFile(join(fixturesDir, "article.html"), "utf8");
  const html = template.replace("__IMAGE_URL__", imageUrl);

  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/harness.html`);
  await page.waitForFunction(
    () => typeof window.convertToEpubBytes === "function",
  );

  const bytes = await page.evaluate(
    ([pageUrl, pageHtml]) => window.convertToEpubBytes(pageUrl, pageHtml),
    ["https://example.com/article", html],
  );
  await page.close();

  return unzipSync(new Uint8Array(bytes));
}
