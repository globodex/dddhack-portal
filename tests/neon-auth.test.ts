import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  generateKeyPair,
  exportJWK,
  createLocalJWKSet,
  SignJWT,
  type JWTPayload,
} from "jose";
import { LocalDatabase } from "../lib/local-test/sqlite";
import { one, rows } from "../lib/db";
import { safeReturnTo, isOwner, OWNER_EMAIL } from "../lib/identity";
import {
  createAuthHandler,
  authenticateRequest,
  type AuthDependencies,
  type AuthEnv,
} from "../neon/auth";
import {
  authConfig,
  cookieName,
  tokenHash,
  MAGIC_TTL,
  OAUTH_TTL,
  SESSION_TTL,
} from "../neon/auth/config";
import { verifyGoogleIdToken, pkceChallenge } from "../neon/auth/google";
import { smtpConfig, type MagicMessage } from "../neon/auth/smtp";

// No provider call is made: SMTP is injected and Google JWTs use ephemeral local
// signing keys. The fixtures never contain real users, credentials, or mail.
const env: AuthEnv = {
  APP_ORIGIN: "https://portal.example.test",
  AUTH_BASE_URL: "https://portal.example.test",
  AUTH_SECRET: "synthetic-auth-secret-with-at-least-32-chars",
  PORTAL_PROXY_SECRET: "synthetic-proxy-secret-with-at-least-32-chars",
  GOOGLE_CLIENT_ID: "synthetic-client.apps.googleusercontent.com",
  GOOGLE_CLIENT_SECRET: "synthetic-google-secret",
};
const config = authConfig(env);
const keyPair = await generateKeyPair("RS256");
const jwk = await exportJWK(keyPair.publicKey);
jwk.kid = "offline-test-key";
const keys = createLocalJWKSet({ keys: [jwk] });

