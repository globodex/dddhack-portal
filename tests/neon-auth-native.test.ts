import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { Pool } from "pg";
import { one, rows } from "../lib/db";
import { PortalService } from "../lib/service";
import { LOCAL_CREDIT_KEY, seedLocal } from "../scripts/fixtures";
import {
  authenticateRequest,
  createAuthHandler,
  type AuthEnv,
} from "../neon/auth";
import { authConfig, cookieName, tokenHash } from "../neon/auth/config";
import type { MagicMessage } from "../neon/auth/smtp";
import { createPostgresDatabase, type PostgresPool } from "../neon/db/adapter";
import {
  applyPortalMigrations,
  loadPortalMigrations,
} from "../neon/db/migrate";

const configured = process.env.PORTAL_TEST_POSTGRES_URL;
if (
  configured &&
  !["127.0.0.1", "localhost", "[::1]"].includes(new URL(configured).hostname)
) {
  throw new Error("POSTGRES_AUTH_TEST_REQUIRES_LOOPBACK");
}
const env: AuthEnv = {
  APP_ORIGIN: "https://portal.example.test",
  AUTH_BASE_URL: "https://portal.example.test",
  AUTH_SECRET: "synthetic-native-auth-secret-at-least-32-characters",
  PORTAL_PROXY_SECRET: "synthetic-native-proxy-secret-at-least-32-characters",
};
const config = authConfig(env);

function cookie(response: Response, kind: "magic" | "session") {
  const name = cookieName(config, kind);
  const value = response.headers
    .getSetCookie()
    .find((item) => item.startsWith(name + "="));
  assert.ok(value, `${kind} cookie must be set`);
  assert.match(value, /; Path=\/; HttpOnly; SameSite=Lax;/);
  assert.match(value, /; Secure$/);
  assert.ok(!/; Domain=/i.test(value));
  return value.split(";")[0];
}

type RequestOptions = {
  body?: Record<string, unknown>;
  cookie?: string;
  headers?: Record<string, string>;
  form?: URLSearchParams;
};
function request(path: string, options: RequestOptions = {}) {
  const method = options.body || options.form ? "POST" : "GET";
  return new Request("https://backend.example.test" + path, {
    method,
    headers: {
      "x-portal-proxy-secret": env.PORTAL_PROXY_SECRET!,
      "x-portal-forwarded-origin": env.APP_ORIGIN!,
      ...(method === "POST"
        ? {
            origin: env.APP_ORIGIN!,
            "content-type": options.form
              ? "application/x-www-form-urlencoded"
              : "application/json",
          }
        : {}),
      ...(options.cookie ? { cookie: options.cookie } : {}),
      ...options.headers,
    },
    ...(method === "POST"
      ? {
          body: options.form?.toString() ?? JSON.stringify(options.body),
        }
      : {}),
  });
}

async function withNativeAuth(
  run: (context: {
    db: ReturnType<typeof createPostgresDatabase>;
    handler: ReturnType<typeof createAuthHandler>;
    sent: MagicMessage[];
    start: (
      email: string,
      returnTo?: string,
    ) => Promise<{ browser: string; token: string }>;
  }) => Promise<void>,
) {
  const admin = new Pool({ connectionString: configured, max: 1 });
  const schema = "portal_auth_synthetic_" + randomUUID().replaceAll("-", "");
  let created = false;
  let db: ReturnType<typeof createPostgresDatabase> | undefined;
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    created = true;
    const pool = new Pool({
      connectionString: configured,
      max: 8,
      options: `-c search_path=${schema},public`,
    });
    db = createPostgresDatabase(pool as unknown as PostgresPool, {
      retries: 10,
    });
    const authSQL = await readFile(
      new URL("../neon/auth-migrations/0001_auth.sql", import.meta.url),
      "utf8",
    );
    const plan = [
      ...(await loadPortalMigrations()),
      {
        name: "0100_auth.sql",
        sql: authSQL,
        checksum: createHash("sha256").update(authSQL).digest("hex"),
      },
    ];
    const applied = await applyPortalMigrations(
      pool as unknown as PostgresPool,
      plan,
    );
    assert.equal(
      applied.at(-1),
      "0100_auth.sql",
      "auth DDL follows portal FKs",
    );
    assert.deepEqual(
      await applyPortalMigrations(pool as unknown as PostgresPool, plan),
      [],
      "the combined synthetic migration plan is repeat-safe",
    );
    await seedLocal(db);
    const sent: MagicMessage[] = [];
    const handler = createAuthHandler(env, db, {
      sendMagicEmail: async (message) => {
        sent.push(message);
      },
      exchangeGoogleCode: async () => {
        throw new Error("GOOGLE_NETWORK_FORBIDDEN");
      },
      verifyGoogleIdToken: async () => {
        throw new Error("GOOGLE_NETWORK_FORBIDDEN");
      },
    });
    const start = async (email: string, returnTo = "/dashboard") => {
      const before = sent.length;
      const response = await handler(
        request("/api/auth/magic/request", {
          body: { email, returnTo },
        }),
      );
      assert.equal(response.status, 202, await response.clone().text());
      assert.equal(
        response.headers.get("cache-control"),
        "no-store, max-age=0",
      );
      assert.equal(sent.length, before + 1, "SMTP is captured in memory only");
      const message = sent.at(-1)!;
      assert.equal(message.to, email.trim().toLowerCase());
      const link = new URL(message.url);
      assert.equal(link.origin, env.APP_ORIGIN);
      assert.equal(link.pathname, "/api/auth/magic/verify");
      const token = link.searchParams.get("token")!;
      assert.match(token, /^[A-Za-z0-9_-]{43}$/);
      assert.ok(!(await response.text()).includes(token));
      return { browser: cookie(response, "magic"), token };
    };
    await run({ db, handler, sent, start });
  } finally {
    await db?.close();
    if (created) await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  }
}

