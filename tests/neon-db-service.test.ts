import { test } from "node:test";
import assert from "node:assert/strict";
import { createPGliteFixture } from "./neon-db-fixture";
import { PortalService } from "../lib/service";
import { fixtures, LOCAL_CREDIT_KEY, seedLocal } from "../scripts/fixtures";
import { one, rows, batch } from "../lib/db";
import { submission } from "./helpers";
import { publicProjectFacts } from "../lib/public-project-facts";
import { transferTeamLeader } from "../lib/team-leader-transfer";

async function setup() {
  const { db } = await createPGliteFixture();
  await seedLocal(db);
  let time = "2026-10-22T08:00:00.000Z";
  return {
    db,
    clock: (value: string) => {
      time = value;
    },
    service: (name = "alice") =>
      new PortalService(db, fixtures[name], LOCAL_CREDIT_KEY, () => time),
  };
}
const project = (name: string) => ({
  projectName: name,
  problemSolution: submission.problemSolution,
  description: submission.description,
  github: submission.github,
  demo: "",
  logo: submission.logo,
  banner: submission.banner,
  attestation: true,
});

test("PostgreSQL existing service preserves draft revisions, commit receipts, personal leadership and three-attempt lock", async () => {
  const { db, service, clock } = await setup();
  try {
    clock("2026-11-01T04:00:00.000Z");
    await service("admin").command("check-in", {
      userId: "fake_alice",
      reason: "Synthetic attendance",
    });
    await service("admin").command("check-in", {
      userId: "fake_carol",
      reason: "Synthetic teammate attendance",
    });
    await assert.rejects(
      service("bob").command("submit-project", {
        revision: 0,
        project: project("Blocked"),
      }),
      { code: "LEADER_CHECKIN_REQUIRED" },
    );
    await assert.rejects(
      service("carol").command("submit-project", {
        revision: 0,
        project: project("Blocked"),
      }),
      { code: "LEADER_REQUIRED" },
    );
    await service().command("save-project", {
      revision: 0,
      project: project("First draft"),
    });
    await assert.rejects(
      service().command("submit-project", {
        revision: 0,
        project: project("Stale draft"),
      }),
      { code: "PROJECT_CHANGED_RELOAD" },
    );
    let projectId = "";
    for (const revision of [1, 2, 3]) {
      const payload = {
        revision,
        project: project("Synthetic attempt " + revision),
      };
      const result = await service().command("submit-project", payload);
      projectId = String(result.projectId);
      assert.equal(
        (await service().command("submit-project", payload)).versionId,
        result.versionId,
      );
    }
    await assert.rejects(
      service().command("save-project", {
        revision: 4,
        project: project("Fourth"),
      }),
      { code: "PROJECT_LOCKED_AFTER_THIRD_SUBMISSION" },
    );
    assert.equal(
      (await one(db, "SELECT count(*) n FROM project_commit_receipts"))?.n,
      3,
    );
    assert.equal((await one(db, "SELECT count(*) n FROM astra_jobs"))?.n, 3);
    const facts = await publicProjectFacts(db, [projectId], "fake_alice");
    assert.equal(
      facts.get(projectId)?.removed,
      0,
      "EXISTS values preserve SQLite integer flags",
    );
    assert.equal(facts.get(projectId)?.teamName, "Small Wonder");
    assert.equal(
      facts.get(projectId)?.comments,
      0,
      "Postgres int8 counts preserve numeric JSON fields",
    );
    for (const path of [
      "/dashboard",
      "/submission",
      "/projects",
      "/discover/participants",
      "/admin/participants",
      "/admin/teams",
      "/admin/submissions",
      "/admin/settings",
      "/admin/audit",
      "/admin/credits",
    ]) {
      assert.ok(
        await service(path.startsWith("/admin") ? "owner" : "alice").view(path),
        path,
      );
    }
  } finally {
    await db.close();
  }
});

