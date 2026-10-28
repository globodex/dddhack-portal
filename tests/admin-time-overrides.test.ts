import assert from "node:assert/strict";
import { test } from "node:test";
import { setup, attend, submission } from "./helpers";
import { createPGliteFixture } from "./neon-db-fixture";
import { seedLocal, fixtures, LOCAL_CREDIT_KEY } from "../scripts/fixtures";
import { PortalService } from "../lib/service";
import { batch, one, rows } from "../lib/db";
import { submissionAccess } from "../lib/team-access";

const teamId = "fake_team3";
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
for (const engine of ["sqlite", "postgres"] as const) {
  const fixture = async () => {
    if (engine === "sqlite") return setup();
    const f = await createPGliteFixture();
    await seedLocal(f.db);
    let time = "2026-10-22T08:00:00.000Z";
    return {
      db: f.db,
      clock: (v: string) => {
        time = v;
      },
      service: (who = "alice") =>
        new PortalService(f.db, fixtures[who], LOCAL_CREDIT_KEY, () => time),
    };
  };
  test(`${engine}: active admin leaders test before/after submission window; non-time safeguards and immutable attempts survive removal`, async () => {
    const f = await fixture();
    try {
      await attend(f.db, "fake_bob", "fake_alice");
      await batch(f.db, [
        [
          "INSERT INTO portal_roles(user_id,role,granted_by,updated_at) VALUES('fake_bob','admin','fake_owner',?)",
          "2026-10-22T08:00:00.000Z",
        ],
      ]);
      f.clock("2026-10-30T08:00:00.000Z");
      const admin = f.service("bob");
      assert.equal((await submissionAccess(admin, teamId)).canCommit, true);
      assert.equal(
        (await submissionAccess(f.service("admin"), teamId))
          .adminSubmissionTest,
        false,
      );
      await assert.rejects(
        f.service("alice").command("submit-project", {
          revision: 0,
          project: project("Ordinary scheduled"),
        }),
        { code: "SUBMISSIONS_CLOSED" },
      );
      await assert.rejects(
        f.service("admin").command("admin-remove-own-test-project", {
          projectId: "x",
          confirmation: "REMOVE_TEST_PROJECT",
        }),
        { code: "LEADER_REQUIRED" },
      );
      await assert.rejects(
        batch(f.db, [
          [
            "INSERT INTO submission_versions VALUES('raw-outside',?,1,'{}',?)",
            teamId,
            "2026-10-30T08:00:00.000Z",
          ],
        ]),
        /SUBMISSIONS_CLOSED/,
      );
      await admin.command("save-project", {
        revision: 0,
        project: project("Admin draft"),
      });
      const firstPayload = {
        revision: 1,
        project: project("Admin early commit"),
      };
      const first = await admin.command("submit-project", firstPayload);
      assert.equal(
        (await admin.command("submit-project", firstPayload)).versionId,
        first.versionId,
      );
      f.clock("2026-11-02T08:00:00.000Z");
      assert.equal(
        (await submissionAccess(admin, teamId)).adminTimeOverride,
        true,
      );
      const second = await admin.command("submit-project", {
        revision: 2,
        project: project("Admin late commit"),
      });
      const before = await rows(
        f.db,
        "SELECT * FROM submission_versions WHERE team_id=? ORDER BY attempt",
        teamId,
      );
      await assert.rejects(
        f.service("alice").command("admin-remove-own-test-project", {
          projectId: second.projectId,
          confirmation: "REMOVE_TEST_PROJECT",
        }),
        { code: "ADMIN_REQUIRED" },
      );
      await admin.command("admin-remove-own-test-project", {
        projectId: second.projectId,
        confirmation: "REMOVE_TEST_PROJECT",
      });
      assert.deepEqual(
        await rows(
          f.db,
          "SELECT * FROM submission_versions WHERE team_id=? ORDER BY attempt",
          teamId,
        ),
        before,
      );
      assert.equal((await submissionAccess(admin, teamId)).attemptsUsed, 2);
      await assert.rejects(
        admin.command("submit-project", {
          revision: 3,
          project: project("Removed"),
        }),
        { code: "RECORD_REMOVED" },
      );
      // Existing explicit admin restore, never reset submission attempts.
      await batch(f.db, [
        [
          "UPDATE record_removals SET active=0 WHERE kind='project' AND target_id=?",
          second.projectId,
        ],
      ]);
      await admin.command("submit-project", {
        revision: 3,
        project: project("Third"),
      });
      await assert.rejects(
        admin.command("submit-project", {
          revision: 4,
          project: project("Fourth"),
        }),
        { code: "PROJECT_LOCKED_AFTER_THIRD_SUBMISSION" },
      );
      assert.equal(
        (
          await one<any>(
            f.db,
            "SELECT attempts FROM submission_attempt_ledger WHERE team_id=?",
            teamId,
          )
        )?.attempts,
        3,
      );
      assert.deepEqual(await rows(f.db, "SELECT * FROM write_guards"), []);
      assert.equal(
        (await one<any>(f.db, "SELECT count(*) n FROM astra_jobs"))?.n,
        3,
      );
      await batch(f.db, [
        [
          "INSERT INTO result_snapshots(id,policy_version,source_revision,payload,created_at,frozen_by) SELECT 'admin-test-frozen',1,version,'[]',?,'fake_owner' FROM scoring_revision WHERE id=1",
          "2026-11-02T08:00:00.000Z",
        ],
      ]);
      await assert.rejects(
        admin.command("admin-remove-own-test-project", {
          projectId: second.projectId,
          confirmation: "REMOVE_TEST_PROJECT",
        }),
        { code: "RESULTS_FROZEN" },
      );
    } finally {
      await f.db.close();
    }
  });
  test(`${engine}: admin corrections work after cutoff while participant lock/deadline and leader protections remain`, async () => {
    const f = await fixture();
    try {
      const at = "2026-10-22T08:00:00.000Z";
      await batch(f.db, [
        ["INSERT INTO team_locks VALUES(?,?,?)", teamId, "fake_bob", at],
      ]);
      f.clock("2026-10-30T08:00:00.000Z");
      const admin = f.service("admin");
      await assert.rejects(
        f
          .service("dave")
          .command("leave-workspace-team", { confirmation: "LEAVE_TEAM" }),
        { code: "MEMBERSHIP_FROZEN" },
      );
      const remove = {
        teamId,
        userId: "fake_dave",
        confirmation: "REMOVE_TEAM_MEMBER",
        reason: "Synthetic admin correction",
      };
      await assert.rejects(
        f.service("bob").command("admin-remove-team-member", remove),
        { code: "ADMIN_REQUIRED" },
      );
      await assert.rejects(
        admin.command("admin-remove-team-member", {
          ...remove,
          userId: "fake_bob",
        }),
        { code: "TRANSFER_LEADERSHIP_FIRST" },
      );
      const idea = await rows(
        f.db,
        "SELECT * FROM ideas WHERE team_id=?",
        teamId,
      );
      await admin.command("admin-remove-team-member", remove);
      assert.equal(
        (await admin.command("admin-remove-team-member", remove)).changed,
        false,
      );
      assert.ok(await one(f.db, "SELECT id FROM users WHERE id='fake_dave'"));
      assert.ok(
        await one(
          f.db,
          "SELECT email FROM registrations WHERE email='dave@portal.test'",
        ),
      );
      assert.deepEqual(
        await rows(f.db, "SELECT * FROM ideas WHERE team_id=?", teamId),
        idea,
      );
      assert.ok(
        await one(
          f.db,
          "SELECT team_id FROM team_locks WHERE team_id=?",
          teamId,
        ),
      );
      await admin.command("admin-add-team-member", {
        teamId,
        email: "dave@portal.test",
        confirmation: "ADD_TEAM_MEMBER",
        reason: "Synthetic rejoin",
      });
      assert.ok(
        await one(
          f.db,
          "SELECT user_id FROM memberships WHERE user_id='fake_dave'",
        ),
      );
      await admin.command("admin-unlock-team", {
        teamId,
        expectedLockedAt: at,
        confirmation: "UNLOCK_TEAM",
      });
      assert.equal(
        await one(
          f.db,
          "SELECT team_id FROM team_locks WHERE team_id=?",
          teamId,
        ),
        undefined,
      );
      await assert.rejects(
        f.service("bob").command("save-workspace-idea", {
          title: "Too late",
          description: "Participant deadline remains enforced.",
        }),
        { code: "IDEA_LOCKED" },
      );
      const preview = (await admin.view("/admin/team-lock", {
        focus: teamId,
      })) as any;
      await admin.command("admin-lock-team", {
        teamId,
        expectedName: preview.team.name,
        snapshotDigest: preview.snapshotDigest,
        confirmation: "ADMIN_LOCK_TEAM",
      });
      await admin.command("admin-status", {
        kind: "person",
        targetId: "fake_carol",
        status: "Going",
        confirmation: "CHANGE_STATUS",
      });
      assert.ok(
        await one(
          f.db,
          "SELECT team_id FROM team_locks WHERE team_id=?",
          teamId,
        ),
      );
      assert.deepEqual(await rows(f.db, "SELECT * FROM write_guards"), []);
    } finally {
      await f.db.close();
    }
  });
  test(`${engine}: stale admin role/crown, incomplete profile and failed admin writes cannot consume attempts`, async () => {
    const f = await fixture();
    try {
      await attend(f.db, "fake_bob");
      await batch(f.db, [
        [
          "INSERT INTO portal_roles VALUES('fake_bob','admin','fake_owner',?)",
          "2026-10-22T08:00:00.000Z",
        ],
      ]);
      f.clock("2026-10-30T08:00:00.000Z");
      const admin = f.service("bob"),
        original = admin.mutate.bind(admin);
      for (const action of ["save-project", "submit-project"]) {
        admin.mutate = async (...args) => {
          await batch(f.db, [
            [
              "UPDATE portal_roles SET role='participant' WHERE user_id='fake_bob'",
            ],
          ]);
          return original(...args);
        };
        await assert.rejects(
          admin.command(action, {
            revision: 0,
            project: project("Stale role"),
          }),
        );
        assert.equal(
          await one(f.db, "SELECT id FROM projects WHERE team_id=?", teamId),
          undefined,
        );
        assert.deepEqual(await rows(f.db, "SELECT * FROM write_guards"), []);
        await batch(f.db, [
          ["UPDATE portal_roles SET role='admin' WHERE user_id='fake_bob'"],
        ]);
      }
      admin.mutate = async (...args) => {
        await batch(f.db, [
          ["UPDATE teams SET leader_id='fake_carol' WHERE id=?", teamId],
        ]);
        return original(...args);
      };
      await assert.rejects(
        admin.command("submit-project", {
          revision: 0,
          project: project("Stale crown"),
        }),
      );
      assert.deepEqual(
        await rows(f.db, "SELECT * FROM submission_versions"),
        [],
      );
      await batch(f.db, [
        ["UPDATE teams SET leader_id='fake_bob' WHERE id=?", teamId],
        ["DELETE FROM participant_profiles WHERE user_id='fake_bob'"],
      ]);
      admin.mutate = original;
      assert.equal((await submissionAccess(admin, teamId)).canCommit, false);
      await assert.rejects(
        admin.command("submit-project", {
          revision: 0,
          project: project("Incomplete"),
        }),
        { code: "PROFILE_COMPLETION_REQUIRED" },
      );
      assert.deepEqual(
        await rows(f.db, "SELECT * FROM submission_attempt_ledger"),
        [],
      );
    } finally {
      await f.db.close();
    }
  });
}
