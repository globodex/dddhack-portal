import assert from "node:assert/strict";
import { test } from "node:test";
import { setup, attend } from "./helpers";
import { createPGliteFixture } from "./neon-db-fixture";
import { fixtures, seedLocal, LOCAL_CREDIT_KEY } from "../scripts/fixtures";
import { PortalService } from "../lib/service";
import { batch, one, rows } from "../lib/db";

const unlock = (lockedAt: string, teamId = "fake_team3") => ({
  teamId,
  expectedLockedAt: lockedAt,
  confirmation: "UNLOCK_TEAM",
});
for (const engine of ["sqlite", "postgres"] as const) {
  async function fixture() {
    if (engine === "sqlite") return setup();
    const f = await createPGliteFixture();
    await seedLocal(f.db);
    let time = "2026-10-22T08:00:00.000Z";
    return {
      db: f.db,
      clock(value: string) {
        time = value;
      },
      service: (who = "alice") =>
        new PortalService(f.db, fixtures[who], LOCAL_CREDIT_KEY, () => time),
    };
  }
  test(`${engine}: real admin unlock restores normal idea/team actions without losing members/history, then relocks`, async () => {
    const { db, service, clock } = await fixture();
    try {
      await service("bob").command("lock-team", { confirmation: "LOCK_TEAM" });
      const lock = await one<any>(
        db,
        "SELECT * FROM team_locks WHERE team_id='fake_team3'",
      );
      const stable = async () =>
        Promise.all(
          [
            "memberships",
            "ideas",
            "idea_revisions",
            "projects",
            "submission_versions",
            "submission_attempt_ledger",
            "profiles",
            "registrations",
          ].map((table) => rows(db, `SELECT * FROM ${table} ORDER BY 1,2`)),
        );
      const before = await stable();
      await assert.rejects(
        service("pending").command("request-team", { teamId: "fake_team3" }),
        { code: "TEAM_LOCKED" },
      );
      await assert.rejects(
        service("bob").command("admin-unlock-team", unlock(lock.locked_at)),
        { code: "ADMIN_REQUIRED" },
      );
      await assert.rejects(
        service("admin").command("admin-unlock-team", unlock("stale-time")),
        { code: "TEAM_LOCK_CHANGED" },
      );
      const parallelUnlocks = await Promise.all([
        service("admin").command("admin-unlock-team", unlock(lock.locked_at)),
        service("owner").command("admin-unlock-team", unlock(lock.locked_at)),
      ]);
      assert.equal(
        parallelUnlocks.filter((result) => result.changed === true).length,
        1,
      );
      assert.equal(
        parallelUnlocks.filter((result) => result.changed === false).length,
        1,
      );
      assert.deepEqual(await stable(), before);
      assert.equal(
        await one(
          db,
          "SELECT team_id FROM team_locks WHERE team_id='fake_team3'",
        ),
        undefined,
      );
      const audit = await one<{ detail: string }>(
        db,
        "SELECT detail FROM audit_logs WHERE action='admin-unlock-team'",
      );
      assert.deepEqual(JSON.parse(audit!.detail).previousLock, {
        lockedAt: lock.locked_at,
        lockedBy: lock.locked_by,
      });
      assert.equal(
        (
          await service("admin").command(
            "admin-unlock-team",
            unlock(lock.locked_at),
          )
        ).changed,
        false,
      );
      assert.equal(
        (
          await rows(
            db,
            "SELECT id FROM audit_logs WHERE action='admin-unlock-team'",
          )
        ).length,
        1,
      );
      const workspace = (await service("bob").view("/dashboard")) as any;
      assert.equal(workspace.team.locked, false);
      assert.equal(workspace.ideaLocked, false);
      await service("bob").command("save-workspace-idea", {
        title: "Updated open idea",
        description: "Synthetic editable idea after admin unlock.",
      });
      assert.equal(
        ((await service("bob").view("/dashboard")) as any).idea.title,
        "Updated open idea",
      );
      await assert.rejects(
        service("carol").command("save-workspace-idea", {
          title: "Not allowed",
          description: "Member cannot replace the leader idea.",
        }),
        { code: "LEADER_REQUIRED" },
      );
      await service("bob").command("rename-team", { name: "Reopened team" });
      await service("bob").command("team-style", {
        avatar: "initials",
        palette: "cobalt",
      });
      await service("bob").command("team-invite", {
        teamId: "fake_team3",
        email: "owner@portal.test",
      });
      await service("pending").command("request-team", {
        teamId: "fake_team3",
      });
      const request = await one<any>(
        db,
        "SELECT id FROM team_actions WHERE team_id='fake_team3' AND user_id='fake_pending' AND kind='request' AND status='pending'",
      );
      await service("bob").command("respond-team", {
        requestId: request.id,
        accept: true,
      });
      await service("pending").command("leave-workspace-team", {
        confirmation: "LEAVE_TEAM",
      });
      assert.equal(
        await one(
          db,
          "SELECT team_id FROM memberships WHERE user_id='fake_pending'",
        ),
        undefined,
      );
      await assert.rejects(
        service("bob").command("leave-workspace-team", {
          confirmation: "LEAVE_TEAM",
        }),
        { code: "TRANSFER_LEADERSHIP_FIRST" },
      );
      await service("admin").command("transfer-team-leader", {
        teamId: "fake_team3",
        expectedLeaderId: "fake_bob",
        userId: "fake_carol",
        confirmation: "TRANSFER_TEAM_LEADER",
      });
      await service("bob").command("leave-workspace-team", {
        confirmation: "LEAVE_TEAM",
      });
      clock("2026-10-22T08:01:00.000Z");
      await service("carol").command("lock-team", {
        confirmation: "LOCK_TEAM",
      });
      await assert.rejects(
        service("pending").command("request-team", { teamId: "fake_team3" }),
        { code: "TEAM_LOCKED" },
      );
      await assert.rejects(
        service("admin").command("admin-unlock-team", unlock(lock.locked_at)),
        { code: "TEAM_LOCK_CHANGED" },
      );
      assert.equal(
        (
          await rows(
            db,
            "SELECT id FROM idea_revisions WHERE team_id='fake_team3'",
          )
        ).length,
        1,
      );
      assert.deepEqual(await rows(db, "SELECT * FROM submission_versions"), []);
      assert.deepEqual(
        await rows(db, "SELECT * FROM submission_attempt_ledger"),
        [],
      );
    } finally {
      db.close();
    }
  });

  test(`${engine}: committed or consumed attempts, frozen results and normal deadlines deny unlock without mutation`, async () => {
    const { db, service, clock } = await fixture();
    try {
      await service("bob").command("lock-team", { confirmation: "LOCK_TEAM" });
      const lock = await one<any>(
        db,
        "SELECT * FROM team_locks WHERE team_id='fake_team3'",
      );
      clock("2026-10-30T00:00:00.000Z");
      await assert.rejects(
        service("admin").command("admin-unlock-team", unlock(lock.locked_at)),
        { code: "TEAM_UNLOCK_DEADLINE_PASSED" },
      );
      clock("2026-10-22T08:00:00.000Z");
      await attend(db, "fake_bob");
      await batch(db, [
        [
          "INSERT INTO submission_versions(id,team_id,attempt,payload,created_at) VALUES('synthetic-unlock-version','fake_team3',1,'{}','2026-11-01T04:00:00.000Z')",
        ],
      ]);
      await assert.rejects(
        service("admin").command("admin-unlock-team", unlock(lock.locked_at)),
        { code: "TEAM_HAS_SUBMISSIONS" },
      );
      assert.equal(
        (await rows(db, "SELECT * FROM submission_versions")).length,
        1,
      );
      assert.deepEqual(
        await one(db, "SELECT * FROM team_locks WHERE team_id='fake_team3'"),
        lock,
      );
      assert.equal(
        (
          await rows(
            db,
            "SELECT * FROM audit_logs WHERE action='admin-unlock-team'",
          )
        ).length,
        0,
      );
      const projection = (await service("admin").view("/admin/teams")) as any;
      assert.equal(
        projection.items.find((t: any) => t.id === "fake_team3")
          .unlockBlockedReason,
        "Committed submissions prevent unlocking this team.",
      );
      await batch(db, [
        [
          "INSERT INTO result_snapshots(id,policy_version,source_revision,payload,created_at,frozen_by) SELECT 'synthetic-unlock-frozen',1,version,'[]',?,'fake_owner' FROM scoring_revision WHERE id=1",
          "2026-10-22T08:00:00.000Z",
        ],
      ]);
      await assert.rejects(
        service("admin").command("admin-unlock-team", unlock(lock.locked_at)),
        { code: "RESULTS_FROZEN" },
      );
      assert.deepEqual(
        await one(db, "SELECT * FROM team_locks WHERE team_id='fake_team3'"),
        lock,
      );
    } finally {
      db.close();
    }
  });
  test(`${engine}: consumed attempts remain a barrier without versions; revoked admin cannot unlock using stale authority`, async () => {
    const { db, service } = await fixture();
    try {
      await service("bob").command("lock-team", { confirmation: "LOCK_TEAM" });
      const lock = await one<any>(
        db,
        "SELECT * FROM team_locks WHERE team_id='fake_team3'",
      );
      let revoked = false;
      class RevokedBeforeWrite extends PortalService {
        override async mutate(...args: Parameters<PortalService["mutate"]>) {
          if (!revoked) {
            revoked = true;
            await batch(db, [
              ["UPDATE users SET role='participant' WHERE id='fake_admin'"],
            ]);
          }
          return super.mutate(...args);
        }
      }
      const stale = new RevokedBeforeWrite(
        db,
        fixtures.admin,
        LOCAL_CREDIT_KEY,
        () => "2026-10-22T08:00:00.000Z",
      );
      await assert.rejects(
        stale.command("admin-unlock-team", unlock(lock.locked_at)),
        { code: "ADMIN_REQUIRED" },
      );
      assert.deepEqual(
        await one(db, "SELECT * FROM team_locks WHERE team_id='fake_team3'"),
        lock,
      );
      await batch(db, [
        [
          "INSERT INTO submission_attempt_ledger(team_id,attempts) VALUES('fake_team3',1)",
        ],
      ]);
      await assert.rejects(
        service("owner").command("admin-unlock-team", unlock(lock.locked_at)),
        { code: "TEAM_HAS_SUBMISSIONS" },
      );
      assert.equal(
        (
          await rows(
            db,
            "SELECT id FROM audit_logs WHERE action='admin-unlock-team'",
          )
        ).length,
        0,
      );
      assert.deepEqual(await rows(db, "SELECT * FROM write_guards"), []);
    } finally {
      db.close();
    }
  });
}
