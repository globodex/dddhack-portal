import assert from "node:assert/strict";
import { test } from "node:test";
import { setup, attend } from "./helpers";
import { createPGliteFixture } from "./neon-db-fixture";
import { fixtures, LOCAL_CREDIT_KEY, seedLocal } from "../scripts/fixtures";
import { PortalService } from "../lib/service";
import { batch, one, rows, type SQL } from "../lib/db";

const teamId = "fake_team3",
  at = "2026-10-22T08:00:00.000Z";
const payload = (preview: any) => ({
  teamId,
  expectedName: preview.team.name,
  snapshotDigest: preview.snapshotDigest,
  confirmation: "ADMIN_LOCK_TEAM",
});
const preview = (service: PortalService) =>
  service.view("/admin/team-lock", { focus: teamId }) as Promise<any>;

for (const engine of ["sqlite", "postgres"] as const) {
  async function fixture() {
    if (engine === "sqlite") return setup();
    const f = await createPGliteFixture();
    await seedLocal(f.db);
    let time = at;
    return {
      db: f.db,
      clock(value: string) {
        time = value;
      },
      service: (who = "alice") =>
        new PortalService(f.db, fixtures[who], LOCAL_CREDIT_KEY, () => time),
    };
  }
  test(`${engine}: admin locks missing idea and incomplete profiles, preserves facts, approves separately and coherently unlocks/relocks`, async () => {
    const f = await fixture();
    try {
      await batch(f.db, [
        ["DELETE FROM participant_profiles WHERE user_id='fake_carol'"],
        [
          "UPDATE registrations SET status='pending' WHERE email='carol@portal.test'",
        ],
        [
          "INSERT INTO participant_status_overrides VALUES('fake_dave','Absent','Synthetic attendance','fake_owner',?)",
          at,
        ],
      ]);
      await attend(f.db, "fake_bob");
      await assert.rejects(
        f.service("bob").command("lock-team", { confirmation: "LOCK_TEAM" }),
        { code: "MEMBER_PROFILE_REQUIRED" },
      );
      await batch(f.db, [["UPDATE ideas SET core='' WHERE team_id=?", teamId]]);
      await assert.rejects(
        f.service("bob").command("lock-team", { confirmation: "LOCK_TEAM" }),
        { code: "TEAM_IDEA_REQUIRED" },
      );
      await batch(f.db, [["DELETE FROM ideas WHERE team_id=?", teamId]]);
      await assert.rejects(
        f.service("bob").command("lock-team", { confirmation: "LOCK_TEAM" }),
        { code: "TEAM_IDEA_REQUIRED" },
      );
      await assert.rejects(
        f.service("admin").command("admin-status", {
          kind: "team",
          targetId: teamId,
          status: "Locked",
          confirmation: "CHANGE_STATUS",
        }),
        { code: "TEAM_LOCK_ACTION_REQUIRED" },
      );
      for (const who of ["alice", "bob", "judge", "stranger"]) {
        await assert.rejects(preview(f.service(who)), {
          code: "ADMIN_REQUIRED",
        });
        await assert.rejects(f.service(who).command("admin-lock-team", {}), {
          code: who === "stranger" ? "VIEWER_READ_ONLY" : "ADMIN_REQUIRED",
        });
      }
      const admin = f.service("admin"),
        review = await preview(admin);
      assert.equal(review.ideaPresent, false);
      assert.equal(review.canLock, true);
      const tables = [
        "memberships",
        "ideas",
        "idea_revisions",
        "profiles",
        "participant_profiles",
        "registrations",
        "participant_status_overrides",
        "submission_versions",
        "submission_attempt_ledger",
      ];
      const stable = () =>
        Promise.all(
          tables.map((table) =>
            rows(f.db, `SELECT * FROM ${table} ORDER BY 1,2`),
          ),
        );
      const before = await stable();
      assert.equal(
        (await admin.command("admin-lock-team", payload(review))).changed,
        true,
      );
      assert.deepEqual(await stable(), before);
      const lock = await one<any>(
        f.db,
        "SELECT * FROM team_locks WHERE team_id=?",
        teamId,
      );
      assert.equal(lock.locked_by, "fake_admin");
      const dashboard = (await f.service("bob").view("/dashboard")) as any;
      assert.equal(dashboard.team.locked, true);
      assert.equal(dashboard.ideaLocked, true);
      const adminTeams = (await admin.view("/admin/teams")) as any;
      assert.equal(
        adminTeams.items.find((t: any) => t.id === teamId).status,
        "Locked",
      );
      await assert.rejects(
        f.service("bob").command("save-workspace-idea", {
          title: "Blocked replacement",
          description: "This synthetic idea cannot be created while locked.",
        }),
        { code: "TEAM_LOCKED" },
      );
      await assert.rejects(
        f
          .service("dave")
          .command("leave-workspace-team", { confirmation: "LEAVE_TEAM" }),
        { code: "TEAM_LOCKED" },
      );
      await assert.rejects(
        f.service("pending").command("request-team", { teamId }),
        { code: "TEAM_LOCKED" },
      );
      assert.equal(
        (await admin.command("admin-lock-team", payload(review))).changed,
        false,
      );
      assert.equal(
        (
          await rows(
            f.db,
            "SELECT id FROM audit_logs WHERE action='admin-lock-team'",
          )
        ).length,
        1,
      );
      const approval = (await admin.view("/admin/team-approval", {
        focus: teamId,
      })) as any;
      assert.equal(approval.idea, null);
      assert.equal(approval.canApprove, true);
      await admin.command("approve-team", {
        teamId,
        snapshotDigest: approval.snapshotDigest,
        confirmation: "APPROVE_TEAM",
      });
      const people = (await admin.view("/admin/participants")) as any;
      assert.equal(
        people.items.find((p: any) => p.id === "fake_bob").status,
        "Checked in",
      );
      assert.equal(
        people.items.find((p: any) => p.id === "fake_carol").status,
        "Going",
      );
      assert.equal(
        people.items.find((p: any) => p.id === "fake_dave").status,
        "Absent",
      );
      f.clock("2026-10-22T08:01:00.000Z");
      await admin.command("admin-unlock-team", {
        teamId,
        expectedLockedAt: lock.locked_at,
        confirmation: "UNLOCK_TEAM",
      });
      assert.equal(
        ((await f.service("bob").view("/dashboard")) as any).ideaLocked,
        false,
      );
      assert.equal(
        await one(f.db, "SELECT team_id FROM ideas WHERE team_id=?", teamId),
        undefined,
      );
      const fresh = await preview(f.service("owner"));
      assert.equal(
        (await f.service("owner").command("admin-lock-team", payload(fresh)))
          .changed,
        true,
      );
      assert.deepEqual(await rows(f.db, "SELECT * FROM write_guards"), []);
    } finally {
      f.db.close();
    }
  });

  test(`${engine}: exact snapshot, fresh authority, concurrent idempotence and rollback protect admin locking`, async () => {
    const f = await fixture();
    try {
      const admin = f.service("admin"),
        stale = await preview(admin);
      await batch(f.db, [
        ["UPDATE teams SET name='New reviewed identity' WHERE id=?", teamId],
      ]);
      await assert.rejects(admin.command("admin-lock-team", payload(stale)), {
        code: "TEAM_LOCK_CHANGED",
      });
      const current = await preview(admin),
        original = admin.mutate.bind(admin);
      admin.mutate = async (actor, action, entity, sql, detail, why) =>
        original(
          actor,
          action,
          entity,
          [
            ...sql,
            [
              "INSERT INTO write_guards VALUES('synthetic-forced-failure',0)",
            ] as SQL,
          ],
          detail,
          why,
        );
      await assert.rejects(admin.command("admin-lock-team", payload(current)), {
        code: "TEAM_LOCK_CHANGED",
      });
      assert.equal(
        await one(
          f.db,
          "SELECT team_id FROM team_locks WHERE team_id=?",
          teamId,
        ),
        undefined,
      );
      assert.equal(
        (
          await rows(
            f.db,
            "SELECT id FROM audit_logs WHERE action='admin-lock-team'",
          )
        ).length,
        0,
      );
      assert.deepEqual(await rows(f.db, "SELECT * FROM write_guards"), []);
      admin.mutate = original;
      const results = await Promise.all([
        admin.command("admin-lock-team", payload(current)),
        f.service("owner").command("admin-lock-team", payload(current)),
      ]);
      assert.equal(results.filter((r) => r.changed).length, 1);
      assert.equal(
        (
          await rows(
            f.db,
            "SELECT id FROM audit_logs WHERE action='admin-lock-team'",
          )
        ).length,
        1,
      );
    } finally {
      f.db.close();
    }
  });

  test(`${engine}: role revocation between preview/mutation, consumed attempts and frozen results cannot be overridden`, async () => {
    const f = await fixture();
    try {
      const admin = f.service("admin"),
        review = await preview(admin),
        mutate = admin.mutate.bind(admin);
      admin.mutate = async (...args) => {
        await batch(f.db, [
          [
            "INSERT INTO portal_roles VALUES('fake_admin','participant','fake_owner',?)",
            at,
          ],
        ]);
        return mutate(...args);
      };
      await assert.rejects(admin.command("admin-lock-team", payload(review)), {
        code: "ADMIN_REQUIRED",
      });
      assert.equal(
        await one(
          f.db,
          "SELECT team_id FROM team_locks WHERE team_id=?",
          teamId,
        ),
        undefined,
      );
      await batch(f.db, [
        [
          "INSERT INTO submission_attempt_ledger(team_id,attempts) VALUES(?,1)",
          teamId,
        ],
      ]);
      const blocked = await preview(f.service("owner"));
      assert.equal(blocked.canLock, false);
      await assert.rejects(
        f.service("owner").command("admin-lock-team", payload(blocked)),
        { code: "TEAM_HAS_SUBMISSIONS" },
      );
      await batch(f.db, [
        [
          "INSERT INTO result_snapshots(id,policy_version,source_revision,payload,created_at,frozen_by) SELECT 'synthetic-admin-lock-freeze',1,version,'[]',?,'fake_owner' FROM scoring_revision WHERE id=1",
          at,
        ],
      ]);
      await assert.rejects(
        f.service("owner").command("admin-lock-team", payload(blocked)),
        { code: "RESULTS_FROZEN" },
      );
    } finally {
      f.db.close();
    }
  });
}