function setup(
  options: {
    extra?: AuthDependencies;
    claims?: JWTPayload;
    authEnv?: AuthEnv;
  } = {},
) {
  const db = new LocalDatabase(":memory:");
  db.raw.exec(
    "CREATE TABLE users(id TEXT PRIMARY KEY,email TEXT NOT NULL COLLATE NOCASE UNIQUE,name TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'participant',created_at TEXT NOT NULL)",
  );
  db.raw.exec(
    readFileSync(
      new URL("../neon/auth-migrations/0001_auth.sql", import.meta.url),
      "utf8",
    ),
  );
  const sent: MagicMessage[] = [],
    exchanges: unknown[] = [];
  let time = Date.now();
  let claims: JWTPayload = {
    sub: "synthetic-google-sub",
    email: "builder@gmail.com",
    email_verified: true,
    name: "Synthetic Builder",
    ...options.claims,
  };
  const dependencies: AuthDependencies = {
    now: () => time,
    sendMagicEmail: async (message) => {
      sent.push(message);
    },
    exchangeGoogleCode: async (input) => {
      exchanges.push(input);
      return "local-id-token";
    },
    verifyGoogleIdToken: async (_token, clientId, nonce, now) => {
      const token = await signed({ ...claims, nonce }, now);
      return verifyGoogleIdToken(token, clientId, nonce, now, keys);
    },
    ...options.extra,
  };
  const activeEnv = options.authEnv || env;
  const handler = createAuthHandler(activeEnv, db, dependencies);
  function request(
    path: string,
    options: {
      method?: string;
      body?: unknown;
      cookie?: string;
      origin?: string | null;
      headers?: Record<string, string>;
      rawBody?: string;
    } = {},
  ) {
    const method =
      options.method ||
      (options.body !== undefined || options.rawBody !== undefined
        ? "POST"
        : "GET");
    const headers: Record<string, string> = {
      "x-portal-proxy-secret": activeEnv.PORTAL_PROXY_SECRET!,
      "x-portal-forwarded-origin": activeEnv.APP_ORIGIN!,
      ...(method !== "GET"
        ? { origin: activeEnv.APP_ORIGIN!, "content-type": "application/json" }
        : {}),
      ...(options.cookie ? { cookie: options.cookie } : {}),
      ...options.headers,
    };
    if (options.origin === null) delete headers.origin;
    else if (options.origin) headers.origin = options.origin;
    return new Request("https://backend.example.test" + path, {
      method,
      headers,
      body:
        options.rawBody ??
        (options.body !== undefined ? JSON.stringify(options.body) : undefined),
    });
  }
  async function magic(
    email = "builder@gmail.com",
    cookie?: string,
    returnTo = "/dashboard",
  ) {
    const response = await handler(
      request("/api/auth/magic/request", { body: { email, returnTo }, cookie }),
    );
    const link = sent.at(-1)?.url;
    return {
      response,
      cookie: cookieOf(response, "magic", activeEnv),
      token: link ? new URL(link).searchParams.get("token")! : "",
    };
  }
  async function verify(token: string, cookie: string) {
    return handler(
      request("/api/auth/magic/verify", { body: { token }, cookie }),
    );
  }
  async function google(cookie?: string, returnTo = "/dashboard") {
    const response = await handler(
      request("/api/auth/google/start", { body: { returnTo }, cookie }),
    );
    const body = (await response.json()) as { redirectTo: string };
    const authorization = new URL(body.redirectTo);
    const state = authorization.searchParams.get("state")!;
    return {
      response,
      authorization,
      state,
      cookie: cookieOf(response, "oauth", activeEnv),
    };
  }
  function callback(state: string, cookie: string, suffix = "") {
    return handler(
      request(
        `/api/auth/callback/google?state=${state}&code=offline-code${suffix}`,
        { cookie },
      ),
    );
  }
  return {
    db,
    handler,
    request,
    sent,
    exchanges,
    magic,
    verify,
    google,
    callback,
    tick: (ms: number) => {
      time += ms;
    },
    setClaims: (value: JWTPayload) => {
      claims = value;
    },
  };
}
function cookieOf(
  response: Response,
  kind: "session" | "magic" | "oauth",
  activeEnv = env,
) {
  const name = cookieName(authConfig(activeEnv), kind);
  return (
    response.headers
      .getSetCookie()
      .find((value) => value.startsWith(name + "="))
      ?.split(";")[0] || ""
  );
}
async function signed(
  claims: JWTPayload,
  now = Date.now(),
  algorithm = "RS256",
) {
  return new SignJWT({
    email: "builder@gmail.com",
    email_verified: true,
    nonce: "offline-nonce",
    ...claims,
  })
    .setProtectedHeader({ alg: algorithm, kid: "offline-test-key" })
    .setIssuer(
      (claims.iss as string | undefined) ?? "https://accounts.google.com",
    )
    .setAudience(claims.aud ?? env.GOOGLE_CLIENT_ID!)
    .setSubject((claims.sub as string | undefined) ?? "synthetic-google-sub")
    .setIssuedAt((claims.iat as number | undefined) ?? Math.floor(now / 1000))
    .setExpirationTime(
      (claims.exp as number | undefined) ?? Math.floor(now / 1000) + 300,
    )
    .sign(keyPair.privateKey);
}

test("auth requires exact configured origin and proxy proof; Sites and forwarded-host headers cannot authenticate", async () => {
  const f = setup();
  try {
    for (const headers of [
      { "x-portal-proxy-secret": "" },
      { "x-portal-forwarded-origin": "https://evil.example" },
      { "x-portal-forwarded-origin": env.APP_ORIGIN + "/" },
      {
        "x-portal-proxy-secret": "spoof",
        "oai-authenticated-user-email": OWNER_EMAIL,
        "oai-authenticated-user-id": "spoof",
        "x-forwarded-host": "portal.example.test",
        "x-forwarded-proto": "https",
      },
    ] as Record<string, string>[]) {
      const response = await f.handler(
        f.request("/api/auth/session", { headers }),
      );
      assert.equal(response.status, 403);
      assert.deepEqual(await response.json(), { error: "UNTRUSTED_PROXY" });
    }
    assert.deepEqual(
      await (
        await f.handler(
          f.request("/api/auth/session", {
            headers: {
              "oai-authenticated-user-email": OWNER_EMAIL,
              "oai-authenticated-user-id": "spoof",
            },
          }),
        )
      ).json(),
      { user: null },
    );
    for (const authEnv of [
      { ...env, AUTH_SECRET: "short" },
      { ...env, AUTH_BASE_URL: "https://evil.example" },
      { ...env, APP_ORIGIN: "http://public.example" },
      { ...env, APP_ORIGIN: env.APP_ORIGIN + "/" },
    ]) {
      assert.throws(() => authConfig(authEnv), /AUTH_NOT_CONFIGURED/);
    }
  } finally {
    f.db.close();
  }
});

