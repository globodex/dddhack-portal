import { AsyncLocalStorage } from "node:async_hooks";
import type { Database } from "./db";
import { sitesIdentity } from "./identity";
import type { Runtime } from "./http";
import { demand, PortalError } from "./security";

export type SitesEnvironment = {
  DB?: Database;
  CREDIT_ENCRYPTION_KEY?: string;
  PORTAL_RUNTIME?: string;
  PORTAL_TRUST_SITES_DISPATCH?: string;
};
type RequestContext = { request: Request; env: SitesEnvironment };
const requests = new AsyncLocalStorage<RequestContext>();

// Only the Worker entry supplies this context. No global env/identity survives requests.
export function runWithSitesRequest<T>(
  request: Request,
  env: SitesEnvironment,
  run: () => T,
): T {
  return requests.run({ request, env }, run);
}
export function dispatchConfigured(env: SitesEnvironment) {
  return (
    env.PORTAL_RUNTIME === "sites" && env.PORTAL_TRUST_SITES_DISPATCH === "true"
  );
}
export function getSitesRuntime(): Runtime {
  const context = requests.getStore();
  demand(
    context && dispatchConfigured(context.env),
    503,
    "SITES_DISPATCH_NOT_CONFIGURED",
  );
  const { env, request } = context;
  demand(env.DB, 503, "DATABASE_BINDING_UNAVAILABLE");
  const key = env.CREDIT_ENCRYPTION_KEY;
  let keyLength = 0;
  try {
    keyLength = key ? atob(key).length : 0;
  } catch {
    /* Fail closed below. */
  }
  demand(key && keyLength === 32, 503, "CREDIT_KEY_UNAVAILABLE");
  return { db: env.DB, identity: sitesIdentity(request, env), key };
}
export function protectedPath(path: string) {
  return /^\/(dashboard|admin|judge)(\/|$)/.test(path);
}
export function unavailableResponse(error: unknown) {
  const failure =
    error instanceof PortalError
      ? error
      : new PortalError(503, "HOSTED_RUNTIME_UNAVAILABLE");
  return Response.json(
    { code: failure.code, message: failure.message },
    {
      status: failure.status,
      headers: {
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
