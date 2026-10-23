// Isolated static visual preview only. Never imported by application code.
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
const port = Number(process.env.DELHI_PREVIEW_PORT || 4192);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error("Invalid local port");
const assets = new Set([
  "text-mask-alpha.png",
  "delhi-fill-overscan.png",
  "metro-static.png",
]);
const server = createServer((request, response) => {
  const url = new URL(request.url, "http://127.0.0.1");
  if (request.method !== "GET") {
    response.writeHead(405);
    response.end();
    return;
  }
  if (url.pathname === "/") {
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end(readFileSync("previews/new-delhi-variants/index.html"));
    return;
  }
  const asset = url.pathname.slice("/art/".length);
  if (url.pathname.startsWith("/art/") && assets.has(asset)) {
    response.setHeader("content-type", "image/png");
    response.end(readFileSync("public/art/delhi-v3/" + asset));
    return;
  }
  response.writeHead(404);
  response.end();
});
server.listen(port, "127.0.0.1", () =>
  console.log("Delhi preview ready http://127.0.0.1:" + port),
);
process.on("SIGTERM", () => server.close(() => process.exit(0)));