test("auth mutations require exact Origin, bounded JSON and known fields; roles cannot be supplied", async () => {
  const f = setup();
  try {
    for (const origin of [
      null,
      "https://evil.example",
      "null",
      env.APP_ORIGIN + "/",
    ]) {
      assert.equal(
        (
          await f.handler(
            f.request("/api/auth/magic/request", {
              body: { email: "builder@gmail.com" },
              origin,
            }),
          )
        ).status,
        403,
      );
    }
    assert.equal(
      (
        await f.handler(
          f.request("/api/auth/magic/request", {
            body: { email: "builder@gmail.com", role: "admin" },
          }),
        )
      ).status,
      422,
    );
    assert.equal(
      (
        await f.handler(
          f.request("/api/auth/google/start", { body: { email: OWNER_EMAIL } }),
        )
      ).status,
      422,
    );
    assert.equal(
      (await f.handler(f.request("/api/auth/magic/request", { rawBody: "{" })))
        .status,
      422,
    );
    assert.equal(
      (
        await f.handler(
          f.request("/api/auth/magic/request", { rawBody: "x".repeat(8193) }),
        )
      ).status,
      413,
    );
    assert.equal(
      (
        await f.handler(
          f.request("/api/auth/magic/request", {
            body: { email: "builder@gmail.com" },
            headers: { "content-type": "text/plain" },
          }),
        )
      ).status,
      415,
    );
    assert.equal(f.sent.length, 0);
    assert.equal((await rows(f.db, "SELECT * FROM users")).length, 0);
  } finally {
    f.db.close();
  }
});

test("relative return paths reject encoded, normalized and auth-loop redirect attacks", () => {
  for (const value of [
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "/%5cevil.example",
    "/%2f%2fevil.example",
    "/a/..//evil.example",
    "/%2e%2e//evil.example",
    "/%25252f%25252fevil.example",
    "/x\r\nLocation: evil",
    "/x%0d%0aevil",
    "/x%",
    "/api/auth/session",
    "/a/../signin",
    "/%61pi/auth/session",
  ]) {
    assert.throws(() => safeReturnTo(value), /INVALID_RETURN_PATH/, value);
  }
  assert.equal(
    safeReturnTo("/dashboard?section=team#members"),
    "/dashboard?section=team#members",
  );
  assert.equal(safeReturnTo(undefined), "/dashboard");
});

test("magic request normalizes email, creates no identity before proof and stores only hashed bearer credentials", async () => {
  const f = setup();
  try {
    const result = await f.magic(
      "  BUILDER@GMAIL.COM ",
      undefined,
      "/dashboard?section=team",
    );
    assert.equal(result.response.status, 202);
    assert.equal(f.sent[0].to, "builder@gmail.com");
    assert.equal(new URL(f.sent[0].url).origin, env.APP_ORIGIN);
    assert.equal(new URL(f.sent[0].url).pathname, "/api/auth/magic/verify");
    assert.equal((await rows(f.db, "SELECT * FROM users")).length, 0);
    const stored = JSON.stringify(
      await rows(f.db, "SELECT * FROM auth_magic_tokens"),
    );
    assert(!stored.includes(result.token));
    assert(!stored.includes(result.cookie.split("=")[1]));
    const header = result.response.headers.getSetCookie()[0];
    assert.match(header, /^__Host-portal-magic=/);
    for (const value of ["Path=/", "HttpOnly", "SameSite=Lax", "Secure"])
      assert(header.includes(value));
    assert(!/Domain=/i.test(header));
    assert.equal(
      result.response.headers.get("cache-control"),
      "no-store, max-age=0",
    );
  } finally {
    f.db.close();
  }
});

