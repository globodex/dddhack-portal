import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { setup } from "./helpers";
import { createPGliteFixture } from "./neon-db-fixture";
import { fixtures, seedLocal, LOCAL_CREDIT_KEY } from "../scripts/fixtures";
import { batch, one, rows, type Database } from "../lib/db";
import { PortalService } from "../lib/service";
import { SIGN_IN_EVIDENCE_ACTION } from "../lib/sign-in-evidence";
import { createAuthHandler, type AuthEnv } from "../neon/auth";
import { authConfig, cookieName, tokenHash } from "../neon/auth/config";
import type { MagicMessage } from "../neon/auth/smtp";

const observed = "2026-10-24T11:00:00.000Z";
const env: AuthEnv = {
  APP_ORIGIN: "https://signin-evidence.example.test",
  AUTH_SECRET: "synthetic-evidence-auth-secret-at-least-32-characters",
  PORTAL_PROXY_SECRET: "synthetic-evidence-proxy-secret-at-least-32-characters",
  GOOGLE_CLIENT_ID: "synthetic-evidence.apps.googleusercontent.com",
  GOOGLE_CLIENT_SECRET: "synthetic-evidence-google-secret",
};
const config = authConfig(env);
const authSQL = readFileSync(
  new URL("../neon/auth-migrations/0001_auth.sql", import.meta.url),
  "utf8",
);
type Evidence = {
  id: string;
  actor_id: string;
  action: string;
  entity_id: string;
  detail: string;
  reason: string;
  created_at: string;
};

