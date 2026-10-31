import assert from "node:assert/strict";
import { test } from "node:test";
import { setup } from "./helpers";
import { createPGliteFixture } from "./neon-db-fixture";
import { PortalService } from "../lib/service";
import { seedLocal, fixtures, LOCAL_CREDIT_KEY } from "../scripts/fixtures";
import { batch, one, rows } from "../lib/db";
const input = (teamId: string, title = "Synthetic added idea") => ({
  teamId,
  title,
  description: "An explicitly supplied synthetic idea.",
  confirmation: "ADD_TEAM_IDEA",
});
async function fixture(engine: string) {
  if (engine === "sqlite") return setup();
  const f = await createPGliteFixture();
  await seedLocal(f.db);
  let time = "2026-10-22T08:00:00.000Z";
  return {
    db: f.db,
    clock: (value: string) => {
      time = value;
    },
    service: (name = "alice") =>
      new PortalService(f.db, fixtures[name], LOCAL_CREDIT_KEY, () => time),
  };
}
for (const engine of ["sqlite", "postgres"]) {
  test(`${engine}: admin/owner add only missing idea to exact team including locked team after deadline`, async () => {
    const f = await fixture(engine);
    try {
      await batch(f.db, [
        [
          "INSERT INTO teams VALUES('idea-empty-a','Synthetic A','fake_alice','','2026-10-22T08:00:00Z')",
        ],
        [
          "INSERT INTO teams VALUES('idea-empty-b','Synthetic B','fake_bob','','2026-10-22T08:00:00Z')",
        ],
        ["DELETE FROM ideas WHERE team_id='fake_team3'"],
      ]);
      const review: any = await f
        .service("admin")
        .view("/admin/team-lock", { focus: "fake_team3" });
      await f.service("admin").command("admin-lock-team", {
        teamId: "fake_team3",
        expectedName: review.team.name,
        snapshotDigest: review.snapshotDigest,
        confirmation: "ADMIN_LOCK_TEAM",
      });
      f.clock("2026-11-02T08:00:00.000Z");
      const before = await rows(
        f.db,
        "SELECT * FROM memberships ORDER BY user_id",
      );
      await assert.rejects(
        f.service("alice").command("admin-add-team-idea", input("fake_team3")),
        { code: "ADMIN_REQUIRED" },
      );
      await f
        .service("admin")
        .command("admin-add-team-idea", input("fake_team3"));
      assert.equal(
        (await one<any>(f.db, "SELECT * FROM ideas WHERE team_id='fake_team3'"))
          ?.title,
        "Synthetic added idea",
      );
      assert.equal(
        await one(f.db, "SELECT * FROM ideas WHERE team_id='idea-empty-b'"),
        undefined,
      );
      await f
        .service("owner")
        .command(
          "admin-add-team-idea",
          input("idea-empty-b", "Owner supplied idea"),
        );
      await assert.rejects(
        f
          .service("admin")
          .command("admin-add-team-idea", input("fake_team3", "No overwrite")),
        { code: "TEAM_IDEA_EXISTS" },
      );
      await assert.rejects(
        f.service("admin").command("admin-add-team-idea", input("missing")),
        { code: "TEAM_NOT_FOUND" },
      );
      assert.deepEqual(
        await rows(f.db, "SELECT * FROM memberships ORDER BY user_id"),
        before,
      );
      assert.ok(
        await one(f.db, "SELECT * FROM team_locks WHERE team_id='fake_team3'"),
      );
      assert.equal(
        (
          await rows(
            f.db,
            "SELECT * FROM idea_revisions WHERE team_id IN ('fake_team3','idea-empty-b')",
          )
        ).length,
        2,
      );
      assert.deepEqual(await rows(f.db, "SELECT * FROM write_guards"), []);
    } finally {
      await f.db.close();
    }
  });
  test(`${engine}: concurrent/stale Add idea yields one winner, one conflict and no orphan revision/audit`, async () => {
    const f = await fixture(engine);
    try {
      await batch(f.db, [
        [
          "INSERT INTO teams VALUES('idea-race','Synthetic race','fake_alice','','2026-10-22T08:00:00Z')",
        ],
      ]);
      const results = await Promise.allSettled([
        f
          .service("admin")
          .command(
            "admin-add-team-idea",
            input("idea-race", "First synthetic idea"),
          ),
        f
          .service("owner")
          .command(
            "admin-add-team-idea",
            input("idea-race", "Second synthetic idea"),
          ),
      ]);
      assert.equal(results.filter((x) => x.status === "fulfilled").length, 1);
      const fail = results.find(
        (x) => x.status === "rejected",
      ) as PromiseRejectedResult;
      assert.equal(fail.reason.code, "TEAM_IDEA_EXISTS");
      assert.equal(
        (await rows(f.db, "SELECT * FROM ideas WHERE team_id='idea-race'"))
          .length,
        1,
      );
      assert.equal(
        (
          await rows(
            f.db,
            "SELECT * FROM idea_revisions WHERE team_id='idea-race'",
          )
        ).length,
        1,
      );
      assert.deepEqual(await rows(f.db, "SELECT * FROM write_guards"), []);
    } finally {
      await f.db.close();
    }
  });
  test(`${engine}: failed admin idea mutation rolls back; frozen state and removed team reject`, async () => {
    const f = await fixture(engine);
    try {
      await batch(f.db, [
        [
          "INSERT INTO teams VALUES('idea-fail','Synthetic fail','fake_alice','','2026-10-22T08:00:00Z')",
        ],
      ]);
      const admin = f.service("admin");
      const original = admin.mutate.bind(admin);
      admin.mutate = async (actor, action, entity, sql, detail, why) =>
        original(
          actor,
          action,
          entity,
          [
            ...sql,
            ["INSERT INTO deliberately_missing_synthetic_table VALUES(1)"],
          ],
          detail,
          why,
        );
      await assert.rejects(
        admin.command("admin-add-team-idea", input("idea-fail")),
      );
      assert.equal(
        await one(f.db, "SELECT * FROM ideas WHERE team_id='idea-fail'"),
        undefined,
      );
      assert.equal(
        (
          await rows(
            f.db,
            "SELECT * FROM idea_revisions WHERE team_id='idea-fail'",
          )
        ).length,
        0,
      );
      assert.deepEqual(await rows(f.db, "SELECT * FROM write_guards"), []);
      await batch(f.db, [
        [
          "INSERT INTO result_snapshots(id,policy_version,source_revision,payload,created_at,frozen_by) SELECT 'idea-frozen',1,version,'[]','2026-10-22T08:00:00Z','fake_owner' FROM scoring_revision WHERE id=1",
        ],
      ]);
      await assert.rejects(
        f.service("admin").command("admin-add-team-idea", input("idea-fail")),
        { code: "RESULTS_FROZEN" },
      );
    } finally {
      await f.db.close();
    }
  });
  test(`${engine}: stale locked-team card returns an idea conflict even when the insert trigger sees a concurrent winner`, async () => {
    const f = await fixture(engine);
    try {
      await batch(f.db, [["DELETE FROM ideas WHERE team_id='fake_team3'"]]);
      const lock: any = await f
        .service("admin")
        .view("/admin/team-lock", { focus: "fake_team3" });
      await f
        .service("admin")
        .command("admin-lock-team", {
          teamId: "fake_team3",
          expectedName: lock.team.name,
          snapshotDigest: lock.snapshotDigest,
          confirmation: "ADMIN_LOCK_TEAM",
        });
      f.clock("2026-11-02T08:00:00.000Z");
      const stale = f.service("admin"),
        original = stale.mutate.bind(stale);
      stale.mutate = async (...args) => {
        await f
          .service("owner")
          .command(
            "admin-add-team-idea",
            input("fake_team3", "Concurrent winning idea"),
          );
        return original(...args);
      };
      await assert.rejects(
        stale.command(
          "admin-add-team-idea",
          input("fake_team3", "Stale losing idea"),
        ),
        { code: "TEAM_IDEA_EXISTS" },
      );
      assert.equal(
        (await one<any>(f.db, "SELECT * FROM ideas WHERE team_id='fake_team3'"))
          ?.title,
        "Concurrent winning idea",
      );
      assert.equal(
        (
          await rows(
            f.db,
            "SELECT * FROM idea_revisions WHERE team_id='fake_team3'",
          )
        ).length,
        1,
      );
      assert.deepEqual(await rows(f.db, "SELECT * FROM write_guards"), []);
    } finally {
      await f.db.close();
    }
  });
}