test("magic link GET is a scanner-safe confirmation, browser-bound, with same-origin POST required", async () => {
  const f = setup();
  try {
    const result = await f.magic();
    const withoutCookie = await f.handler(
      f.request(`/api/auth/magic/verify?token=${result.token}`),
    );
    assert.equal(withoutCookie.status, 400);
    const get = await f.handler(
      f.request(`/api/auth/magic/verify?token=${result.token}`, {
        cookie: result.cookie,
      }),
    );
    assert.equal(get.status, 200);
    assert.match(
      await get.text(),
      /method="post" action="\/api\/auth\/magic\/verify"/,
    );
    assert.match(
      get.headers.get("content-security-policy")!,
      /form-action 'self'/,
    );
    assert.equal(get.headers.get("referrer-policy"), "no-referrer");
    assert.equal(
      (await rows(f.db, "SELECT * FROM auth_magic_tokens")).length,
      1,
    );
    assert.equal(
      (
        await f.handler(
          f.request("/api/auth/magic/verify", {
            body: { token: result.token },
            cookie: result.cookie,
            origin: "https://evil.example",
          }),
        )
      ).status,
      403,
    );
    const verify = await f.handler(
      f.request("/api/auth/magic/verify", {
        rawBody: new URLSearchParams({ token: result.token }).toString(),
        cookie: result.cookie,
        headers: { "content-type": "application/x-www-form-urlencoded" },
      }),
    );
    assert.equal(verify.status, 303);
    assert.equal(verify.headers.get("location"), "/dashboard");
  } finally {
    f.db.close();
  }
});

test("verified magic login preserves legacy portal ID and server role and grants no client-selected role", async () => {
  const f = setup();
  try {
    f.db.raw
      .prepare("INSERT INTO users VALUES(?,?,?,?,?)")
      .run(
        "legacy-builder",
        "Builder@gmail.com",
        "Existing Builder",
        "judge",
        "2026-10-01",
      );
    const magic = await f.magic("BUILDER@gmail.com");
    const response = await f.verify(magic.token, magic.cookie);
    const sessionCookie = cookieOf(response, "session");
    const session = await authenticateRequest(
      f.request("/api/private", { cookie: sessionCookie }),
      env,
      f.db,
    );
    assert.deepEqual(session, {
      id: "legacy-builder",
      email: "builder@gmail.com",
      name: "Existing Builder",
      source: "neon",
      emailVerified: true,
    });
    assert.equal(
      (
        await one<{ role: string }>(
          f.db,
          "SELECT role FROM users WHERE id='legacy-builder'",
        )
      )?.role,
      "judge",
    );
    assert.deepEqual(
      await (
        await f.handler(
          f.request("/api/auth/session", { cookie: sessionCookie }),
        )
      ).json(),
      {
        user: {
          id: "legacy-builder",
          email: "builder@gmail.com",
          name: "Existing Builder",
          emailVerified: true,
        },
      },
    );
    assert.equal((await rows(f.db, "SELECT * FROM users")).length, 1);
  } finally {
    f.db.close();
  }
});

test("magic tokens are atomically single-use, reject expiration and revoke other pending links", async () => {
  const f = setup();
  try {
    const first = await f.magic();
    const second = await f.magic("builder@gmail.com", first.cookie);
    const simultaneous = await Promise.all([
      f.verify(first.token, first.cookie),
      f.verify(first.token, first.cookie),
    ]);
    assert.deepEqual(
      simultaneous.map((response) => response.status).sort(),
      [303, 400],
    );
    assert.equal((await f.verify(second.token, second.cookie)).status, 400);
    const expiring = await f.magic("other@gmail.com");
    f.tick(MAGIC_TTL);
    assert.equal((await f.verify(expiring.token, expiring.cookie)).status, 400);
    assert.equal((await rows(f.db, "SELECT * FROM auth_sessions")).length, 1);
  } finally {
    f.db.close();
  }
});

