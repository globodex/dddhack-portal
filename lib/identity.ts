import { demand } from "./security";
export type Identity = {
  id: string;
  email: string;
  name: string;
  source: "sites" | "local-test";
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
  return { id, email: email.toLowerCase().trim(), name, source: "sites" };
}
export function isOwner(i: Identity) {
  return i.source === "sites" ? i.email === OWNER_EMAIL : i.localOwner === true;
}
export function signInPath(returnTo = "/dashboard") {
  demand(
    returnTo.startsWith("/") &&
      !returnTo.startsWith("//") &&
      !/[\\\r\n]/.test(returnTo),
    422,
    "INVALID_RETURN_PATH",
  );
  return "/signin-with-chatgpt?return_to=" + encodeURIComponent(returnTo);
}
