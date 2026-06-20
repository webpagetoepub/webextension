import { createServer, Server } from "node:http";
import { AddressInfo } from "node:net";
import { PNG_BYTES } from "./png_fixture";

export interface FixtureServer {
  imageUrl: string;
  close: () => Promise<void>;
}

// Serves the test PNG over real HTTP so the extension fetches a cross-origin
// image through host_permissions, exactly as it would on a live page. The 404
// path lets a test assert the no-image fallback behaviour if needed.
export default async function startFixtureServer(): Promise<FixtureServer> {
  const server: Server = createServer((request, response) => {
    if (request.url === "/photo.png") {
      response.writeHead(200, { "content-type": "image/png" });
      response.end(Buffer.from(PNG_BYTES));
      return;
    }
    response.writeHead(404).end();
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;

  return {
    imageUrl: `http://127.0.0.1:${port}/photo.png`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