test("session credentials rotate, expire, reject shadowed cookies and are revoked by protected signout", async () => {
  const f = setup();
  try {
    const first = await f.magic(),
      signedIn = await f.verify(first.token, first.cookie),
      oldSession = cookieOf(signedIn, "session");
    const second = await f.magic("builder@gmail.com", oldSession);
    const rotated = await f.verify(
        second.token,
        second.cookie + "; " + oldSession,
      ),
      session = cookieOf(rotated, "session");
    assert(session && session !== oldSession);
    assert.equal(
      await authenticateRequest(
        f.request("/", { cookie: oldSession }),
        env,
        f.db,
      ),
      null,
    );
    assert.equal(
      await authenticateRequest(
        f.request("/", { cookie: session + "; " + session }),
        env,
        f.db,
      ),
      null,
    );
    const forged = "__Host-portal-session=" + "x".repeat(43);
    assert.equal(
      await authenticateRequest(f.request("/", { cookie: forged }), env, f.db),
      null,
    );
    const foreign = await f.handler(
      f.request("/api/auth/signout", {
        body: {},
        cookie: session,
        origin: "https://evil.example",
      }),
    );
    assert.equal(foreign.status, 403);
    assert(
      await authenticateRequest(f.request("/", { cookie: session }), env, f.db),
    );
    const signout = await f.handler(
      f.request("/api/auth/signout", {
        body: { returnTo: "/" },
        cookie: session,
      }),
    );
    assert.equal(signout.status, 200);
    assert.equal(signout.headers.getSetCookie().length, 3);
    assert(
      signout.headers
        .getSetCookie()
        .every((cookie) => cookie.includes("Max-Age=0")),
    );
    assert.equal(
      await authenticateRequest(f.request("/", { cookie: session }), env, f.db),
      null,
    );
    const third = await f.magic(),
      newLogin = await f.verify(third.token, third.cookie);
    f.tick(SESSION_TTL);
    assert.deepEqual(
      await (
        await f.handler(
          f.request("/api/auth/session", {
            cookie: cookieOf(newLogin, "session"),
          }),
        )
      ).json(),
      { user: null },
    );
  } finally {
    f.db.close();
  }
});

test("durable normalized-email limits are atomic and reset only after their window", async () => {
  const f = setup();
  try {
    const requests = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        f.magic(i % 2 ? "builder@gmail.com" : " BUILDER@gmail.com "),
      ),
    );
    assert.deepEqual(
      requests.map((result) => result.response.status).sort(),
      [202, 202, 202, 202, 202, 429],
    );
    assert.equal(f.sent.length, 5);
    assert.equal(
      requests
        .find((result) => result.response.status === 429)
        ?.response.headers.get("retry-after"),
      "900",
    );
    f.tick(15 * 60_000);
    assert.equal((await f.magic()).response.status, 202);
  } finally {
    f.db.close();
  }
});

test("SMTP is mandatory without injection, enforces TLS and failed delivery removes tokens", async () => {
  const f = setup({ extra: { sendMagicEmail: undefined } });
  const failing = setup({
    extra: {
      sendMagicEmail: async () => {
        throw new Error("synthetic-private-provider-diagnostic");
      },
    },
  });
  try {
    assert.equal(
      (
        await f.handler(
          f.request("/api/auth/magic/request", {
            body: { email: "builder@gmail.com" },
          }),
        )
      ).status,
      503,
    );
    const base = {
      ...env,
      SMTP_HOST: "smtp.example.test",
      SMTP_USER: "synthetic",
      SMTP_PASSWORD: "synthetic",
      SMTP_FROM: "portal@example.test",
    };
    for (const [port, secure] of [
      ["25", "false"],
      ["587", "true"],
      ["465", "false"],
    ])
      assert.throws(() =>
        smtpConfig({ ...base, SMTP_PORT: port, SMTP_SECURE: secure }),
      );
    const options = smtpConfig({
      ...base,
      SMTP_PORT: "587",
      SMTP_SECURE: "false",
    });
    assert.equal(options.requireTLS, true);
    assert.equal(options.tls.rejectUnauthorized, true);
    const response = await failing.handler(
      failing.request("/api/auth/magic/request", {
        body: { email: "builder@gmail.com" },
      }),
    );
    assert.equal(response.status, 503);
    assert(!JSON.stringify(await response.json()).includes("private-provider"));
    assert.equal(
      (await rows(failing.db, "SELECT * FROM auth_magic_tokens")).length,
      0,
    );
  } finally {
    f.db.close();
    failing.db.close();
  }
});