test("PostgreSQL credits JSON imports, stock insertion order, idempotent publish and delete keep voucher values private", async () => {
  const { db, service } = await setup();
  try {
    await service("admin").command("check-in", {
      userId: "fake_alice",
      reason: "Synthetic attendance",
    });
    await service("admin").command("check-in", {
      userId: "fake_bob",
      reason: "Synthetic attendance",
    });
    const csv = "Synthetic vouchers\nSYNTHETIC-CODE-ONE\nSYNTHETIC-CODE-TWO";
    const columns = [
      {
        key: "0",
        heading: "Synthetic credits",
        instructions: "SYNTHETIC-CODE-ONE is a fake value.",
      },
    ];
    const preview = await service("admin").command("preview-credit-batch", {
      csv,
      columns,
    });
    const payload = {
      csv,
      columns,
      digest: preview.digest,
      confirmation: "PUBLISH_CREDIT_BATCH",
    };
    const result = await service("admin").command(
      "publish-credit-batch",
      payload,
    );
    assert.equal(
      (await service("admin").command("publish-credit-batch", payload)).batchId,
      result.batchId,
    );
    const type = (await one<{ id: string }>(
      db,
      "SELECT type_id id FROM credit_batch_columns WHERE batch_id=?",
      result.batchId,
    ))!;
    assert.equal(
      (
        await one(
          db,
          "SELECT count(*) n FROM credit_allocations WHERE type_id=?",
          type.id,
        )
      )?.n,
      2,
    );
    assert.equal(
      (await service("alice").command("reveal-credit", { typeId: type.id }))
        .value,
      "SYNTHETIC-CODE-ONE",
    );
    assert.equal(
      (await service("bob").command("reveal-credit", { typeId: type.id }))
        .value,
      "SYNTHETIC-CODE-TWO",
    );
    await assert.rejects(
      service("carol").command("reveal-credit", { typeId: type.id }),
    );
    assert.ok(
      !JSON.stringify(await service("admin").view("/admin/credits")).includes(
        "SYNTHETIC-CODE-TWO",
      ),
    );
    await service("admin").command("delete-credit-batch", {
      batchId: result.batchId,
      confirmation: "DELETE_CREDIT_BATCH",
    });
    assert.equal(
      (
        await one(
          db,
          "SELECT count(*) n FROM credit_allocations WHERE type_id=?",
          type.id,
        )
      )?.n,
      0,
    );
    const audit = JSON.stringify(
      await rows(
        db,
        "SELECT detail FROM audit_logs WHERE action IN ('publish-credit-batch','delete-credit-batch')",
      ),
    );
    assert.ok(!audit.includes("SYNTHETIC-CODE-ONE"));
    assert.ok(audit.includes("[masked]"));
  } finally {
    await db.close();
  }
});

test("PostgreSQL locked crown transfer uses exact compact scoped guard and rechecks current staff permission", async () => {
  const { db, service } = await setup();
  try {
    await service("bob").command("lock-team", { confirmation: "LOCK_TEAM" });
    const membership = await rows(
      db,
      "SELECT * FROM memberships WHERE team_id='fake_team3' ORDER BY user_id",
    );
    await assert.rejects(
      db
        .prepare(
          "UPDATE teams SET leader_id='fake_carol' WHERE id='fake_team3'",
        )
        .all(),
      /TEAM_LOCKED/,
    );
    await transferTeamLeader(service("admin"), {
      teamId: "fake_team3",
      userId: "fake_carol",
      expectedLeaderId: "fake_bob",
      confirmation: "TRANSFER_TEAM_LEADER",
    });
    assert.equal(
      (await one(db, "SELECT leader_id FROM teams WHERE id='fake_team3'"))
        ?.leader_id,
      "fake_carol",
    );
    assert.deepEqual(
      await rows(
        db,
        "SELECT * FROM memberships WHERE team_id='fake_team3' ORDER BY user_id",
      ),
      membership,
    );
    assert.equal(
      (
        await one(
          db,
          "SELECT count(*) n FROM team_locks WHERE team_id='fake_team3'",
        )
      )?.n,
      1,
    );
    assert.equal((await one(db, "SELECT count(*) n FROM write_guards"))?.n, 0);
    await batch(db, [
      [
        "INSERT INTO portal_roles VALUES(?,?,?,?)",
        "fake_admin",
        "participant",
        "fake_owner",
        "2026-10-22T08:00:00Z",
      ],
    ]);
    await assert.rejects(
      transferTeamLeader(service("admin"), {
        teamId: "fake_team3",
        userId: "fake_dave",
        expectedLeaderId: "fake_carol",
        confirmation: "TRANSFER_TEAM_LEADER",
      }),
      { code: "ADMIN_REQUIRED" },
    );
    await assert.rejects(
      db.prepare("UPDATE audit_logs SET reason='changed'").all(),
      /IMMUTABLE/,
    );
  } finally {
    await db.close();
  }
});

test("PostgreSQL add-only roster JSON import preserves existing identities and returns usable prefill JSON", async () => {
  const { db, service } = await setup();
  try {
    const before = await one(
      db,
      "SELECT * FROM registrations WHERE email='alice@portal.test'",
    );
    const csv =
      "email,name,phone\n ALICE@portal.test ,Edited,+12025550199\nnew.person+tag@example.invalid,New Person,+12025550122";
    const fieldMap = { email: "email", displayName: "name", phone: "phone" };
    const preview = await service("admin").command("preview-import", {
      kind: "roster",
      csv,
      fieldMap,
    });
    assert.deepEqual(preview.errors, []);
    await service("admin").command("commit-import", {
      kind: "roster",
      csv,
      fieldMap,
      digest: preview.digest,
    });
    assert.deepEqual(
      await one(
        db,
        "SELECT * FROM registrations WHERE email='alice@portal.test'",
      ),
      before,
    );
    const prefill = (await one<{ payload: string }>(
      db,
      "SELECT payload FROM roster_prefills WHERE email=?",
      "new.person+tag@example.invalid",
    ))!;
    assert.equal(typeof JSON.parse(prefill.payload), "object");
    await assert.rejects(
      db
        .prepare("DELETE FROM luma_roster WHERE email=?")
        .bind("new.person+tag@example.invalid")
        .all(),
      /ROSTER_ADD_ONLY/,
    );
  } finally {
    await db.close();
  }
});
