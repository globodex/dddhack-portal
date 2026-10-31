import assert from "node:assert/strict";
import { test } from "node:test";
import { setup, attend, submission } from "./helpers";
import { createPGliteFixture } from "./neon-db-fixture";
import { PortalService } from "../lib/service";
import { seedLocal, fixtures, LOCAL_CREDIT_KEY } from "../scripts/fixtures";
import { batch, one, rows } from "../lib/db";
import { submissionAccess } from "../lib/team-access";
import { handlePortal } from "../lib/http";
import { createPortalMediaAuthorizer } from "../neon/storage/authorization";
const team = "fake_team3";
const payload = (name: string) => ({
  projectName: name,
  problemSolution: submission.problemSolution,
  description: submission.description,
  github: submission.github,
  demo: "",
  logo: submission.logo,
  banner: submission.banner,
  attestation: true,
});
async function fixture(engine: string) {
  if (engine === "sqlite") return setup();
  const f = await createPGliteFixture();
  await seedLocal(f.db);
  let time = "2026-10-22T08:00:00.000Z";
  return {
    db: f.db,
    clock: (s: string) => {
      time = s;
    },
    service: (name = "alice") =>
      new PortalService(f.db, fixtures[name], LOCAL_CREDIT_KEY, () => time),
  };
}
for (const engine of ["sqlite", "postgres"]) {
  test(`${engine}: admin active leader with no profile/check-in can type/save/commit before and after window with bounded capabilities`, async () => {
    const f = await fixture(engine);
    try {
      await batch(f.db, [
        [
          "INSERT INTO portal_roles VALUES('fake_bob','admin','fake_owner','2026-10-22T08:00:00Z')",
        ],
        ["DELETE FROM participant_profiles WHERE user_id='fake_bob'"],
      ]);
      const admin = f.service("bob");
      const access = await submissionAccess(admin, team);
      assert.equal(access.canCommit, true);
      assert.equal(access.adminSubmissionTest, true);
      assert.equal(access.personallyCheckedIn, false);
      assert.equal(access.contentHidden, false);
      const workspace: any = await admin.view("/dashboard");
      assert.equal(workspace.profileIncomplete, undefined);
      assert.equal(workspace.submissionAccess.canCommit, true);
      await createPortalMediaAuthorizer(admin)("fake_bob", {
        teamId: team,
        revision: 0,
      });
      await admin.command("save-project", {
        revision: 0,
        project: payload("Admin unprofiled draft"),
      });
      const first = await admin.command("submit-project", {
        revision: 1,
        project: payload("Admin unprofiled commit"),
      });
      assert.equal(first.attemptsUsed, 1);
      f.clock("2026-11-02T08:00:00.000Z");
      assert.equal((await submissionAccess(admin, team)).canCommit, true);
      const second = await admin.command("submit-project", {
        revision: 2,
        project: payload("Admin after close"),
      });
      assert.equal(second.attemptsUsed, 2);
      const third = await admin.command("submit-project", {
        revision: 3,
        project: payload("Admin third"),
      });
      assert.equal(third.attemptsUsed, 3);
      await assert.rejects(
        admin.command("save-project", {
          revision: 4,
          project: payload("No fourth edit"),
        }),
        { code: "PROJECT_LOCKED_AFTER_THIRD_SUBMISSION" },
      );
      assert.deepEqual(await rows(f.db, "SELECT * FROM write_guards"), []);
      await assert.rejects(
        f.service("admin").command("save-project", {
          revision: 0,
          project: payload("Not own team"),
        }),
        { code: "LEADER_REQUIRED" },
      );
      assert.equal(
        (await submissionAccess(f.service("admin"), team)).adminSubmissionTest,
        false,
      );
    } finally {
      await f.db.close();
    }
  });
  test(`${engine}: participant payload and direct draft/history/media endpoints stay hidden before start, boundaries and timezone are authoritative`, async () => {
    const f = await fixture(engine);
    try {
      await attend(f.db, "fake_alice");
      const normal = f.service("alice");
      const policy = (await normal.settings(true)).policy;
      const start = Date.parse(policy.submissionOpen),
        end = Date.parse(policy.submissionClose!);
      f.clock(new Date(start).toISOString());
      await normal.command("save-project", {
        revision: 0,
        project: payload("PRIVATE_PRESTART_DRAFT"),
      });
      for (const path of [
        "/dashboard",
        "/dashboard/team",
        "/submission",
        "/dashboard/submission",
      ]) {
        f.clock(new Date(start - 1).toISOString());
        const before: any = await normal.view(path);
        assert.equal(before.submissionAccess.contentHidden, true);
        assert.equal(before.project, undefined);
        assert.deepEqual(before.attempts, []);
        assert.deepEqual(before.feedback, []);
        assert.doesNotMatch(JSON.stringify(before), /PRIVATE_PRESTART_DRAFT/);
      }
      await assert.rejects(normal.view("/project-history"), {
        code: "TEAM_CHECKIN_REQUIRED",
      });
      await assert.rejects(
        normal.command("save-project", {
          revision: 1,
          project: payload("Not early"),
        }),
        { code: "SUBMISSIONS_CLOSED" },
      );
      await assert.rejects(
        createPortalMediaAuthorizer(normal)("fake_alice", {
          teamId: "fake_team1",
          revision: 1,
        }),
        { code: "SUBMISSIONS_CLOSED" },
      );
      for (const when of [start, start + 1, end - 1]) {
        f.clock(new Date(when).toISOString());
        const a = await submissionAccess(normal, "fake_team1");
        assert.equal(a.canCommit, true);
        assert.equal(a.contentHidden, false);
      }
      for (const when of [end, end + 1]) {
        f.clock(new Date(when).toISOString());
        const a = await submissionAccess(normal, "fake_team1");
        assert.equal(a.canCommit, false);
        assert.equal(a.contentHidden, false);
        assert.equal(a.canRead, true);
      }
      const istLocal = new Date(start + 5.5 * 3600_000)
        .toISOString()
        .replace("Z", "+05:30");
      const shifted = {
        ...policy,
        submissionOpen: new Date(istLocal).toISOString(),
      };
      assert.equal(
        Date.parse(shifted.submissionOpen),
        start,
        "IST input represents the same UTC opening instant",
      );
      await batch(f.db, [
        ["UPDATE event_settings SET policy=?", JSON.stringify(shifted)],
      ]);
      f.clock(new Date(start).toISOString());
      assert.equal(
        (await submissionAccess(normal, "fake_team1")).canCommit,
        true,
      );
      await batch(f.db, [
        [
          "UPDATE event_settings SET policy=?",
          JSON.stringify({
            ...policy,
            submissionOpen: new Date(start + 3600_000).toISOString(),
          }),
        ],
      ]);
      assert.equal(
        (await submissionAccess(normal, "fake_team1")).contentHidden,
        true,
        "Postponing opening revokes content projection immediately",
      );
      await assert.rejects(
        normal.command("save-project", {
          revision: 1,
          project: payload("Postponed"),
        }),
        { code: "SUBMISSIONS_CLOSED" },
      );
    } finally {
      await f.db.close();
    }
  });
  test(`${engine}: owner and admin test access fail closed for inactive/nonmember/removed/frozen state, not missing schedule`, async () => {
    const f = await fixture(engine);
    try {
      await batch(f.db, [
        [
          "INSERT INTO portal_roles VALUES('fake_bob','admin','fake_owner','2026-10-22T08:00:00Z')",
        ],
        [
          "UPDATE event_settings SET policy=?",
          JSON.stringify({
            ...(await f.service("owner").settings(true)).policy,
            submissionClose: null,
          }),
        ],
      ]);
      const admin = f.service("bob");
      assert.equal((await submissionAccess(admin, team)).canCommit, true);
      await admin.command("save-project", {
        revision: 0,
        project: payload("No schedule admin"),
      });
      const p: any = await one(
        f.db,
        "SELECT * FROM projects WHERE team_id=?",
        team,
      );
      await admin.command("admin-remove-own-test-project", {
        projectId: p.id,
        confirmation: "REMOVE_TEST_PROJECT",
      });
      await assert.rejects(
        admin.command("save-project", {
          revision: 1,
          project: payload("Removed"),
        }),
        { code: "RECORD_REMOVED" },
      );
      assert.equal(
        (await submissionAccess(f.service("alice"), "fake_team1"))
          .contentHidden,
        true,
      );
      await batch(f.db, [
        ["UPDATE teams SET leader_id='fake_carol' WHERE id=?", team],
      ]);
      assert.equal(
        (await submissionAccess(admin, team)).adminSubmissionTest,
        false,
      );
      await batch(f.db, [
        [
          "INSERT INTO teams VALUES('owner-test','Owner synthetic team','fake_owner','','2026-10-22T08:00:00Z')",
        ],
        [
          "INSERT INTO memberships VALUES('fake_owner','owner-test','2026-10-22T08:00:00Z')",
        ],
      ]);
      const owner = f.service("owner");
      assert.equal(
        (await submissionAccess(owner, "owner-test")).canCommit,
        true,
      );
      await owner.command("save-project", {
        revision: 0,
        project: payload("Owner draft"),
      });
      await batch(f.db, [
        [
          "INSERT INTO result_snapshots(id,policy_version,source_revision,payload,created_at,frozen_by) SELECT 'access-frozen',1,version,'[]','2026-10-22T08:00:00Z','fake_owner' FROM scoring_revision WHERE id=1",
        ],
      ]);
      assert.equal(
        (await submissionAccess(owner, "owner-test")).canCommit,
        false,
      );
      await assert.rejects(
        owner.command("save-project", {
          revision: 1,
          project: payload("Frozen"),
        }),
        { code: "RESULTS_FROZEN" },
      );
    } finally {
      await f.db.close();
    }
  });
  test(`${engine}: missing schedule preserves admin testing, inactive/nonmember actors lose it and direct HTTP never projects pre-start drafts`, async () => {
    const f = await fixture(engine);
    try {
      await batch(f.db, [
        [
          "INSERT INTO portal_roles VALUES('fake_bob','admin','fake_owner','2026-10-22T08:00:00Z')",
        ],
        ["DELETE FROM event_settings"],
      ]);
      const admin = f.service("bob");
      assert.equal((await submissionAccess(admin, team)).canCommit, true);
      await admin.command("save-project", {
        revision: 0,
        project: payload("Admin without settings"),
      });
      assert.equal(
        (await submissionAccess(f.service("alice"), "fake_team1"))
          .contentHidden,
        true,
      );
      await batch(f.db, [
        [
          "INSERT INTO record_removals(kind,target_id,active,reason,actor_id,updated_at) VALUES('participant','fake_bob',1,'Synthetic inactive test','fake_owner','2026-10-22T08:00:00Z')",
        ],
      ]);
      assert.equal(
        (await submissionAccess(admin, team)).adminSubmissionTest,
        false,
      );
      await assert.rejects(
        admin.command("save-project", {
          revision: 1,
          project: payload("Inactive must not save"),
        }),
      );
      const response = await handlePortal(
        new Request("http://localhost/api/portal?view=/submission"),
        { db: f.db, identity: fixtures.alice, key: LOCAL_CREDIT_KEY },
      );
      assert.equal(response.status, 200);
      const view: any = await response.json();
      assert.equal(view.submissionAccess.contentHidden, true);
      assert.equal(view.project, undefined);
      assert.deepEqual(view.attempts, []);
    } finally {
      await f.db.close();
    }
  });
}
