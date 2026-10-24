import { timingSafeEqual } from "node:crypto";
import { handleExport, handlePortal, type Runtime } from "../lib/http";
import { publicProjectImage } from "../lib/public-project-image";
import { PortalError } from "../lib/security";

export type BackendEnvironment = {
  APP_ORIGIN?: string;
  PORTAL_PROXY_SECRET?: string;
};
export type BackendDependencies = {
  runtime(request: Request): Promise<Runtime>;
  auth(request: Request): Promise<Response>;
  storage?(request: Request, runtime: Runtime): Promise<Response>;
};
const privateHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "same-origin",
  Vary: "Cookie",
};
function equalSecret(actual: string | null, expected: string | undefined) {
  if (!actual || !expected || expected.length < 32) return false;
  const a = Buffer.from(actual), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Functions have public URLs. Every application request must pass through the
// configured frontend; identity is always derived again from a backend session.
export function trustedProxyRequest(request: Request, env: BackendEnvironment) {
  const origin = env.APP_ORIGIN && new URL(env.APP_ORIGIN);
  if (!origin || origin.origin !== env.APP_ORIGIN || origin.username || origin.password)
    throw new PortalError(503, "BACKEND_ORIGIN_NOT_CONFIGURED");
  if (!equalSecret(request.headers.get("x-portal-proxy-secret"), env.PORTAL_PROXY_SECRET))
    throw new PortalError(403, "UNTRUSTED_PROXY");
  if (request.headers.get("x-portal-forwarded-origin") !== origin.origin)
    throw new PortalError(403, "UNTRUSTED_PROXY_ORIGIN");
  const url = new URL(request.url);
  const external = new URL(url.pathname + url.search, origin);
  const headers = new Headers(request.headers);
  for (const key of [...headers.keys()]) {
    if (key.startsWith("oai-authenticated-") || key.startsWith("x-portal-user-") ||
        ["host", "forwarded", "x-forwarded-host", "x-forwarded-proto"].includes(key)) headers.delete(key);
  }
  return new Request(external, {
    method: request.method,
    headers,
    ...(request.body ? { body: request.body, duplex: "half" } : {}),
    signal: request.signal,
  } as RequestInit);
}

export function backendError(error: unknown) {
  return Response.json(
    { code: error instanceof PortalError ? error.code : "BACKEND_UNAVAILABLE" },
    { status: error instanceof PortalError ? error.status : 503, headers: privateHeaders },
  );
}

export function createPortalBackend(env: BackendEnvironment, dependencies: BackendDependencies) {
  return async (incoming: Request): Promise<Response> => {
    try {
      const request = trustedProxyRequest(incoming, env);
      const path = new URL(request.url).pathname;
      if (path.startsWith("/api/auth/")) return dependencies.auth(request);
      if (path === "/api/health" && request.method === "GET")
        return Response.json({ ok: true, runtime: "neon-functions" }, { headers: privateHeaders });
      const runtime = await dependencies.runtime(request);
      if (path === "/api/portal") return handlePortal(request, runtime);
      if (path === "/api/export" && request.method === "GET") return handleExport(request, runtime);
      if (path.startsWith("/api/storage/") && dependencies.storage)
        return dependencies.storage(request, runtime);
      const image = /^\/api\/project-image\/([^/]+)\/(logo|banner)$/.exec(path);
      if (image && request.method === "GET")
        return publicProjectImage(runtime.db, decodeURIComponent(image[1]), image[2], new URL(request.url).searchParams.get("version"));
      return Response.json({ code: "NOT_FOUND" }, { status: 404, headers: privateHeaders });
    } catch (error) {
      return backendError(error);
    }
  };
}
