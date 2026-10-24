import { timingSafeEqual, createHmac, randomBytes } from "node:crypto";
import { demand } from "../../lib/security";

export interface AuthEnv {
  APP_ORIGIN?: string;
  AUTH_BASE_URL?: string;
  AUTH_SECRET?: string;
  BETTER_AUTH_SECRET?: string;
  PORTAL_PROXY_SECRET?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  SMTP_HOST?: string;
  SMTP_PORT?: string;
  SMTP_SECURE?: string;
  SMTP_USER?: string;
  SMTP_PASS?: string;
  SMTP_PASSWORD?: string;
  SMTP_FROM?: string;
}
export interface AuthConfig {
  origin: string;
  secure: boolean;
  secret: string;
  proxySecret: string;
}
export const MAGIC_TTL = 15 * 60_000;
export const OAUTH_TTL = 10 * 60_000;
export const SESSION_TTL = 7 * 24 * 60 * 60_000;
export const tokenPattern = /^[A-Za-z0-9_-]{43}$/;

export function authConfig(env: AuthEnv): AuthConfig {
  const secret = env.BETTER_AUTH_SECRET || env.AUTH_SECRET;
  let url: URL;
  try {
    url = new URL(env.APP_ORIGIN || "");
  } catch {
    demand(false, 503, "AUTH_NOT_CONFIGURED");
  }
  demand(
    env.APP_ORIGIN === url.origin &&
      !url.username &&
      !url.password &&
      (url.protocol === "https:" ||
        (url.protocol === "http:" &&
          ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) &&
      (!env.AUTH_BASE_URL || env.AUTH_BASE_URL === env.APP_ORIGIN) &&
      typeof secret === "string" &&
      secret.length >= 32 &&
      typeof env.PORTAL_PROXY_SECRET === "string" &&
      env.PORTAL_PROXY_SECRET.length >= 32,
    503,
    "AUTH_NOT_CONFIGURED",
  );
  return {
    origin: url.origin,
    secure: url.protocol === "https:",
    secret,
    proxySecret: env.PORTAL_PROXY_SECRET,
  };
}

export function equalSecret(a: string, b: string): boolean {
  const left = Buffer.from(a),
    right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
export function randomToken() {
  return randomBytes(32).toString("base64url");
}
export function tokenHash(config: AuthConfig, purpose: string, token: string) {
  return createHmac("sha256", config.secret)
    .update(purpose + "\0" + token)
    .digest("hex");
}

// The backend is reachable independently of the browser origin. Only the Next
// proxy's shared secret authorizes forwarded origin data; Sites headers do not.
export function trustedBrowserOrigin(request: Request, env: AuthEnv): string {
  const config = authConfig(env);
  demand(
    equalSecret(
      request.headers.get("x-portal-proxy-secret") || "",
      config.proxySecret,
    ) && request.headers.get("x-portal-forwarded-origin") === config.origin,
    403,
    "UNTRUSTED_PROXY",
  );
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    demand(
      request.headers.get("origin") === config.origin,
      403,
      "ORIGIN_MISMATCH",
    );
  }
  return config.origin;
}

export function cookieName(
  config: AuthConfig,
  kind: "session" | "magic" | "oauth",
) {
  return (config.secure ? "__Host-" : "") + "portal-" + kind;
}
export function readCookie(request: Request, name: string) {
  const found = (request.headers.get("cookie") || "")
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.startsWith(name + "="));
  // Reject cookie shadowing rather than selecting the attacker-controlled copy.
  if (found.length !== 1) return null;
  const value = found[0].slice(name.length + 1);
  return tokenPattern.test(value) ? value : null;
}
export function authCookie(
  config: AuthConfig,
  kind: "session" | "magic" | "oauth",
  value: string,
  ttl: number,
) {
  return `${cookieName(config, kind)}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.max(0, Math.floor(ttl / 1000))}${config.secure ? "; Secure" : ""}`;
}