test(
  "native PostgreSQL magic link GET confirms without consumption, POST has one winner, and session resolves preserved portal staff",
  { skip: !configured },
  async () => {
    await withNativeAuth(async ({ db, handler, start }) => {
      const original = await one(
        db,
        "SELECT id,email,name,role FROM users WHERE id='fake_admin'",
      );
      const { browser, token } = await start(
        " ADMIN@PORTAL.TEST ",
        "/admin/participants",
      );
      const hashed = tokenHash(config, "magic", token);
      assert.equal(
        (
          await one(
            db,
            "SELECT token_hash FROM auth_magic_tokens WHERE token_hash=?",
            hashed,
          )
        )?.token_hash,
        hashed,
      );
      for (let scan = 0; scan < 2; scan++) {
        const confirmation = await handler(
          request(`/api/auth/magic/verify?token=${token}`, { cookie: browser }),
        );
        assert.equal(confirmation.status, 200);
        assert.match(
          await confirmation.text(),
          /<form method="post" action="\/api\/auth\/magic\/verify">/,
        );
        assert.equal(confirmation.headers.get("set-cookie"), null);
        assert.equal(
          (await one(db, "SELECT count(*) n FROM auth_magic_tokens"))?.n,
          1,
        );
        assert.equal(
          (await one(db, "SELECT count(*) n FROM auth_sessions"))?.n,
          0,
        );
      }
      for (const otherBrowser of [
        undefined,
        `${cookieName(config, "magic")}=${"B".repeat(43)}`,
      ]) {
        const wrongBrowser = await handler(
          request(`/api/auth/magic/verify?token=${token}`, {
            cookie: otherBrowser,
          }),
        );
        assert.equal(wrongBrowser.status, 400);
      }
      const badOrigin = await handler(
        request("/api/auth/magic/verify", {
          body: { token },
          cookie: browser,
          headers: { origin: "https://attacker.example.test" },
        }),
      );
      assert.equal(badOrigin.status, 403);
      assert.equal(
        (await one(db, "SELECT count(*) n FROM auth_magic_tokens"))?.n,
        1,
      );
      const verified = await Promise.all(
        [0, 1].map(() =>
          handler(
            request("/api/auth/magic/verify", {
              form: new URLSearchParams({ token }),
              cookie: browser,
            }),
          ),
        ),
      );
      assert.deepEqual(
        verified.map((response) => response.status).sort(),
        [303, 400],
      );
      const success = verified.find((response) => response.status === 303)!;
      assert.equal(success.headers.get("location"), "/admin/participants");
      const session = cookie(success, "session");
      assert.equal(
        (await one(db, "SELECT count(*) n FROM auth_magic_tokens"))?.n,
        0,
      );
      assert.equal(
        (await one(db, "SELECT count(*) n FROM auth_sessions"))?.n,
        1,
      );
      assert.deepEqual(
        await one(
          db,
          "SELECT id,email,name,role FROM users WHERE id='fake_admin'",
        ),
        original,
      );
      assert.equal(
        (
          await one(
            db,
            "SELECT count(*) n FROM users WHERE lower(email)='admin@portal.test'",
          )
        )?.n,
        1,
      );
      const identity = await authenticateRequest(
        request("/api/bootstrap", { cookie: session }),
        env,
        db,
      );
      assert.deepEqual(identity, {
        id: "fake_admin",
        email: "admin@portal.test",
        name: "Admin",
        source: "neon",
        emailVerified: true,
      });
      const staff = new PortalService(db, identity, LOCAL_CREDIT_KEY);
      assert.equal((await staff.staff()).role, "admin");
      assert.ok((await staff.view("/admin/participants")).items);
      const projection = await handler(
        request("/api/auth/session", { cookie: session }),
      );
      assert.deepEqual(await projection.json(), {
        user: {
          id: "fake_admin",
          email: "admin@portal.test",
          name: "Admin",
          emailVerified: true,
        },
      });
      const signout = await handler(
        request("/api/auth/signout", {
          body: { returnTo: "/" },
          cookie: session,
        }),
      );
      assert.equal(signout.status, 200);
      assert.equal(
        await authenticateRequest(
          request("/api/bootstrap", { cookie: session }),
          env,
          db,
        ),
        null,
      );
      assert.equal(
        (await one(db, "SELECT count(*) n FROM auth_sessions"))?.n,
        0,
      );
    });
  },
);

