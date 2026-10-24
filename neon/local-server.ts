import { createServer } from "node:http";
import { localRuntime } from "../lib/local-test/runtime";
import { handlePortal, handleExport } from "../lib/http";
import { publicProjectImage } from "../lib/public-project-image";
import { backendError } from "./router";

// This process is a disposable synthetic rehearsal, never a deployed Function.
if (process.env.NODE_ENV === "production" || process.env.PORTAL_LOCAL_TEST !== "1")
  throw new Error("SYNTHETIC_BACKEND_REQUIRES_EXPLICIT_LOCAL_MODE");
const listenPort = Number(process.env.PORTAL_LOCAL_API_PORT || 8788);
const browserOrigin = process.env.APP_ORIGIN || "http://localhost:3000";
const allowed = new URL(browserOrigin);
if (!["localhost", "127.0.0.1", "[::1]"].includes(allowed.hostname))
  throw new Error("SYNTHETIC_BACKEND_LOCAL_ORIGIN_ONLY");

createServer(async (input, output) => {
  try {
    const host = input.headers.host || "";
    if (!/^(127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(host))
      throw new Error("LOCAL_HOST_REQUIRED");
    const headers = new Headers();
    for (const [name, values] of Object.entries(input.headers)) {
      if (values == null) continue;
      if (Array.isArray(values)) values.forEach(value => headers.append(name, value));
      else headers.set(name, values);
    }
    const chunks: Buffer[] = [];
    let bytes = 0;
    for await (const chunk of input) {
      bytes += chunk.length;
      if (bytes > 650_000) throw new Error("BODY_TOO_LARGE");
      chunks.push(Buffer.from(chunk));
    }
    const method = input.method || "GET";
    const source = new URL(input.url || "/", `http://${host}`);
    // localRuntime accepts loopback only; the service mutation origin is the
    // public local frontend, matching the same-origin production proxy shape.
    const localRequest = new Request(source, { method, headers,
      ...(!["GET", "HEAD"].includes(method) ? { body: Buffer.concat(chunks) } : {}) });
    const runtime = await localRuntime(localRequest);
    const request = new Request(new URL(source.pathname + source.search, browserOrigin), {
      method, headers, ...(!["GET", "HEAD"].includes(method) ? { body: Buffer.concat(chunks) } : {}),
    });
    let response: Response;
    if (source.pathname === "/api/auth/session") {
      const user = runtime.identity;
      response = Response.json({ user: user ? { id: user.id, email: user.email, name: user.name, emailVerified: true } : null });
    } else if (source.pathname === "/api/portal") response = await handlePortal(request, runtime);
    else if (source.pathname === "/api/export") response = await handleExport(request, runtime);
    else if (source.pathname === "/api/health") response = Response.json({ ok: true, runtime: "synthetic-local" });
    else {
      const match = /^\/api\/project-image\/([^/]+)\/(logo|banner)$/.exec(source.pathname);
      response = match ? await publicProjectImage(runtime.db, decodeURIComponent(match[1]), match[2], source.searchParams.get("version")) : new Response(null, { status: 404 });
    }
    output.statusCode = response.status;
    response.headers.forEach((value, name) => {
      if (name.toLowerCase() !== "set-cookie") output.setHeader(name, value);
    });
    const cookies = response.headers.getSetCookie();
    if (cookies.length) output.setHeader("set-cookie", cookies);
    output.setHeader("cache-control", "private, no-store");
    output.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    const response = backendError(error);
    output.writeHead(response.status, Object.fromEntries(response.headers));
    output.end(await response.text());
  }
}).listen(listenPort, "127.0.0.1", () => {
  console.log(`Synthetic backend ready at http://127.0.0.1:${listenPort}`);
});