function request(path: string, body?: unknown, cookie?: string) {
  return new Request("https://backend.example.test" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "x-portal-proxy-secret": env.PORTAL_PROXY_SECRET!,
      "x-portal-forwarded-origin": env.APP_ORIGIN!,
      ...(body === undefined
        ? {}
        : { origin: env.APP_ORIGIN!, "content-type": "application/json" }),
      ...(cookie ? { cookie } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
function cookie(response: Response, kind: "magic" | "oauth" | "session") {
  const prefix = cookieName(config, kind) + "=";
  return (
    response.headers
      .getSetCookie()
      .find((value) => value.startsWith(prefix))
      ?.split(";")[0] || ""
  );
}
async function fixture(engine: "sqlite" | "postgres") {
  const pg = engine === "postgres" ? await createPGliteFixture() : null;
  const local = pg ? null : await setup();
  const db = pg?.db || local!.db;
  if (pg) {
    await pg.engine.exec(authSQL); // Disposable local auth schema; never a hosted migration.
    await seedLocal(db);
  } else local!.db.raw.exec(authSQL);
  let now = Date.parse(observed);
  let failure: "session" | "marker" | null = null;
  const faultDB: Database = {
    prepare(sql) {
      if (
        (failure === "session" && /^INSERT INTO auth_sessions/.test(sql)) ||
        (failure === "marker" && /^INSERT INTO audit_logs/.test(sql))
      ) {
        return db.prepare(
          "INSERT INTO intentionally_missing_signin_test_table VALUES(1)",
        );
      }
      return db.prepare(sql);
    },
    batch: (statements) => db.batch(statements),
  };
  const sent: MagicMessage[] = [];
  const handler = createAuthHandler(env, faultDB, {
    now: () => now,
    sendMagicEmail: async (message) => {
      sent.push(message);
    },
    exchangeGoogleCode: async () => "synthetic-mocked-google-id-token",
    verifyGoogleIdToken: async () => ({
      sub: "synthetic-evidence-subject",
      email: "synthetic.evidence@gmail.com",
      email_verified: true,
      name: "Synthetic Evidence",
    }),
  });
  async function magic(email: string) {
    const response = await handler(
      request("/api/auth/magic/request", { email }),
    );
    assert.equal(response.status, 202);
    const token = new URL(sent.at(-1)!.url).searchParams.get("token")!;
    return { token, cookie: cookie(response, "magic") };
  }
  const evidence = () =>
    rows<Evidence>(
      db,
      "SELECT * FROM audit_logs WHERE action=? ORDER BY id",
      SIGN_IN_EVIDENCE_ACTION,
    );
  const service = (who: string) =>
    new PortalService(db, fixtures[who], LOCAL_CREDIT_KEY, () =>
      new Date(now).toISOString(),
    );
  return {
    db,
    handler,
    magic,
    evidence,
    service,
    setFailure: (value: typeof failure) => {
      failure = value;
    },
    tick: (ms: number) => {
      now += ms;
    },
    close: async () => {
      if (pg) await pg.pool.end();
      else local!.db.close();
    },
  };
}
function verifyMarker(marker: Evidence, kind: string) {
  assert.equal(marker.id, "auth-sign-in:" + marker.actor_id);
  assert.equal(marker.entity_id, marker.actor_id);
  assert.deepEqual(JSON.parse(marker.detail), { version: 1, evidence: kind });
  assert.equal(marker.created_at, observed);
  assert.ok(!/[\s@]/.test(marker.entity_id));
  assert.ok(
    !/email|token|secret|provider|ipAddress|firstLogin/.test(marker.detail),
  );
}

for (const engine of ["sqlite", "postgres"] as const) {
  test(`${engine}: issued magic/Google sessions create one durable marker atomically; auth-user creation and failed issuance do not`, async (t) => {
    t.mock.method(globalThis, "fetch", () => {
      throw new Error("Synthetic sign-in evidence tests forbid network calls");
    });
    const f = await fixture(engine);
    try {
      assert.equal(
        (await f.evidence()).length,
        0,
        "Seeded users and profiles are not login evidence",
      );
      const magic = await f.magic("alice@portal.test");
      assert.equal(
        (await f.evidence()).length,
        0,
        "Requesting a magic link is not session issuance",
      );
      const signedIn = await f.handler(
        request("/api/auth/magic/verify", { token: magic.token }, magic.cookie),
      );
      assert.equal(signedIn.status, 303);
      assert.ok(cookie(signedIn, "session"));
      verifyMarker((await f.evidence())[0], "session-issued");
      assert.equal(
        (
          await rows(
            f.db,
            "SELECT * FROM auth_sessions WHERE auth_user_id='fake_alice'",
          )
        ).length,
        1,
      );
      const original = (await f.evidence())[0];
      f.tick(30_000);
      const repeat = await f.magic("alice@portal.test");
      assert.equal(
        (
          await f.handler(
            request(
              "/api/auth/magic/verify",
              { token: repeat.token },
              repeat.cookie,
            ),
          )
        ).status,
        303,
      );
      assert.deepEqual(
        (await f.evidence())[0],
        original,
        "Observed first marker is immutable across later sessions",
      );

      const google = await f.handler(request("/api/auth/google/start", {}));
      assert.equal(google.status, 200);
      const redirect = new URL(((await google.json()) as any).redirectTo);
      const callback = await f.handler(
        request(
          "/api/auth/callback/google?state=" +
            redirect.searchParams.get("state") +
            "&code=synthetic-only",
          undefined,
          cookie(google, "oauth"),
        ),
      );
      assert.equal(callback.status, 303);
      assert.equal((await f.evidence()).length, 2);

      for (const [failure, email] of [
        ["session", "bob@portal.test"],
        ["marker", "carol@portal.test"],
      ] as const) {
        const pending = await f.magic(email);
        const before = await f.evidence();
        f.setFailure(failure);
        const failed = await f.handler(
          request(
            "/api/auth/magic/verify",
            { token: pending.token },
            pending.cookie,
          ),
        );
        f.setFailure(null);
        assert.equal(failed.status, 503);
        assert.equal(cookie(failed, "session"), "");
        assert.ok(
          !/intentionally_missing|SQL|token|secret/.test(await failed.text()),
        );
        const user = await one<{ id: string }>(
          f.db,
          "SELECT id FROM auth_users WHERE email=?",
          email,
        );
        assert.ok(
          user,
          "Verified auth-user creation may persist before a failed issuance",
        );
        assert.equal(
          (
            await rows(
              f.db,
              "SELECT * FROM auth_sessions WHERE auth_user_id=?",
              user.id,
            )
          ).length,
          0,
          "Marker failure must roll back the just-inserted session",
        );
        assert.deepEqual(
          await f.evidence(),
          before,
          "Failed session insertion cannot produce sign-in evidence",
        );
      }
      await f.magic("pending@portal.test"); // Cleanup must not promote the failed auth-user rows.
      assert.equal((await f.evidence()).length, 2);
    } finally {
      await f.close();
    }
  });

  test(`${engine}: cleanup/logout retain only provable matching legacy sessions, including expired sessions, without inventing dates`, async (t) => {
    t.mock.method(globalThis, "fetch", () => {
      throw new Error("Synthetic sign-in evidence tests forbid network calls");
    });
    const f = await fixture(engine);
    try {
      const now = Date.parse(observed);
      await batch(f.db, [
        [
          "INSERT INTO auth_users VALUES('fake_alice','alice@portal.test','Synthetic','2026-10-01')",
        ],
        [
          "INSERT INTO auth_users VALUES('fake_bob','mismatched@portal.test','Synthetic','2026-10-01')",
        ],
        [
          "INSERT INTO auth_users VALUES('fake_carol','carol@portal.test','Synthetic','2026-10-01')",
        ],
        [
          "INSERT INTO auth_users VALUES('fake_dave','dave@portal.test','Synthetic','2026-10-01')",
        ],
        [
          "INSERT INTO auth_users VALUES('fake_gina','gina@portal.test','Synthetic','')",
        ],
        [
          "INSERT INTO auth_sessions VALUES('synthetic-legacy-alice-expired','fake_alice',?)",
          now - 1,
        ],
        [
          "INSERT INTO auth_sessions VALUES('synthetic-legacy-alice-live','fake_alice',?)",
          now + 60000,
        ],
        [
          "INSERT INTO auth_sessions VALUES('synthetic-legacy-bob','fake_bob',?)",
          now - 1,
        ],
        [
          "INSERT INTO auth_sessions VALUES('synthetic-legacy-carol','fake_carol',?)",
          now - 1,
        ],
        [
          "INSERT INTO auth_sessions VALUES('synthetic-legacy-gina','fake_gina',?)",
          now - 1,
        ],
      ]);
      const before = await rows(
        f.db,
        "SELECT * FROM auth_sessions ORDER BY token_hash",
      );
      assert.equal((await f.evidence()).length, 0);
      await f.magic("pending@portal.test");
      const captured = await f.evidence();
      assert.deepEqual(
        captured.map((r) => r.actor_id),
        ["fake_alice", "fake_carol"],
      );
      for (const marker of captured) verifyMarker(marker, "retained-session");
      assert.equal((await rows(f.db, "SELECT * FROM auth_sessions")).length, 1);
      assert.equal(before.length, 5);

      const legacyToken = "l".repeat(43);
      await batch(f.db, [
        [
          "INSERT INTO auth_users VALUES('fake_eve','eve@portal.test','Synthetic','2026-10-01')",
        ],
        [
          "INSERT INTO auth_sessions VALUES(?,'fake_eve',?)",
          tokenHash(config, "session", legacyToken),
          now - 1,
        ],
      ]);
      const sessionCookie = cookieName(config, "session") + "=" + legacyToken;
      f.setFailure("marker");
      const failedLogout = await f.handler(
        request("/api/auth/signout", {}, sessionCookie),
      );
      f.setFailure(null);
      assert.equal(failedLogout.status, 503);
      assert.equal(
        (
          await rows(
            f.db,
            "SELECT * FROM auth_sessions WHERE auth_user_id='fake_eve'",
          )
        ).length,
        1,
      );
      assert.equal(
        (await f.evidence()).length,
        2,
        "Failed capture and deletion roll back together",
      );
      const logout = await f.handler(
        request("/api/auth/signout", {}, sessionCookie),
      );
      assert.equal(logout.status, 200);
      assert.equal(
        (
          await rows(
            f.db,
            "SELECT * FROM auth_sessions WHERE auth_user_id='fake_eve'",
          )
        ).length,
        0,
      );
      verifyMarker(
        (await f.evidence()).find((r) => r.actor_id === "fake_eve")!,
        "retained-session",
      );
      f.tick(120000);
      await f.magic("other-synthetic@portal.test");
      assert.equal((await rows(f.db, "SELECT * FROM auth_sessions")).length, 0);
      assert.deepEqual(
        (await f.evidence()).filter((r) => r.actor_id !== "fake_eve"),
        captured,
      );
      assert.equal((await f.evidence()).length, 3);
    } finally {
      await f.close();
    }
  });

  test(`${engine}: only validated nonremoved Sites/Neon actor requests count; local fixtures, unverified identities and terminal users do not`, async (t) => {
    t.mock.method(globalThis, "fetch", () => {
      throw new Error("Synthetic sign-in evidence tests forbid network calls");
    });
    const f = await fixture(engine);
    try {
      for (const who of ["owner", "admin", "alice", "stranger"])
        await f.service(who).actor();
      assert.equal((await f.evidence()).length, 0);
      const sites = new PortalService(
        f.db,
        { ...fixtures.alice, source: "sites", emailVerified: true },
        LOCAL_CREDIT_KEY,
        () => observed,
      );
      await Promise.all(Array.from({ length: 3 }, () => sites.actor()));
      const neon = new PortalService(
        f.db,
        { ...fixtures.bob, source: "neon", emailVerified: true },
        LOCAL_CREDIT_KEY,
        () => observed,
      );
      await Promise.all(Array.from({ length: 3 }, () => neon.actor()));
      const markers = await f.evidence();
      assert.deepEqual(
        markers.map((r) => r.actor_id),
        ["fake_alice", "fake_bob"],
      );
      for (const marker of markers)
        verifyMarker(marker, "authenticated-request");
      for (const identity of [
        { ...fixtures.carol, source: "sites" as const },
        { ...fixtures.dave, source: "neon" as const, emailVerified: false },
        { ...fixtures.eve, emailVerified: true },
      ])
        await new PortalService(
          f.db,
          identity,
          undefined,
          () => observed,
        ).actor();
      await f
        .service("owner")
        .command("participant-deactivate", {
          userId: "fake_frank",
          confirmation: "REMOVE_PARTICIPANT",
        });
      const removed = new PortalService(
        f.db,
        { ...fixtures.frank, source: "sites", emailVerified: true },
        undefined,
        () => observed,
      );
      assert.equal((await removed.actor()).deactivated, true);
      await f
        .service("owner")
        .command("admin-delete-participant", {
          userId: "fake_gina",
          expectedLeaderTeamIds: [],
          confirmation: "DELETE_PARTICIPANT",
        });
      await assert.rejects(
        new PortalService(
          f.db,
          { ...fixtures.gina, source: "neon", emailVerified: true },
          undefined,
          () => observed,
        ).actor(),
        { code: "PARTICIPANT_REMOVED" },
      );
      await assert.rejects(
        new PortalService(f.db, null, undefined, () => observed).actor(),
        { code: "SIGN_IN_REQUIRED" },
      );
      assert.deepEqual(await f.evidence(), markers);
      await assert.rejects(
        batch(f.db, [
          [
            "UPDATE audit_logs SET detail='{}' WHERE id='auth-sign-in:fake_alice'",
          ],
        ]),
        /IMMUTABLE/,
      );
    } finally {
      await f.close();
    }
  });
}
