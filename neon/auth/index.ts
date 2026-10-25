import { randomUUID } from "node:crypto";
import { one, rows, batch, type Database } from "../../lib/db";
import { safeReturnTo, type Identity } from "../../lib/identity";
import { demand, emailSchema, PortalError } from "../../lib/security";
import {
  authConfig,
  authCookie,
  cookieName,
  readCookie,
  randomToken,
  tokenHash,
  tokenPattern,
  trustedBrowserOrigin,
  MAGIC_TTL,
  OAUTH_TTL,
  SESSION_TTL,
  type AuthConfig,
  type AuthEnv,
} from "./config";
import {
  authoritativeGoogleEmail,
  exchangeGoogleCode,
  GOOGLE_AUTHORIZATION_URL,
  pkceChallenge,
  verifyGoogleIdToken,
  type GoogleExchange,
  type GoogleClaims,
} from "./google";
import { sendMagicEmail, smtpConfig, type MagicMessage } from "./smtp";
import {
  issuedSessionEvidenceStatement,
  retainedSessionEvidenceStatement,
} from "../../lib/sign-in-evidence";

export type { AuthEnv } from "./config";
export { trustedBrowserOrigin } from "./config";
export interface AuthDependencies {
  now?: () => number;
  sendMagicEmail?: (message: MagicMessage) => Promise<void>;
  exchangeGoogleCode?: (input: GoogleExchange) => Promise<string>;
  verifyGoogleIdToken?: (
    token: string,
    clientId: string,
    nonce: string,
    now: number,
  ) => Promise<GoogleClaims>;
}
interface AuthUser {
  id: string;
  email: string;
  name: string;
  email_verified_at: string;
}
interface MagicToken {
  email: string;
  return_to: string;
}
interface OAuthTransaction {
  nonce: string;
  pkce_verifier: string;
  return_to: string;
}

const privateHeaders = {
  "cache-control": "no-store, max-age=0",
  pragma: "no-cache",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
};
function json(body: unknown, status = 200, cookies: string[] = []) {
  const headers = new Headers({
    ...privateHeaders,
    "content-type": "application/json; charset=utf-8",
  });
  for (const cookie of cookies) headers.append("set-cookie", cookie);
  return new Response(JSON.stringify(body), { status, headers });
}
function redirect(location: string, cookies: string[] = []) {
  const headers = new Headers({ ...privateHeaders, location });
  for (const cookie of cookies) headers.append("set-cookie", cookie);
  return new Response(null, { status: 303, headers });
}
async function limitedBody(request: Request) {
  const maximum = 8_192;
  demand(
    Number(request.headers.get("content-length") || 0) <= maximum,
    413,
    "AUTH_BODY_TOO_LARGE",
  );
  const reader = request.body?.getReader();
  if (!reader) return "";
  let length = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      demand(length <= maximum, 413, "AUTH_BODY_TOO_LARGE");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  return Buffer.concat(chunks).toString("utf8");
}
async function bodyJson(request: Request): Promise<Record<string, unknown>> {
  demand(
    request.headers.get("content-type")?.split(";")[0].trim() ===
      "application/json",
    415,
    "JSON_REQUIRED",
  );
  const body = await limitedBody(request);
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    demand(false, 422, "INVALID_AUTH_BODY");
  }
  demand(
    parsed && typeof parsed === "object" && !Array.isArray(parsed),
    422,
    "INVALID_AUTH_BODY",
  );
  return parsed as Record<string, unknown>;
}
function exactFields(body: Record<string, unknown>, fields: string[]) {
  demand(
    Object.keys(body).every((key) => fields.includes(key)),
    422,
    "INVALID_AUTH_BODY",
  );
}
function identity(user: AuthUser): Identity {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    source: "neon",
    emailVerified: true,
  };
}
async function sessionIdentity(
  request: Request,
  config: AuthConfig,
  db: Database,
  now: number,
) {
  const token = readCookie(request, cookieName(config, "session"));
  if (!token) return null;
  const user = await one<AuthUser>(
    db,
    "SELECT u.id,u.email,u.name,u.email_verified_at FROM auth_sessions s JOIN auth_users u ON u.id=s.auth_user_id JOIN users p ON p.id=u.id WHERE s.token_hash=? AND s.expires_at>? AND u.email_verified_at IS NOT NULL AND lower(p.email)=u.email",
    tokenHash(config, "session", token),
    now,
  );
  return user ? identity(user) : null;
}