test("local HTTP uses host-only development cookies and still requires proxy and origin proof", async () => {
  const localEnv = {
    ...env,
    APP_ORIGIN: "http://localhost:3000",
    AUTH_BASE_URL: "http://localhost:3000",
  };
  const f = setup({ authEnv: localEnv });
  try {
    const magic = await f.magic();
    const cookie = magic.response.headers.getSetCookie()[0];
    assert.match(cookie, /^portal-magic=/);
    assert(!cookie.includes("Secure"));
    assert(!cookie.includes("Domain="));
    assert.equal(new URL(f.sent[0].url).origin, "http://localhost:3000");
  } finally {
    f.db.close();
  }
});

test("Google start pins exact browser callback, scopes, state, nonce and S256 PKCE", async () => {
  const f = setup();
  try {
    const start = await f.google();
    assert.equal(start.authorization.origin, "https://accounts.google.com");
    assert.equal(
      start.authorization.searchParams.get("redirect_uri"),
      env.APP_ORIGIN + "/api/auth/callback/google",
    );
    assert.equal(
      start.authorization.searchParams.get("scope"),
      "openid email profile",
    );
    assert.equal(
      start.authorization.searchParams.get("code_challenge_method"),
      "S256",
    );
    const row = await one<{
      pkce_verifier: string;
      state_hash: string;
      nonce: string;
    }>(
      f.db,
      "SELECT pkce_verifier,state_hash,nonce FROM auth_oauth_transactions",
    );
    assert(row);
    assert.equal(
      start.authorization.searchParams.get("code_challenge"),
      pkceChallenge(row.pkce_verifier),
    );
    assert.equal(start.authorization.searchParams.get("nonce"), row.nonce);
    assert.notEqual(row.state_hash, start.state);
    assert.equal(f.exchanges.length, 0);
    assert.equal(
      (await f.handler(f.request("/api/auth/google/start"))).status,
      405,
    );
  } finally {
    f.db.close();
  }
});

test("Google callback requires browser-bound, unexpired, single-use state before exchanging a code", async () => {
  const f = setup();
  try {
    const first = await f.google();
    assert.equal((await f.callback("x".repeat(43), first.cookie)).status, 400);
    assert.equal(
      (await f.callback(first.state, "__Host-portal-oauth=" + "x".repeat(43)))
        .status,
      400,
    );
    assert.equal(
      (await f.callback(first.state, first.cookie, "&state=duplicate")).status,
      400,
    );
    assert.equal(f.exchanges.length, 0);
    const simultaneous = await Promise.all([
      f.callback(first.state, first.cookie),
      f.callback(first.state, first.cookie),
    ]);
    assert.deepEqual(
      simultaneous.map((response) => response.status).sort(),
      [303, 400],
    );
    assert.equal(f.exchanges.length, 1);
    assert.equal(
      (f.exchanges[0] as { redirectUri: string }).redirectUri,
      env.APP_ORIGIN + "/api/auth/callback/google",
    );
    const second = await f.google();
    f.tick(OAUTH_TTL);
    assert.equal((await f.callback(second.state, second.cookie)).status, 400);
    assert.equal(f.exchanges.length, 1);
  } finally {
    f.db.close();
  }
});

test("Google JWT verification rejects bad audience, issuer, expiry, nonce, verification, authorized party and future issue time", async () => {
  const now = Date.now();
  const cases: JWTPayload[] = [
    { aud: "attacker-client" },
    { iss: "https://evil.example" },
    { exp: Math.floor(now / 1000) - 60 },
    { nonce: "wrong-nonce" },
    { email_verified: false },
    { email_verified: "true" },
    { email: "invalid" },
    { azp: "attacker-client" },
    { aud: [env.GOOGLE_CLIENT_ID!, "second-client"] },
    { iat: Math.floor(now / 1000) + 60 },
  ];
  for (const claims of cases) {
    const token = await signed(claims, now);
    await assert.rejects(
      () =>
        verifyGoogleIdToken(
          token,
          env.GOOGLE_CLIENT_ID!,
          "offline-nonce",
          now,
          keys,
        ),
      (error: unknown) => error instanceof Error,
      JSON.stringify(claims),
    );
  }
  const valid = await signed({}, now);
  const pieces = valid.split(".");
  pieces[2] = (pieces[2][0] === "a" ? "b" : "a") + pieces[2].slice(1);
  await assert.rejects(() =>
    verifyGoogleIdToken(
      pieces.join("."),
      env.GOOGLE_CLIENT_ID!,
      "offline-nonce",
      now,
      keys,
    ),
  );
  assert.equal(
    (
      await verifyGoogleIdToken(
        valid,
        env.GOOGLE_CLIENT_ID!,
        "offline-nonce",
        now,
        keys,
      )
    ).email_verified,
    true,
  );
});

