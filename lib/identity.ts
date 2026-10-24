import { demand } from "./security";
export type Identity = {
  id: string;
  email: string;
  name: string;
  source: "sites" | "neon" | "local-test";
  emailVerified?: boolean;
  localOwner?: boolean;
};
export const OWNER_EMAIL = "connectwithparam.30@gmail.com";
export function sitesIdentity(
  request: Request,
  env: { PORTAL_RUNTIME?: string; PORTAL_TRUST_SITES_DISPATCH?: string },
): Identity | null {
  // Trust is valid ONLY behind Sites Dispatch, which must strip caller-supplied identity headers.
  demand(
    env.PORTAL_RUNTIME === "sites" &&
      env.PORTAL_TRUST_SITES_DISPATCH === "true",
    503,
    "SITES_DISPATCH_NOT_CONFIGURED",
  );
  const id = request.headers.get("oai-authenticated-user-id"),
    email = request.headers.get("oai-authenticated-user-email");
  if (!id || !email) return null;
  let name = request.headers.get("oai-authenticated-user-full-name") || email;
  if (
    request.headers.get("oai-authenticated-user-full-name-encoding") ===
    "percent-encoded-utf-8"
  )
    try {
      name = decodeURIComponent(name);
    } catch {
      name = email;
    }
  return {
    id,
    email: email.toLowerCase().trim(),
    name,
    source: "sites",
    emailVerified: true,
  };
}
export function isOwner(i: Identity) {
  if (i.source === "local-test") return i.localOwner === true;
  return (
    i.emailVerified === true && i.email.trim().toLowerCase() === OWNER_EMAIL
  );
}
export function safeReturnTo(value: unknown, fallback = "/dashboard") {
  if (value == null || value === "") return fallback;
  demand(
    typeof value === "string" && value.length <= 2048,
    422,
    "INVALID_RETURN_PATH",
  );
  // Validate decoded forms too: browsers and reverse proxies may normalize them.
  let decoded = value;
  for (let depth = 0; depth < 4; depth++) {
    demand(
      decoded.startsWith("/") &&
        !decoded.startsWith("//") &&
        !/[\\\u0000-\u0020\u007f]/.test(decoded),
      422,
      "INVALID_RETURN_PATH",
    );
    let next: string;
    try {
      next = decodeURIComponent(decoded);
    } catch {
      demand(false, 422, "INVALID_RETURN_PATH");
    }
    if (next === decoded) break;
    decoded = next;
    demand(depth < 3, 422, "INVALID_RETURN_PATH");
  }
  const parsed = new URL(value, "https://portal.invalid");
  const decodedParsed = new URL(decoded, "https://portal.invalid");
  demand(
    parsed.origin === "https://portal.invalid" &&
      decodedParsed.origin === "https://portal.invalid" &&
      !parsed.pathname.startsWith("//") &&
      !decodedParsed.pathname.startsWith("//"),
    422,
    "INVALID_RETURN_PATH",
  );
  // Never bounce a fresh login back into an auth endpoint.
  demand(
    !/^\/(?:api\/auth(?:\/|$)|signin(?:\/|$)|signin-with-chatgpt(?:\/|$)|signout-with-chatgpt(?:\/|$))/.test(
      decodedParsed.pathname,
    ),
    422,
    "INVALID_RETURN_PATH",
  );
  return parsed.pathname + parsed.search + parsed.hash;
}
export function signInPath(returnTo = "/dashboard") {
  return "/signin?returnTo=" + encodeURIComponent(safeReturnTo(returnTo));
}