export async function authenticateRequest(
  request: Request,
  env: AuthEnv,
  db: Database,
): Promise<Identity | null> {
  trustedBrowserOrigin(request, env);
  return sessionIdentity(request, authConfig(env), db, Date.now());
}

// Atomic upserts cap concurrent requests; the keys are HMACs, not raw emails.
async function rateLimit(
  db: Database,
  config: AuthConfig,
  purpose: string,
  key: string,
  limit: number,
  window: number,
  now: number,
) {
  const bucket = tokenHash(config, "rate:" + purpose, key);
  const accepted = await one(
    db,
    "INSERT INTO auth_rate_limits(bucket,count,expires_at) VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=CASE WHEN auth_rate_limits.expires_at<=? THEN 1 ELSE auth_rate_limits.count+1 END,expires_at=CASE WHEN auth_rate_limits.expires_at<=? THEN excluded.expires_at ELSE auth_rate_limits.expires_at END WHERE auth_rate_limits.expires_at<=? OR auth_rate_limits.count<? RETURNING bucket",
    bucket,
    now + window,
    now,
    now,
    now,
    limit,
  );
  demand(accepted, 429, "AUTH_RATE_LIMITED");
}
async function cleanup(db: Database, now: number) {
  await batch(db, [
    retainedSessionEvidenceStatement(new Date(now).toISOString()),
    ["DELETE FROM auth_magic_tokens WHERE expires_at<=?", now],
    ["DELETE FROM auth_oauth_transactions WHERE expires_at<=?", now],
    ["DELETE FROM auth_sessions WHERE expires_at<=?", now],
    ["DELETE FROM auth_rate_limits WHERE expires_at<=?", now],
  ]);
}
async function resolveVerifiedUser(
  db: Database,
  email: string,
  name: string,
  now: number,
): Promise<AuthUser> {
  // Existing portal IDs, roster membership and server-managed roles survive.
  // The new-user INSERT relies on the schema's participant default, never input.
  const portalUser = await one<{ id: string }>(
    db,
    "INSERT INTO users(id,email,name,created_at) VALUES(?,?,?,?) ON CONFLICT(email) DO UPDATE SET email=excluded.email RETURNING id",
    "neon_" + randomUUID(),
    email,
    name,
    new Date(now).toISOString(),
  );
  demand(portalUser, 503, "AUTH_UNAVAILABLE");
  const user = await one<AuthUser>(
    db,
    "INSERT INTO auth_users(id,email,name,email_verified_at) SELECT id,lower(email),name,? FROM users WHERE id=? ON CONFLICT(email) DO UPDATE SET email_verified_at=excluded.email_verified_at RETURNING id,email,name,email_verified_at",
    new Date(now).toISOString(),
    portalUser.id,
  );
  demand(user && user.id === portalUser.id, 409, "AUTH_ACCOUNT_CONFLICT");
  return user;
}
async function issueSession(
  request: Request,
  db: Database,
  config: AuthConfig,
  user: AuthUser,
  now: number,
) {
  const token = randomToken();
  const previous = readCookie(request, cookieName(config, "session"));
  const observedAt = new Date(now).toISOString();
  const sessionHash = tokenHash(config, "session", token);
  await batch(db, [
    ...(previous
      ? [
          retainedSessionEvidenceStatement(
            observedAt,
            tokenHash(config, "session", previous),
          ),
          [
            "DELETE FROM auth_sessions WHERE token_hash=?",
            tokenHash(config, "session", previous),
          ] as [string, ...unknown[]],
        ]
      : []),
    [
      "INSERT INTO auth_sessions(token_hash,auth_user_id,expires_at) VALUES(?,?,?)",
      sessionHash,
      user.id,
      now + SESSION_TTL,
    ],
    issuedSessionEvidenceStatement(observedAt, sessionHash),
  ]);
  return authCookie(config, "session", token, SESSION_TTL);
}
function googleConfigured(env: AuthEnv) {
  demand(
    env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET,
    503,
    "GOOGLE_NOT_CONFIGURED",
  );
  return {
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
  };
}
function authPage(title: string, content: string, status = 200) {
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · DevDay Exchange</title><style>body{margin:0;background:#fafaf9;color:#141414;font:16px/1.6 system-ui,sans-serif}main{max-width:420px;margin:14vh auto;padding:24px}h1{font-size:32px;line-height:1.15;font-weight:500;letter-spacing:-.04em}p{color:#555}button,a{font:inherit}button{display:block;border:0;border-radius:8px;background:#141414;color:white;padding:14px 24px;cursor:pointer}a{color:#141414}button:focus-visible,a:focus-visible{outline:3px solid #006b43;outline-offset:3px}</style></head><body><main><p>DevDay Exchange · New Delhi</p><h1>${title}</h1>${content}</main></body></html>`,
    {
      status,
      headers: {
        ...privateHeaders,
        "content-type": "text/html; charset=utf-8",
        "content-security-policy":
          "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
        "x-frame-options": "DENY",
      },
    },
  );
}
function magicConfirmation(token: string) {
  // Tokens are strictly base64url before interpolation. No third-party assets,
  // script or query string in the POST; link-scanner GETs never consume tokens.
  return authPage(
    "Confirm your sign-in",
    `<p>Continue to DevDay Exchange New Delhi in this browser.</p><form method="post" action="/api/auth/magic/verify"><input type="hidden" name="token" value="${token}"><button type="submit">Confirm sign in</button></form>`,
  );
}

