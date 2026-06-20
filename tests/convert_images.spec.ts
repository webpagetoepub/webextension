import { test, expect } from "@playwright/test";
import { strFromU8 } from "fflate";
import launchExtension, { LoadedExtension } from "./helpers/launch_extension";
import startFixtureServer, { FixtureServer } from "./helpers/serve_fixture";
import convertArticle from "./helpers/convert_article";

let extension: LoadedExtension;
let server: FixtureServer;

test.beforeAll(async () => {
  extension = await launchExtension();
  server = await startFixtureServer();
});

test.afterAll(async () => {
  await extension.context.close();
  await server.close();
});

test("embeds the page image as an EPUB asset referenced by a chapter", async () => {
  const files = await convertArticle(
    extension.context,
    extension.extensionId,
    server.imageUrl,
  );
  const names = Object.keys(files);

  // The fetched image is stored as an asset.
  const assets = names.filter((name) => name.startsWith("OEBPS/assets/"));
  expect(
    assets.length,
    `expected an OEBPS/assets/* image: ${JSON.stringify(names)}`,
  ).toBeGreaterThan(0);

  // A chapter references an image whose src resolves to a stored asset.
  const chapterName = names.find(
    (name) =>
      /^OEBPS\/page-\d+\.html$/.test(name) &&
      strFromU8(files[name]).includes("<img"),
  );
  expect(chapterName, "expected a chapter containing an <img>").toBeDefined();

  const chapterHtml = strFromU8(files[chapterName!]);
  const srcMatch = /<img[^>]*\ssrc="([^"]+)"/.exec(chapterHtml);
  expect(srcMatch, `expected an <img src> in: ${chapterHtml}`).not.toBeNull();

  const resolvedAssetPath = `OEBPS/${srcMatch![1].replace(/^\.\//, "")}`;
  expect(assets).toContain(resolvedAssetPath);

  // Guard: the asset is the real image, not html2epub's no-image placeholder.
  expect(resolvedAssetPath).not.toContain("no-image");
});
