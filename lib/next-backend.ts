import { cache } from "react";
import { headers } from "next/headers";

export type BackendView = Record<string, any>;
export type BackendUser = {
  userId: string;
  displayName: string;
  email: string;
  fullName: string | null;
};
export type BackendViewOptions = {
  search?: string;
  page?: number;
  focus?: string;
};

export class BackendError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message = code,
  ) {
    super(message);
    this.name = "BackendError";
  }
}

const defaultAppOrigin = "https://dddhack-portal.itsparam.in";
const localhost = new Set(["localhost", "127.0.0.1", "[::1]"]);
const safeMethods = new Set(["GET", "HEAD"]);
const forwardedHeaders = [
  "accept",
  "accept-language",
  "content-type",
  "cookie",
  "origin",
  "range",
  "if-none-match",
  "if-modified-since",
] as const;
const hopHeaders = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "content-encoding",
  "content-length",
]);

function exactOrigin(value: string, code: string) {
  try {
    const url = new URL(value);
    if (
      url.origin !== value ||
      url.username ||
      url.password ||
      !["http:", "https:"].includes(url.protocol)
    )
      throw new Error();
    return url;
  } catch {
    throw new BackendError(503, code);
  }
}

export function protectedPath(path: string) {
  return /^\/(dashboard|admin|judge|teams|profile|submission|review|rules|project-history|discover)(\/|$)/.test(
    path,
  );
}

// Synthetic fixtures live in the separate local backend, outside the Next graph.
export function isLocalDevelopmentRequest(request: Request) {
  return (
    process.env.NODE_ENV === "development" &&
    process.env.PORTAL_LOCAL_TEST === "1" &&
    localhost.has(new URL(request.url).hostname)
  );
}

function backendConfiguration(request: Request) {
  const local = isLocalDevelopmentRequest(request);
  if (process.env.PORTAL_LOCAL_TEST === "1" && !local)
    throw new BackendError(503, "LOCAL_ADAPTER_DISABLED");
  const app = exactOrigin(
    local
      ? new URL(request.url).origin
      : process.env.APP_ORIGIN || defaultAppOrigin,
    "APP_ORIGIN_INVALID",
  );
  if (!local && app.protocol !== "https:")
    throw new BackendError(503, "APP_ORIGIN_INVALID");
  if (new URL(request.url).origin !== app.origin)
    throw new BackendError(403, "ORIGIN_NOT_ALLOWED");
  const backend = exactOrigin(
    process.env.NEON_API_ORIGIN || "",
    "NEON_API_ORIGIN_NOT_CONFIGURED",
  );
  if (
    backend.origin === app.origin ||
    (backend.protocol !== "https:" &&
      !(local && localhost.has(backend.hostname))) ||
    (!local && localhost.has(backend.hostname))
  )
    throw new BackendError(503, "NEON_API_ORIGIN_INVALID");
  const secret = process.env.PORTAL_PROXY_SECRET;
  if (!secret || secret.length < 32 || /[\r\n]/.test(secret))
    throw new BackendError(503, "PORTAL_PROXY_NOT_CONFIGURED");
  return { app, backend, secret };
}