export function createAuthHandler(
  env: AuthEnv,
  db: Database,
  dependencies: AuthDependencies = {},
) {
  const now = dependencies.now || Date.now;
  return async function authHandler(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    let trusted = false;
    try {
      trustedBrowserOrigin(request, env);
      trusted = true;
      const config = authConfig(env),
        time = now();
      if (path === "/api/auth/session") {
        demand(request.method === "GET", 405, "METHOD_NOT_ALLOWED");
        const user = await sessionIdentity(request, config, db, time);
        return json({
          user: user
            ? {
                id: user.id,
                email: user.email,
                name: user.name,
                emailVerified: true,
              }
            : null,
        });
      }
      if (path === "/api/auth/signout") {
        demand(request.method === "POST", 405, "METHOD_NOT_ALLOWED");
        const body = await bodyJson(request);
        exactFields(body, ["returnTo"]);
        const returnTo = safeReturnTo(body.returnTo, "/");
        const token = readCookie(request, cookieName(config, "session"));
        if (token)
          await batch(db, [
            retainedSessionEvidenceStatement(
              new Date(time).toISOString(),
              tokenHash(config, "session", token),
            ),
            [
              "DELETE FROM auth_sessions WHERE token_hash=?",
              tokenHash(config, "session", token),
            ],
          ]);
        return json(
          { redirectTo: returnTo },
          200,
          ["session", "magic", "oauth"].map((kind) =>
            authCookie(config, kind as "session" | "magic" | "oauth", "", 0),
          ),
        );
      }
      if (path === "/api/auth/magic/request") {
        demand(request.method === "POST", 405, "METHOD_NOT_ALLOWED");
        const body = await bodyJson(request);
        exactFields(body, ["email", "returnTo"]);
        const parsedEmail = emailSchema.safeParse(body.email);
        demand(parsedEmail.success, 422, "INVALID_EMAIL");
        const email = parsedEmail.data,
          returnTo = safeReturnTo(body.returnTo);
        if (!dependencies.sendMagicEmail) smtpConfig(env);
        await rateLimit(
          db,
          config,
          "magic-global",
          "global",
          100,
          60 * 60_000,
          time,
        );
        await rateLimit(db, config, "magic-email", email, 5, 15 * 60_000, time);
        await cleanup(db, time);
        const browser =
          readCookie(request, cookieName(config, "magic")) || randomToken();
        await rateLimit(
          db,
          config,
          "magic-browser",
          browser,
          10,
          15 * 60_000,
          time,
        );
        const token = randomToken();
        await rows(
          db,
          "INSERT INTO auth_magic_tokens(token_hash,email,browser_hash,return_to,expires_at) VALUES(?,?,?,?,?)",
          tokenHash(config, "magic", token),
          email,
          tokenHash(config, "magic-browser", browser),
          returnTo,
          time + MAGIC_TTL,
        );
        const message = {
          to: email,
          url: `${config.origin}/api/auth/magic/verify?token=${token}`,
          expiresMinutes: 15,
        };
        try {
          await (dependencies.sendMagicEmail
            ? dependencies.sendMagicEmail(message)
            : sendMagicEmail(env, message));
        } catch {
          // A failed delivery cannot leave a usable token behind or expose SMTP diagnostics.
          await rows(
            db,
            "DELETE FROM auth_magic_tokens WHERE token_hash=?",
            tokenHash(config, "magic", token),
          );
          demand(false, 503, "MAGIC_DELIVERY_FAILED");
        }
        return json(
          {
            message:
              "Check your email for a sign-in link. Open it in this browser within 15 minutes.",
          },
          202,
          [authCookie(config, "magic", browser, MAGIC_TTL)],
        );
      }
      if (path === "/api/auth/magic/verify") {
        demand(
          request.method === "GET" || request.method === "POST",
          405,
          "METHOD_NOT_ALLOWED",
        );
        let token: unknown;
        if (request.method === "GET") {
          demand(
            url.searchParams.getAll("token").length === 1,
            400,
            "MAGIC_LINK_INVALID",
          );
          token = url.searchParams.get("token");
        } else if (
          request.headers.get("content-type")?.split(";")[0].trim() ===
          "application/x-www-form-urlencoded"
        ) {
          const form = new URLSearchParams(await limitedBody(request));
          demand(
            form.getAll("token").length === 1 &&
              [...form.keys()].every((key) => key === "token"),
            422,
            "INVALID_AUTH_BODY",
          );
          token = form.get("token");
        } else {
          const body = await bodyJson(request);
          exactFields(body, ["token"]);
          token = body.token;
        }
        const browser = readCookie(request, cookieName(config, "magic"));
        demand(
          typeof token === "string" && tokenPattern.test(token) && browser,
          400,
          "MAGIC_LINK_INVALID",
        );
        const hash = tokenHash(config, "magic", token),
          browserHash = tokenHash(config, "magic-browser", browser);
        if (request.method === "GET") {
          const record = await one(
            db,
            "SELECT token_hash FROM auth_magic_tokens WHERE token_hash=? AND browser_hash=? AND expires_at>?",
            hash,
            browserHash,
            time,
          );
          demand(record, 400, "MAGIC_LINK_INVALID");
          return magicConfirmation(token);
        }
        await rateLimit(
          db,
          config,
          "magic-verify",
          browser,
          20,
          15 * 60_000,
          time,
        );
        // DELETE ... RETURNING is atomic; parallel verifications have one winner.
        const record = await one<MagicToken>(
          db,
          "DELETE FROM auth_magic_tokens WHERE token_hash=? AND browser_hash=? AND expires_at>? RETURNING email,return_to",
          hash,
          browserHash,
          time,
        );
        demand(record, 400, "MAGIC_LINK_INVALID");
        await rows(
          db,
          "DELETE FROM auth_magic_tokens WHERE email=?",
          record.email,
        );
        const user = await resolveVerifiedUser(
          db,
          record.email,
          record.email.split("@")[0],
          time,
        );
        const session = await issueSession(request, db, config, user, time);
        return redirect(safeReturnTo(record.return_to), [
          session,
          authCookie(config, "magic", "", 0),
        ]);
      }
      if (path === "/api/auth/google/start") {
        demand(request.method === "POST", 405, "METHOD_NOT_ALLOWED");
        const credentials = googleConfigured(env),
          body = await bodyJson(request);
        exactFields(body, ["returnTo"]);
        const returnTo = safeReturnTo(body.returnTo);
        await rateLimit(
          db,
          config,
          "google-global",
          "global",
          1_000,
          60 * 60_000,
          time,
        );
        await cleanup(db, time);
        const browser =
          readCookie(request, cookieName(config, "oauth")) || randomToken();
        await rateLimit(
          db,
          config,
          "google-browser",
          browser,
          20,
          15 * 60_000,
          time,
        );
        const state = randomToken(),
          nonce = randomToken(),
          verifier = randomToken();
        await rows(
          db,
          "INSERT INTO auth_oauth_transactions(state_hash,browser_hash,nonce,pkce_verifier,return_to,expires_at) VALUES(?,?,?,?,?,?)",
          tokenHash(config, "oauth-state", state),
          tokenHash(config, "oauth-browser", browser),
          nonce,
          verifier,
          returnTo,
          time + OAUTH_TTL,
        );
        const authorization = new URL(GOOGLE_AUTHORIZATION_URL);
        authorization.search = new URLSearchParams({
          client_id: credentials.clientId,
          redirect_uri: config.origin + "/api/auth/callback/google",
          response_type: "code",
          scope: "openid email profile",
          state,
          nonce,
          code_challenge: pkceChallenge(verifier),
          code_challenge_method: "S256",
          prompt: "select_account",
        }).toString();
        return json({ redirectTo: authorization.toString() }, 200, [
          authCookie(config, "oauth", browser, OAUTH_TTL),
        ]);
      }
      if (path === "/api/auth/callback/google") {
        demand(request.method === "GET", 405, "METHOD_NOT_ALLOWED");
        const credentials = googleConfigured(env),
          browser = readCookie(request, cookieName(config, "oauth"));
        const state = url.searchParams.get("state"),
          code = url.searchParams.get("code");
        demand(
          browser &&
            state &&
            tokenPattern.test(state) &&
            url.searchParams.getAll("state").length === 1,
          400,
          "OAUTH_STATE_INVALID",
        );
        const transaction = await one<OAuthTransaction>(
          db,
          "DELETE FROM auth_oauth_transactions WHERE state_hash=? AND browser_hash=? AND expires_at>? RETURNING nonce,pkce_verifier,return_to",
          tokenHash(config, "oauth-state", state),
          tokenHash(config, "oauth-browser", browser),
          time,
        );
        demand(transaction, 400, "OAUTH_STATE_INVALID");
        if (url.searchParams.has("error"))
          return redirect("/signin?error=google_cancelled", [
            authCookie(config, "oauth", "", 0),
          ]);
        demand(
          code &&
            code.length <= 4096 &&
            url.searchParams.getAll("code").length === 1,
          400,
          "GOOGLE_SIGN_IN_FAILED",
        );
        const token = await (
          dependencies.exchangeGoogleCode || exchangeGoogleCode
        )({
          ...credentials,
          code,
          verifier: transaction.pkce_verifier,
          redirectUri: config.origin + "/api/auth/callback/google",
        });
        const claims = await (
          dependencies.verifyGoogleIdToken || verifyGoogleIdToken
        )(token, credentials.clientId, transaction.nonce, time);
        const email = authoritativeGoogleEmail(claims);
        demand(
          typeof claims.sub === "string" &&
            claims.sub.length > 0 &&
            claims.sub.length <= 255,
          401,
          "GOOGLE_ID_TOKEN_INVALID",
        );
        const linked = await one<AuthUser>(
          db,
          "SELECT u.id,u.email,u.name,u.email_verified_at FROM auth_accounts a JOIN auth_users u ON u.id=a.auth_user_id WHERE a.provider='google' AND a.provider_subject=?",
          claims.sub,
        );
        // A Google subject is immutable. An email change never reassigns a portal
        // identity, and a second subject cannot take over an existing binding.
        demand(!linked || linked.email === email, 409, "AUTH_ACCOUNT_CONFLICT");
        const name =
          typeof claims.name === "string" && claims.name.trim()
            ? claims.name.trim().slice(0, 200)
            : email.split("@")[0];
        const user =
          linked || (await resolveVerifiedUser(db, email, name, time));
        if (!linked) {
          await rows(
            db,
            "INSERT INTO auth_accounts(provider,provider_subject,auth_user_id) VALUES('google',?,?) ON CONFLICT DO NOTHING",
            claims.sub,
            user.id,
          );
          const binding = await one<{ auth_user_id: string }>(
            db,
            "SELECT auth_user_id FROM auth_accounts WHERE provider='google' AND provider_subject=?",
            claims.sub,
          );
          demand(
            binding?.auth_user_id === user.id,
            409,
            "AUTH_ACCOUNT_CONFLICT",
          );
        }
        const session = await issueSession(request, db, config, user, time);
        return redirect(safeReturnTo(transaction.return_to), [
          session,
          authCookie(config, "oauth", "", 0),
        ]);
      }
      return json({ error: "AUTH_ROUTE_NOT_FOUND" }, 404);
    } catch (error) {
      const known = error instanceof PortalError;
      // Token claims/transport exceptions intentionally disclose no provider data.
      const status = known ? error.status : 503;
      const code = known ? error.code : "AUTH_UNAVAILABLE";
      let response: Response;
      if (
        trusted &&
        ["/api/auth/magic/verify", "/api/auth/callback/google"].includes(path)
      ) {
        const copy =
          code === "GOOGLE_EMAIL_PROOF_REQUIRED"
            ? "Use an email sign-in link to verify this email address."
            : code === "MAGIC_LINK_INVALID"
              ? "This link has expired, has already been used, or was opened in a different browser. Request a new link and open it in the browser where you requested it."
              : code === "AUTH_RATE_LIMITED"
                ? "Too many attempts. Please wait 15 minutes before trying again."
                : "Sign-in could not be completed. Please return to the sign-in page and try again.";
        response = authPage(
          "Let's try that again.",
          `<p>${copy}</p><p><a href="/signin">Return to sign in</a></p>`,
          status,
        );
      } else {
        response = json({ error: code }, status);
      }
      if (status === 429) response.headers.set("retry-after", "900");
      if (status === 405)
        response.headers.set(
          "allow",
          path === "/api/auth/magic/verify"
            ? "GET, POST"
            : ["/api/auth/session", "/api/auth/callback/google"].includes(path)
              ? "GET"
              : "POST",
        );
      return response;
    }
  };
}
