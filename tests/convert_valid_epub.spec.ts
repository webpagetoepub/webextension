import { test, expect } from "@playwright/test";
import { strFromU8 } from "fflate";
import launchExtension from "./helpers/launch_extension";
import startFixtureServer, { FixtureServer } from "./helpers/serve_fixture";
import convertArticle from "./helpers/convert_article";
import { LoadedExtension } from "./helpers/launch_extension";

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

test("produces a structurally valid EPUB", async () => {
  const files = await convertArticle(
    extension.context,
    extension.extensionId,
    server.imageUrl,
  );
  const names = Object.keys(files);

  // mimetype must exist, be exactly "application/epub+zip".
  expect(names).toContain("mimetype");
  expect(strFromU8(files["mimetype"])).toBe("application/epub+zip");

  // container.xml must exist and point at the OPF package document.
  expect(names).toContain("META-INF/container.xml");
  const container = strFromU8(files["META-INF/container.xml"]);
  const opfMatch = /full-path="([^"]+\.opf)"/.exec(container);
  expect(
    opfMatch,
    `container.xml should reference an .opf: ${container}`,
  ).not.toBeNull();
  expect(names).toContain(opfMatch![1]);

  // At least one chapter document must be present.
  const chapters = names.filter((name) => /^OEBPS\/page-\d+\.html$/.test(name));
  expect(chapters.length).toBeGreaterThan(0);
});
