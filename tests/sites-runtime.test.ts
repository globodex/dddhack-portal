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
import { seedRichVisual } from "../scripts/visual-rich-fixtures";
import { PortalService } from "../lib/service";
import { seedLocal, fixtures, LOCAL_CREDIT_KEY } from "../scripts/fixtures";
import { rows, batch, type Database } from "../lib/db";
import { setup, attend } from "./helpers";
import { seal, unseal, PortalError } from "../lib/security";

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
  for (const env of [{ DB: db }, { ...trusted, DB: undefined }]) {
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
test("sign-in and vouchers require no application key; legacy encryption remains fail-closed", async () => {
  const { db } = await setup();
  try {
    for (const key of [undefined, "", "bad", "not!base64", btoa("short")]) {
      const env = { ...trusted, DB: db, CREDIT_ENCRYPTION_KEY: key };
      const req = request(
        "fake_alice",
        "alice@portal.test",
        "/api/portal?view=/dashboard/profile",
      );
      const profile = await runWithSitesRequest(req, env, () =>
        handlePortal(req, getSitesRuntime()),
      );
      assert.equal(profile.status, 200);
      assert.equal(
        ((await profile.json()) as { me: { id: string } }).me.id,
        "fake_alice",
      );
      const anon = request(
        undefined,
        undefined,
        "/api/portal?view=/dashboard/profile",
      );
      assert.equal(
        (
          await runWithSitesRequest(anon, env, () =>
            handlePortal(anon, getSitesRuntime()),
          )
        ).status,
        401,
      );
      const owner = request(
        "owner-without-credit-key",
        "connectwithparam.30@gmail.com",
      );
      const before = await rows(db, "SELECT * FROM import_previews");
      const mutation = new Request("https://portal.test/api/portal", {
        method: "POST",
        headers: {
          ...Object.fromEntries(owner.headers),
          origin: "https://portal.test",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          action: "preview-import",
          data: {
            kind: "credits",
            csv: "value\nSYNTHETIC-TEST-CODE",
            typeId: "unused",
          },
        }),
      });
      const rejected = await runWithSitesRequest(mutation, env, () =>
        handlePortal(mutation, getSitesRuntime()),
      );
      assert.equal(rejected.status, 422);
      assert.equal(
        ((await rejected.json()) as { code: string }).code,
        "CREDIT_TYPE_REQUIRED",
      );
      assert.deepEqual(await rows(db, "SELECT * FROM import_previews"), before);
      const post = async (
        action: string,
        data: unknown,
        participant = false,
      ) => {
        const req = new Request("https://portal.test/api/portal", {
          method: "POST",
          headers: {
            ...Object.fromEntries(
              (participant ? request("fake_alice", "alice@portal.test") : owner)
                .headers,
            ),
            origin: "https://portal.test",
            "content-type": "application/json",
          },
          body: JSON.stringify({ action, data }),
        });
        return runWithSitesRequest(req, env, () =>
          handlePortal(req, getSitesRuntime()),
        );
      };
      const created = await post("credit-type", {
        name: "Synthetic voucher " + String(key),
        instructions: "Redeem this synthetic voucher only.",
      });
      assert.equal(created.status, 200);
      const typeId = ((await created.json()) as { id: string }).id;
      const csv = "value\nSYNTHETIC-VOUCHER-" + String(key);
      const preview = await post("preview-import", {
        kind: "credits",
        csv,
        typeId,
      });
      assert.equal(preview.status, 200);
      const digest = ((await preview.json()) as { digest: string }).digest;
      assert.equal(
        (await post("commit-import", { kind: "credits", csv, typeId, digest }))
          .status,
        200,
      );
      await attend(db, "fake_alice");
      assert.equal(
        (await post("allocate", { userId: "fake_alice" })).status,
        200,
      );
      const reveal = await post("reveal-credit", { typeId }, true);
      assert.equal(reveal.status, 200);
      assert.match(reveal.headers.get("cache-control") || "", /no-store/);
      assert.equal(
        ((await reveal.json()) as { value: string }).value,
        csv.split("\n")[1],
      );
      const unavailable = (e: unknown) =>
        e instanceof PortalError &&
        e.status === 503 &&
        e.code === "CREDIT_KEY_UNAVAILABLE";
      await assert.rejects(seal("synthetic", key), unavailable);
      await assert.rejects(unseal("unused.ciphertext", key), unavailable);
    }
  } finally {
    db.close();
  }
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
  assert.equal((await call(undefined, "/api/portal?view=/rules")).status, 401);
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
      const originalTriggers = new Set<string>();
      for (const file of readdirSync("db/migrations")
        .filter((name) => name.endsWith(".sql"))
        .sort()) {
        for (const match of readFileSync(
          "db/migrations/" + file,
          "utf8",
        ).matchAll(
          /\b(CREATE|DROP)\s+TRIGGER(?:\s+IF\s+(?:NOT\s+)?EXISTS)?\s+[`"]?(\w+)/gi,
        )) {
          if (match[1].toUpperCase() === "DROP")
            originalTriggers.delete(match[2]);
          else originalTriggers.add(match[2]);
        }
      }
      const migratedTriggers = await rows<{ name: string }>(
        db,
        "SELECT name FROM sqlite_master WHERE type='trigger'",
      );
      assert.deepEqual(
        migratedTriggers.map((r) => r.name).sort(),
        [...originalTriggers].sort(),
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
      await seedRichVisual(db);
      await batch(db, [["INSERT INTO engagement_controls VALUES(1,1,1,1,'fake_admin','2026-10-31T00:00:00Z') ON CONFLICT(id) DO UPDATE SET voting_paused=1,feedback_paused=1"]]);
      const staff = new PortalService(db, fixtures.admin, LOCAL_CREDIT_KEY);
      await staff.command("upvote-project", {projectId:"visual_project_alice"});
      await staff.command("comment-project", {projectId:"visual_project_alice",body:"Synthetic staff feedback stays available with participant feedback paused."});
      assert.equal((await rows(db,"SELECT * FROM project_upvotes WHERE user_id='fake_admin'")).length,1);
      await assert.rejects(new PortalService(db,fixtures.alice,LOCAL_CREDIT_KEY).command("comment-project",{projectId:"visual_project_alice",body:"Synthetic participant feedback remains paused by the existing control."}),{code:"ENGAGEMENT_PAUSED"});
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
  assert.deepEqual(JSON.parse(settings[0].policy).confirmations, [
    "capacity",
    "teamFormation",
    "submissionCutoff",
    "submissionOpen",
    "deploymentRule",
    "lumaPolicy",
  ]);
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

test("fresh event read views work before explicit initialization and never activate or persist draft settings", async () => {
  const { db, service } = await setup();
  try {
    await db.prepare("DELETE FROM event_settings").all();
    const publicView = await service("stranger").view("/");
    assert.ok(publicView.content);
    const profile = await service("alice").view("/dashboard/profile");
    assert.equal((profile.me as { id: string }).id, "fake_alice");
    const adminSetup = await service("owner").view("/admin/settings");
    assert.deepEqual(
      (adminSetup.policy as { confirmations: string[] }).confirmations,
      [
        "capacity",
        "teamFormation",
        "submissionCutoff",
        "submissionOpen",
        "deploymentRule",
        "lumaPolicy",
      ],
    );
    assert.ok((adminSetup.blockers as string[]).length > 0);
    await assert.rejects(
      service("alice").view("/admin/settings"),
      /ADMIN_REQUIRED/,
    );
    await assert.rejects(service("owner").settings(), {
      code: "EVENT_SETUP_REQUIRED",
    });
    await assert.rejects(service("owner").live(), {
      code: "POLICIES_UNCONFIRMED",
    });
    assert.equal((await rows(db, "SELECT * FROM event_settings")).length, 0);
  } finally {
    db.close();
  }
});

test("slash aliases cannot weaken owner-only settings and permissions reads", async () => {
  const { db, service } = await setup();
  for (const path of [
    "/admin/permissions/",
    "/admin//permissions",
    "/admin/logs/",
    "/admin//logs",
  ]) {
    await assert.rejects(service("admin").view(path), /OWNER_REQUIRED/);
    assert.equal((await service("owner").view(path)).me !== undefined, true);
  }
  db.close();
});