function failure(error: unknown) {
  const known = error instanceof BackendError;
  return Response.json(
    {
      code: known ? error.code : "BACKEND_UNAVAILABLE",
      message: known
        ? error.message
        : "The portal is temporarily unavailable. Try again.",
    },
    {
      status: known ? error.status : 502,
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}

function browserRedirect(value: string, app: URL) {
  if (/[\\\r\n]/.test(value))
    throw new BackendError(502, "BACKEND_REDIRECT_INVALID");
  let target: URL;
  try {
    target = new URL(value, app);
  } catch {
    throw new BackendError(502, "BACKEND_REDIRECT_INVALID");
  }
  if (target.origin !== app.origin || target.username || target.password)
    throw new BackendError(502, "BACKEND_REDIRECT_INVALID");
  return target.pathname + target.search + target.hash;
}

export async function proxyBackendRequest(request: Request): Promise<Response> {
  try {
    const incoming = new URL(request.url);
    if (!incoming.pathname.startsWith("/api/"))
      throw new BackendError(404, "NOT_FOUND");
    const { app, backend, secret } = backendConfiguration(request);
    if (
      !safeMethods.has(request.method) &&
      request.headers.get("origin") !== app.origin
    )
      throw new BackendError(403, "ORIGIN_NOT_ALLOWED");
    const target = new URL(backend.origin);
    // Assign instead of resolving so a // path can never change the host.
    target.pathname = incoming.pathname;
    target.search = incoming.search;
    const outgoing = new Headers();
    for (const name of forwardedHeaders) {
      const value = request.headers.get(name);
      if (value !== null) outgoing.set(name, value);
    }
    outgoing.set("x-portal-proxy-secret", secret);
    outgoing.set("x-portal-forwarded-origin", app.origin);
    const init: RequestInit & { duplex?: "half" } = {
      method: request.method,
      headers: outgoing,
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(60_000)]),
    };
    if (!safeMethods.has(request.method) && request.body) {
      init.body = request.body;
      init.duplex = "half";
    }
    const response = await fetch(target, init);
    const resultHeaders = new Headers();
    const connectionHeaders = (response.headers.get("connection") || "")
      .toLowerCase()
      .split(",")
      .map((name) => name.trim());
    for (const [name, value] of response.headers) {
      if (
        name === "set-cookie" ||
        name === "location" ||
        hopHeaders.has(name) ||
        connectionHeaders.includes(name) ||
        name.startsWith("x-portal-") ||
        name.startsWith("oai-") ||
        name.startsWith("access-control-")
      )
        continue;
      resultHeaders.append(name, value);
    }
    const location = response.headers.get("location");
    if (location) resultHeaders.set("Location", browserRedirect(location, app));
    // Expires contains commas: preserve each Set-Cookie without splitting it.
    for (const cookie of response.headers.getSetCookie())
      resultHeaders.append("Set-Cookie", cookie);
    resultHeaders.set("Cache-Control", "private, no-store, max-age=0");
    resultHeaders.set("X-Content-Type-Options", "nosniff");
    resultHeaders.set("Referrer-Policy", "same-origin");
    resultHeaders.set("Vary", "Cookie");
    return new Response(request.method === "HEAD" ? null : response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: resultHeaders,
    });
  } catch (error) {
    return failure(error);
  }
}

const serverRequest = cache(async () => {
  const incoming = await headers();
  // Host only addresses localhost development. Production never trusts caller
  // X-Forwarded-Host/Proto to select the browser origin or an upstream service.
  const host = incoming.get("host") || "";
  const localHost = /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host);
  const origin =
    process.env.NODE_ENV === "development" &&
    process.env.PORTAL_LOCAL_TEST === "1" &&
    localHost
      ? "http://" + host
      : process.env.APP_ORIGIN || defaultAppOrigin;
  const forwarded = new Headers();
  const cookie = incoming.get("cookie");
  if (cookie) forwarded.set("cookie", cookie);
  return { origin, headers: forwarded };
});

async function readJSON(path: string): Promise<BackendView> {
  const context = await serverRequest();
  const response = await proxyBackendRequest(
    new Request(new URL(path, context.origin), { headers: context.headers }),
  );
  let body: BackendView;
  try {
    body = await response.json();
  } catch {
    throw new BackendError(502, "BACKEND_RESPONSE_INVALID");
  }
  if (!response.ok)
    throw new BackendError(
      response.status,
      body.code || "BACKEND_UNAVAILABLE",
      body.message,
    );
  return body;
}

// React cache lasts for one render. There is no persistent private Data Cache.
const cachedView = cache(
  async (path: string, search: string, page: number, focus: string) => {
    const query = new URLSearchParams({
      view: path,
      q: search,
      page: String(page),
      focus,
    });
    return readJSON("/api/portal?" + query);
  },
);

export function readBackendView(
  path: string,
  options: BackendViewOptions = {},
) {
  return cachedView(
    path,
    options.search || "",
    options.page || 0,
    options.focus || "",
  );
}

// Crawlers must always receive an anonymous projection, even in a signed-in browser.
// This helper never reads or forwards request cookies.
export async function readAnonymousBackendView(path: string, page = 0): Promise<BackendView> {
  const query = new URLSearchParams({ view: path, page: String(page) });
  const response = await proxyBackendRequest(new Request(
    (process.env.APP_ORIGIN || defaultAppOrigin) + "/api/portal?" + query,
  ));
  if (!response.ok) throw new BackendError(response.status, "PUBLIC_VIEW_UNAVAILABLE");
  return response.json();
}

export const readBackendSession = cache(
  async (): Promise<BackendUser | null> => {
    const { user } = await readJSON("/api/auth/session");
    if (!user) return null;
    if (
      typeof user.id !== "string" ||
      typeof user.email !== "string" ||
      user.emailVerified !== true
    )
      throw new BackendError(502, "BACKEND_SESSION_INVALID");
    const fullName = typeof user.name === "string" ? user.name : null;
    return {
      userId: user.id,
      email: user.email,
      displayName: fullName || user.email,
      fullName,
    };
  },
);

export const localDevelopmentRender = cache(async () => {
  const context = await serverRequest();
  return isLocalDevelopmentRequest(new Request(context.origin));
});