test("Google verified email links to the same proven identity; a different subject or changed email cannot take over", async () => {
  const f = setup();
  try {
    const magic = await f.magic(),
      verified = await f.verify(magic.token, magic.cookie);
    const magicIdentity = await authenticateRequest(
      f.request("/", { cookie: cookieOf(verified, "session") }),
      env,
      f.db,
    );
    const google = await f.google(),
      callback = await f.callback(google.state, google.cookie);
    assert.equal(callback.status, 303);
    const googleIdentity = await authenticateRequest(
      f.request("/", { cookie: cookieOf(callback, "session") }),
      env,
      f.db,
    );
    assert.equal(googleIdentity?.id, magicIdentity?.id);
    assert.equal((await rows(f.db, "SELECT * FROM users")).length, 1);
    f.setClaims({
      sub: "attacker-sub",
      email: "builder@gmail.com",
      email_verified: true,
    });
    const attacker = await f.google();
    assert.equal(
      (await f.callback(attacker.state, attacker.cookie)).status,
      409,
    );
    f.setClaims({
      sub: "synthetic-google-sub",
      email: "different@gmail.com",
      email_verified: true,
    });
    const changed = await f.google();
    assert.equal((await f.callback(changed.state, changed.cookie)).status, 409);
    assert.equal((await rows(f.db, "SELECT * FROM auth_sessions")).length, 2);
  } finally {
    f.db.close();
  }
});

test("external Google accounts need fresh mailbox proof; authoritative Workspace and Gmail identities can sign in", async () => {
  const external = setup({ claims: { email: "builder@external.example" } });
  const workspace = setup({
    claims: { email: "builder@workspace.example", hd: "workspace.example" },
  });
  try {
    const attempt = await external.google(),
      rejected = await external.callback(attempt.state, attempt.cookie);
    assert.equal(rejected.status, 403);
    assert.match(
      await rejected.text(),
      /Use an email sign-in link to verify this email address/,
    );
    assert.equal((await rows(external.db, "SELECT * FROM users")).length, 0);
    const accepted = await workspace.google();
    assert.equal(
      (await workspace.callback(accepted.state, accepted.cookie)).status,
      303,
    );
  } finally {
    external.db.close();
    workspace.db.close();
  }
});

test("owner authority requires verified normalized identity and cannot come from arbitrary localOwner on a hosted identity", () => {
  const user = {
    id: "synthetic",
    email: " CONNECTWITHPARAM.30@GMAIL.COM ",
    name: "Synthetic",
    source: "neon" as const,
  };
  assert.equal(isOwner(user), false);
  assert.equal(isOwner({ ...user, localOwner: true }), false);
  assert.equal(isOwner({ ...user, emailVerified: true }), true);
  assert.equal(
    isOwner({
      ...user,
      email: "other@gmail.com",
      emailVerified: true,
      localOwner: true,
    }),
    false,
  );
});

test("a portal email change invalidates a previously issued session rather than moving its authority", async () => {
  const f = setup();
  try {
    const magic = await f.magic(),
      signedIn = await f.verify(magic.token, magic.cookie),
      cookie = cookieOf(signedIn, "session");
    f.db.raw.prepare("UPDATE users SET email='other@gmail.com'").run();
    assert.equal(
      await authenticateRequest(f.request("/", { cookie }), env, f.db),
      null,
    );
    const stored = await rows<{ token_hash: string }>(
      f.db,
      "SELECT token_hash FROM auth_sessions",
    );
    assert.equal(
      stored[0].token_hash,
      tokenHash(config, "session", cookie.split("=")[1]),
    );
  } finally {
    f.db.close();
  }
});
