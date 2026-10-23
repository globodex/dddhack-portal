import { test } from "node:test";
import assert from "node:assert/strict";
import { setup } from "./helpers";
import { handlePortal } from "../lib/http";
import { one, rows } from "../lib/db";
import { fixtures } from "../scripts/fixtures";
import { seedRichVisual } from "../scripts/visual-rich-fixtures";
import type { Identity } from "../lib/identity";

type Row = Record<string, any>;
const origin = "https://portal.test";
async function request(
  db: any,
  actor: Identity,
  action: string,
  data: unknown,
) {
  const response = await handlePortal(
    new Request(origin + "/api/portal", {
      method: "POST",
      headers: { "content-type": "application/json", origin },
      body: JSON.stringify({ action, data }),
    }),
    { db, identity: actor, key: undefined, localTest: true },
  );
  return { status: response.status, body: (await response.json()) as Row };
}
async function view(db: any, actor: Identity, path: string) {
  const response = await handlePortal(
    new Request(origin + "/api/portal?view=" + encodeURIComponent(path)),
    { db, identity: actor, key: undefined, localTest: true },
  );
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control") || "", /no-store/);
  return (await response.json()) as Row;
}

test("fresh synthetic admin API imports, statuses and shared instructions persist without altering private allocations or scoring", async () => {
  const { db } = await setup();
  try {
    const before = await one(
      db,
      "SELECT active,policy,version FROM event_settings",
    );
    const allocations = await rows(db, "SELECT * FROM credit_allocations");
    const bob = await one(
      db,
      "SELECT * FROM registrations WHERE email='bob@portal.test'",
    );
    const profile = await one(
      db,
      "SELECT * FROM profiles WHERE user_id='fake_bob'",
    );
    for (const [suffix, csv] of [
      ["single", "synthetic-admin-single@portal.test"],
      [
        "list",
        "synthetic-admin-list@portal.test;synthetic-admin-list@portal.test;bob@portal.test",
      ],
      ["csv", "email\nsynthetic-admin-csv@portal.test\nbob@portal.test\n"],
    ]) {
      const preview = await request(db, fixtures.admin, "preview-import", {
        kind: "roster",
        csv,
      });
      assert.equal(preview.status, 200);
      assert.equal(preview.body.counts.new, 1);
      const email = `synthetic-admin-${suffix}@portal.test`;
      assert.equal(
        await one(db, "SELECT email FROM registrations WHERE email=?", email),
        undefined,
      );
      const committed = await request(db, fixtures.admin, "commit-import", {
        kind: "roster",
        csv,
        digest: preview.body.digest,
      });
      assert.equal(committed.status, 200);
      assert.deepEqual(
        {
          ...(await one(
            db,
            "SELECT email,status FROM registrations WHERE email=?",
            email,
          )),
        },
        { email, status: "pending" },
      );
      const repeated = await request(db, fixtures.admin, "commit-import", {
        kind: "roster",
        csv,
        digest: preview.body.digest,
      });
      assert.equal(repeated.status, 409);
      assert.equal(repeated.body.code, "PREVIEW_REQUIRED");
    }
    assert.deepEqual(
      await one(
        db,
        "SELECT * FROM registrations WHERE email='bob@portal.test'",
      ),
      bob,
    );
    assert.deepEqual(
      await one(db, "SELECT * FROM profiles WHERE user_id='fake_bob'"),
      profile,
    );
    for (const status of ["Going", "Checked in", "Absent", "Registered"]) {
      const result = await request(db, fixtures.admin, "admin-status", {
        kind: "person",
        targetId: "fake_pending",
        status,
        reason: "Synthetic admin status verification",
        confirmation: "CHANGE_STATUS",
      });
      assert.equal(result.status, 200);
      assert.equal(
        (await view(db, fixtures.admin, "/admin/participants")).items.find(
          (p: Row) => p.id === "fake_pending",
        ).status,
        status,
      );
    }
    assert.equal(
      (
        await rows(
          db,
          "SELECT * FROM manual_checkins WHERE user_id='fake_pending'",
        )
      ).length,
      1,
      "Status changes preserve attendance history",
    );
    const original = await one<Row>(
      db,
      "SELECT instructions FROM credit_types WHERE id='fake_credit'",
    );
    for (const markdown of [
      "Synthetic shared setup instructions.",
      original!.instructions,
    ]) {
      const result = await request(
        db,
        fixtures.admin,
        "update-credit-instructions",
        {
          typeId: "fake_credit",
          markdown,
          reason: "Synthetic shared instructions save and restore",
        },
      );
      assert.equal(result.status, 200);
      assert.equal(
        (await one<Row>(
          db,
          "SELECT instructions FROM credit_types WHERE id='fake_credit'",
        ))!.instructions,
        markdown,
      );
    }
    assert.deepEqual(
      await rows(db, "SELECT * FROM credit_allocations"),
      allocations,
    );
    assert.deepEqual(
      await one(db, "SELECT active,policy,version FROM event_settings"),
      before,
    );
    const audit = await rows<Row>(
      db,
      "SELECT action,reason,detail FROM audit_logs WHERE actor_id='fake_admin'",
    );
    assert.equal(audit.filter((r) => r.action === "commit-import").length, 3);
    assert.equal(audit.filter((r) => r.action === "admin-status").length, 4);
    assert.ok(
      audit.every(
        (r) =>
          !String(r.detail).includes("Synthetic shared setup instructions."),
      ),
      "Audit stores instruction hash rather than content",
    );
  } finally {
    db.close();
  }
});

test("fresh assigned judge and mentor reviews persist through HTTP with score and author privacy boundaries", async () => {
  const { db } = await setup();
  try {
    await seedRichVisual(db);
    const before = await one(
      db,
      "SELECT active,policy,version FROM event_settings",
    );
    const mentor: Identity = {
      id: "fake_mentor",
      email: "mentor@portal.test",
      name: "Synthetic mentor",
      source: "local-test",
    };
    const marker = "Synthetic assigned reviewer write";
    for (const actor of [fixtures.judge, mentor]) {
      const detail = await view(db, actor, "/review/synthetic-alice");
      const result = await request(db, actor, "review-project", {
        projectId: "visual_project_alice",
        versionId: detail.version.id,
        body: marker + actor.id,
        ...(actor.id === "fake_judge" ? { rating: 7 } : {}),
      });
      assert.equal(result.status, 200);
      const persisted = (
        await view(db, actor, "/review/synthetic-alice")
      ).history.find((r: Row) => r.body === marker + actor.id);
      assert.ok(persisted);
      if (actor.id === "fake_judge") {
        assert.equal(persisted.rating, 7);
        assert.equal(persisted.author_id, actor.id);
      } else {
        assert.ok(!Object.hasOwn(persisted, "rating"));
        assert.ok(!Object.hasOwn(persisted, "author_id"));
      }
    }
    const outsider = await request(db, fixtures.bob, "review-project", {
      projectId: "visual_project_alice",
      versionId: "visual_alice_v2",
      body: "Synthetic unauthorized review",
    });
    assert.equal(outsider.status, 403);
    const team = await view(db, fixtures.alice, "/dashboard");
    assert.ok(
      !JSON.stringify(team).includes('"rating":7'),
      "Team projection omits private judge scores",
    );
    assert.deepEqual(
      await one(db, "SELECT active,policy,version FROM event_settings"),
      before,
      "Reviews do not activate scoring",
    );
    assert.equal((await rows(db, "SELECT * FROM result_snapshots")).length, 0);
  } finally {
    db.close();
  }
});
