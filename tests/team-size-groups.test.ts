import { test } from "node:test";
import assert from "node:assert/strict";
import { LocalDatabase } from "../lib/local-test/sqlite";
import { batch } from "../lib/db";
import { readAdminStats, type TeamSizeGroupKey } from "../lib/admin-stats";
import { createPGliteFixture } from "./neon-db-fixture";
import { seedLocal, fixtures, LOCAL_CREDIT_KEY } from "../scripts/fixtures";
import { attend } from "./helpers";
import { PortalService } from "../lib/service";

for (const engine of ["sqlite", "postgres"] as const)
  test(`${engine}: team-size groups use whole active populations, real locks/approval and committed history`, async () => {
    const local = engine === "sqlite" ? new LocalDatabase(":memory:") : null;
    local?.migrate();
    const pg = engine === "postgres" ? await createPGliteFixture() : null;
    const db = pg?.db || local!;
    const time = "2026-10-22T08:00:00.000Z";
    const service = (who = "owner") =>
      new PortalService(db, fixtures[who], LOCAL_CREDIT_KEY, () => time);
    const get = () =>
      readAdminStats({ db, staff: async () => ({}) as any }, "teams");
    try {
      const empty = await get();
      assert.equal(empty.teamSizeGroups?.length, 5);
      for (const group of empty.teamSizeGroups!) {
        assert.equal(group.total, 0);
        assert.equal(group.participants, 0);
        assert.deepEqual(
          group.sizes.map((size) => size.value),
          [0, 0, 0, 0, 0],
        );
        assert.equal(group.empty, 0);
        assert.equal(group.overCapacity, 0);
      }
      await seedLocal(db);
      await attend(db, "fake_bob", "fake_eve");
      await batch(db, [
        ["INSERT INTO team_locks VALUES('fake_team1','fake_alice',?)", time],
        ["INSERT INTO team_locks VALUES('fake_team3','fake_bob',?)", time],
        [
          "INSERT INTO team_status_overrides(team_id,status,reason,actor_id,updated_at) VALUES('fake_team5','Locked','Display only','fake_owner',?)",
          time,
        ],
        [
          "INSERT INTO submission_versions VALUES('size-v1','fake_team3',1,'{}','2026-11-01T04:00:00.000Z')",
        ],
        [
          "INSERT INTO submission_versions VALUES('size-v2','fake_team3',2,'{}','2026-11-01T04:01:00.000Z')",
        ],
        [
          "INSERT INTO submission_versions VALUES('size-v3','fake_team5',1,'{}','2026-11-01T04:02:00.000Z')",
        ],
        [
          "INSERT INTO record_removals(kind,target_id,active,reason,actor_id,updated_at) VALUES('submission','size-v2',1,'Hidden history','fake_owner',?)",
          time,
        ],
      ]);
      await batch(db, [
        [
          "UPDATE registrations SET status='pending' WHERE email='bob@portal.test'",
        ],
        [
          "INSERT INTO participant_status_overrides VALUES('fake_eve','Absent','Approved attendance outcome','fake_owner',?)",
          time,
        ],
      ]);
      let stats = await get();
      const expected: Record<TeamSizeGroupKey, number[]> = {
        total: [1, 0, 1, 0, 1],
        locked: [1, 0, 1, 0, 0],
        approved: [1, 0, 0, 0, 0],
        submitted: [0, 0, 1, 0, 1],
        not_submitted: [1, 0, 0, 0, 0],
      };
      for (const group of stats.teamSizeGroups!) {
        assert.deepEqual(
          group.sizes.map((size) => size.value),
          expected[group.key],
          group.key,
        );
        assert.equal(group.participants, expected[group.key].reduce((sum, n, index) => sum + n * (index + 1), 0));
        assert.equal(
          group.total,
          expected[group.key].reduce((sum, n) => sum + n, 0),
        );
      }
      assert.deepEqual(stats.cards.map(card => card.participants), [9, 4, 1, 8]);
      assert.deepEqual(stats.teamSizes, stats.teamSizeGroups![0].sizes);
      const filtered = (await service().view("/admin/teams", {
        search: "No matching team",
        page: 20,
      })) as any;
      assert.deepEqual(filtered.stats.teamSizeGroups, stats.teamSizeGroups);
      await assert.rejects(readAdminStats(service("alice"), "teams"), {
        code: "ADMIN_REQUIRED",
      });
      await assert.rejects(readAdminStats(service("stranger"), "teams"), {
        code: "ADMIN_REQUIRED",
      });
      await batch(db, [
        [
          "INSERT INTO teams VALUES('size-empty','Empty synthetic team','fake_judge','',?)",
          time,
        ],
        ["INSERT INTO submission_attempt_ledger VALUES('fake_team1',1)"],
        [
          "INSERT INTO record_removals(kind,target_id,active,reason,actor_id,updated_at) VALUES('team','fake_team5',1,'Removed team','fake_owner',?)",
          time,
        ],
      ]);
      stats = await get();
      const groups = Object.fromEntries(
        stats.teamSizeGroups!.map((group) => [group.key, group]),
      );
      assert.equal(groups.total.total, 3);
      assert.equal(groups.total.empty, 1);
      assert.deepEqual(
        groups.submitted.sizes.map((size) => size.value),
        [1, 0, 1, 0, 0],
      );
      assert.equal(groups.not_submitted.total, 1);
      assert.equal(groups.not_submitted.empty, 1);
      for (const group of stats.teamSizeGroups!)
        assert.equal(
          group.total,
          group.sizes.reduce((sum, size) => sum + size.value, 0) +
            group.empty +
            group.overCapacity,
        );
      assert.doesNotMatch(
        JSON.stringify(stats),
        /portal\.test|phone|openaiOrgId|bio/,
      );
      let queries = 0;
      const tracked = {
        ...db,
        prepare(sql: string) {
          queries++;
          return db.prepare(sql);
        },
        batch: db.batch.bind(db),
      };
      await readAdminStats(
        { db: tracked, staff: async () => ({}) as any },
        "teams",
      );
      assert.equal(
        queries,
        1,
        "All five distributions share one aggregate query",
      );
    } finally {
      if (pg) await pg.pool.end();
      else local!.close();
    }
  });