test(
  "native PostgreSQL verified login grants no viewer role escalation and ignores spoofed identity and cookies",
  { skip: !configured },
  async () => {
    await withNativeAuth(async ({ db, handler, start }) => {
      const { browser, token } = await start("native-viewer@portal.test");
      const response = await handler(
        request("/api/auth/magic/verify", { body: { token }, cookie: browser }),
      );
      assert.equal(response.status, 303);
      const session = cookie(response, "session");
      const identity = await authenticateRequest(
        request("/api/bootstrap", { cookie: session }),
        env,
        db,
      );
      assert.ok(identity);
      assert.match(identity.id, /^neon_/);
      assert.equal(
        (await one(db, "SELECT role FROM users WHERE id=?", identity.id))?.role,
        "participant",
      );
      const viewer = new PortalService(db, identity, LOCAL_CREDIT_KEY);
      assert.equal((await viewer.actor()).mode, "viewer");
      await assert.rejects(viewer.staff(), { code: "ADMIN_REQUIRED" });
      await assert.rejects(
        viewer.command("complete-profile", {
          displayName: "Synthetic Viewer",
          gender: "non-binary",
          bio: "Synthetic builder profile",
        }),
        { code: "VIEWER_READ_ONLY" },
      );
      const spoof = request("/api/bootstrap", {
        headers: {
          "oai-authenticated-user-id": "fake_admin",
          "oai-authenticated-user-email": "admin@portal.test",
          "x-portal-role": "admin",
        },
      });
      const spoofedIdentity = await authenticateRequest(spoof, env, db);
      assert.equal(spoofedIdentity, null);
      await assert.rejects(
        new PortalService(db, spoofedIdentity, LOCAL_CREDIT_KEY).staff(),
        { code: "SIGN_IN_REQUIRED" },
      );
      const name = cookieName(config, "session");
      for (const invalid of [
        `${name}=${"A".repeat(43)}`,
        `${session}; ${session}`,
      ]) {
        assert.equal(
          await authenticateRequest(
            request("/api/bootstrap", { cookie: invalid }),
            env,
            db,
          ),
          null,
        );
      }
      const missingProxy = await handler(
        request("/api/auth/session", {
          cookie: session,
          headers: { "x-portal-proxy-secret": "spoof" },
        }),
      );
      assert.equal(missingProxy.status, 403);
      const roleInput = await handler(
        request("/api/auth/magic/request", {
          body: { email: "escalation@portal.test", role: "admin" },
        }),
      );
      assert.equal(roleInput.status, 422);
      assert.equal(
        (
          await one(
            db,
            "SELECT count(*) n FROM users WHERE email='escalation@portal.test'",
          )
        )?.n,
        0,
      );
      assert.equal(
        (
          await one(
            db,
            "SELECT count(*) n FROM portal_roles WHERE user_id=?",
            identity.id,
          )
        )?.n,
        0,
      );
    });
  },
);

test(
  "native PostgreSQL sessions recheck current portal roles and reject a changed verified-email binding",
  { skip: !configured },
  async () => {
    await withNativeAuth(async ({ db, handler, start }) => {
      const { browser, token } = await start("admin@portal.test");
      const response = await handler(
        request("/api/auth/magic/verify", { body: { token }, cookie: browser }),
      );
      assert.equal(response.status, 303);
      const session = cookie(response, "session");
      const identity = await authenticateRequest(
        request("/api/bootstrap", { cookie: session }),
        env,
        db,
      );
      const service = new PortalService(db, identity, LOCAL_CREDIT_KEY);
      assert.equal((await service.staff()).id, "fake_admin");
      await db
        .prepare("INSERT INTO portal_roles VALUES(?,?,?,?)")
        .bind(
          "fake_admin",
          "participant",
          "fake_owner",
          new Date().toISOString(),
        )
        .all();
      await assert.rejects(service.staff(), { code: "ADMIN_REQUIRED" });
      assert.equal(
        (await one(db, "SELECT role FROM users WHERE id='fake_admin'"))?.role,
        "admin",
        "login did not overwrite the legacy server role",
      );
      await db
        .prepare("UPDATE users SET email=? WHERE id=?")
        .bind("changed-admin@portal.test", "fake_admin")
        .all();
      assert.equal(
        await authenticateRequest(
          request("/api/bootstrap", { cookie: session }),
          env,
          db,
        ),
        null,
      );
      assert.deepEqual(
        await (
          await handler(request("/api/auth/session", { cookie: session }))
        ).json(),
        { user: null },
      );
      assert.equal(
        (
          await rows(
            db,
            "SELECT id FROM auth_users WHERE email='admin@portal.test'",
          )
        ).length,
        1,
      );
    });
  },
);
