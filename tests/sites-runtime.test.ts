import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { Miniflare } from "miniflare";
import {
  runWithSitesRequest,
  getSitesRuntime,
  protectedPath,
} from "../lib/sites-runtime";
import { handlePortal, handleExport } from "../lib/http";
import { seedLocal, LOCAL_CREDIT_KEY } from "../scripts/fixtures";
import { rows, type Database } from "../lib/db";
import { setup } from "./helpers";

const trusted = {
  PORTAL_RUNTIME: "sites",
  PORTAL_TRUST_SITES_DISPATCH: "true",
  CREDIT_ENCRYPTION_KEY: LOCAL_CREDIT_KEY,
};
function request(
  user?: string,
  email?: string,
  path = "/api/portal?view=/dashboard",
) {
  return new Request("https://portal.test" + path, {
    headers: user
      ? {
          "oai-authenticated-user-id": user,
          "oai-authenticated-user-email": email || user + "@portal.test",
        }
      : {},
  });
}
test("Worker request scope isolates concurrent identities, bindings and keys; no fallback outside Dispatch", async () => {
  const { db } = await setup();
  assert.throws(() => getSitesRuntime(), /SITES_DISPATCH_NOT_CONFIGURED/);
  const outcomes = await Promise.all(
    Array.from({ length: 30 }, (_, i) => {
      const dbForRequest = { ...db, requestIndex: i } as unknown as Database;
      return runWithSitesRequest(
        request("visitor" + i),
        { ...trusted, DB: dbForRequest },
        async () => {
          await new Promise((resolve) => setTimeout(resolve, i % 4));
          const runtime = getSitesRuntime();
          assert.equal(runtime.identity?.id, "visitor" + i);
          assert.equal(runtime.db, dbForRequest);
          return runtime.identity?.id;
        },
      );
    }),
  );
  assert.equal(new Set(outcomes).size, 30);
  assert.throws(() => getSitesRuntime(), /SITES_DISPATCH_NOT_CONFIGURED/);
  for (const env of [
    { DB: db },
    { ...trusted, DB: undefined },
    { ...trusted, DB: db, CREDIT_ENCRYPTION_KEY: "bad" },
  ]) {
    runWithSitesRequest(
      request("forged", "connectwithparam.30@gmail.com"),
      env,
      () => assert.throws(() => getSitesRuntime()),
    );
  }
  assert.equal(protectedPath("/admin/permissions"), true);
  assert.equal(protectedPath("/dashboard/credits"), true);
  assert.equal(protectedPath("/administrator"), false);
  db.close();
});
test("Sites runtime authorizes anonymous, participant, judge and owner requests against server data", async () => {
  const { db } = await setup();
  const call = (user: string | undefined, path: string, email?: string) => {
    const req = request(user, email, path);
    return runWithSitesRequest(req, { ...trusted, DB: db }, () =>
      path.startsWith("/api/export")
        ? handleExport(req, getSitesRuntime())
        : handlePortal(req, getSitesRuntime()),
    );
  };
  assert.equal((await call(undefined, "/api/portal?view=/rules")).status, 200);
  assert.equal(
    (await call(undefined, "/api/portal?view=/dashboard/credits")).status,
    401,
  );
  const participant = await call(
    "fake_alice",
    "/api/portal?view=/dashboard/profile",
    "alice@portal.test",
  );
  assert.equal(participant.status, 200);
  assert.match(participant.headers.get("cache-control")!, /no-store/);
  assert.equal(
    (
      await call(
        "fake_alice",
        "/api/portal?view=/admin/permissions",
        "alice@portal.test",
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await call(
        "fake_judge",
        "/api/portal?view=/dashboard/credits",
        "judge@portal.test",
      )
    ).status,
    403,
  );
  assert.equal(
    (await call("fake_alice", "/api/export?list=credits", "alice@portal.test"))
      .status,
    403,
  );
  // This identity is supplied by the synthetic trusted Dispatch harness, not an external caller.
  assert.equal(
    (
      await call(
        "verified-owner",
        "/api/portal?view=/admin/permissions",
        "connectwithparam.30@gmail.com",
      )
    ).status,
    200,
  );
  db.close();
});
test(
  "Sites Drizzle migrations preserve schema constraints, triggers and persisted service behavior on D1",
  { timeout: 30000 },
  async () => {
    const mf = new Miniflare({
      modules: true,
      script: 'export default {fetch(){return new Response("test")}}',
      compatibilityDate: "2026-07-01",
      cf: false,
      d1Databases: { DB: "sites-migrations-test" },
    });
    try {
      const db: Database = await mf.getD1Database("DB");
      for (const file of readdirSync("drizzle")
        .filter((f) => f.endsWith(".sql"))
        .sort()) {
        for (const sql of readFileSync("drizzle/" + file, "utf8")
          .split("--> statement-breakpoint")
          .filter((s) => s.trim()))
          await db.prepare(sql).all();
      }
      await seedLocal(db);
      const originalTriggers = readdirSync("db/migrations")
        .filter((f) => f.endsWith(".sql"))
        .flatMap((f) =>
          [
            ...readFileSync("db/migrations/" + f, "utf8").matchAll(
              /CREATE TRIGGER (\w+)/g,
            ),
          ].map((m) => m[1]),
        )
        .sort();
      const migratedTriggers = await rows<{ name: string }>(
        db,
        "SELECT name FROM sqlite_master WHERE type='trigger'",
      );
      assert.deepEqual(
        migratedTriggers.map((r) => r.name).sort(),
        originalTriggers,
      );
      const req = request("fake_alice", "alice@portal.test");
      const response = await runWithSitesRequest(
        req,
        { ...trusted, DB: db },
        () => handlePortal(req, getSitesRuntime()),
      );
      assert.equal(response.status, 200);
      assert.equal(
        ((await response.json()) as { me: { id: string } }).me.id,
        "fake_alice",
      );
      await assert.rejects(
        db
          .prepare(
            "INSERT INTO profiles(user_id,public) VALUES('fake_alice',2)",
          )
          .all(),
      );
      await assert.rejects(
        db
          .prepare(
            "INSERT INTO teams VALUES('case-dupe','small wonder','fake_bob','','2026-10-22')",
          )
          .all(),
      );
      assert.deepEqual(await rows(db, "PRAGMA foreign_key_check"), []);
    } finally {
      await mf.dispose();
    }
  },
);

test("fresh hosted schema requires an explicit owner-only, audited draft initialization", async () => {
  const { db, service } = await setup();
  await db.prepare("DELETE FROM event_settings").all();
  await assert.rejects(
    service("admin").command("initialize-event", {
      reason: "Test initialization",
    }),
    /OWNER_REQUIRED/,
  );
  await service("owner").command("initialize-event", {
    reason: "Test initialization",
  });
  const settings = await rows<{ active: number; policy: string }>(
    db,
    "SELECT active,policy FROM event_settings",
  );
  assert.equal(settings[0].active, 0);
  assert.deepEqual(JSON.parse(settings[0].policy).confirmations, []);
  assert.equal(
    (await rows(db, "SELECT * FROM audit_logs WHERE action='initialize-event'"))
      .length,
    1,
  );
  await assert.rejects(
    service("owner").command("initialize-event", {
      reason: "Do not overwrite",
    }),
    /EVENT_ALREADY_INITIALIZED/,
  );
  db.close();
});

test("slash aliases cannot weaken owner-only settings and permissions reads", async () => {
  const { db, service } = await setup();
  for (const path of [
    "/admin/permissions/",
    "/admin//permissions",
    "/admin/settings/",
    "/admin//settings",
  ]) {
    await assert.rejects(service("admin").view(path), /OWNER_REQUIRED/);
    assert.equal((await service("owner").view(path)).me !== undefined, true);
  }
  db.close();
});
