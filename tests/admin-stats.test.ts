import assert from "node:assert/strict";
import { test } from "node:test";
import { LocalDatabase } from "../lib/local-test/sqlite";
import { batch, one, type Database } from "../lib/db";
import { readAdminStats, type AdminStatsDTO } from "../lib/admin-stats";
import { PortalService } from "../lib/service";
import { fixtures, LOCAL_CREDIT_KEY, seedLocal } from "../scripts/fixtures";
import { attend } from "./helpers";
import { createPGliteFixture } from "./neon-db-fixture";

const time = "2026-10-22T08:00:00.000Z";
const values = (stats: AdminStatsDTO) =>
  Object.fromEntries(stats.cards.map((card) => [card.key, card.value]));
const removal = (kind: string, target: string) =>
  [
    "INSERT INTO record_removals(kind,target_id,active,reason,actor_id,updated_at) VALUES(?,?,1,'Synthetic removal','fake_owner',?)",
    kind,
    target,
    time,
  ] as [string, ...unknown[]];

test("staff authorization runs before any aggregate SQL and invalid collection input fails closed", async () => {
  let prepared = 0;
  const db = {
    prepare() {
      prepared++;
      throw new Error("Must not query");
    },
  } as unknown as Database;
  await assert.rejects(
    readAdminStats(
      {
        db,
        async staff() {
          throw Object.assign(new Error("Admin required"), {
            code: "ADMIN_REQUIRED",
          });
        },
      },
      "participants",
    ),
    { code: "ADMIN_REQUIRED" },
  );
  assert.equal(prepared, 0);
  await assert.rejects(
    readAdminStats(
      {
        db,
        async staff() {
          return {} as any;
        },
      },
      "unknown" as any,
    ),
    { code: "INVALID_STATS_COLLECTION" },
  );
  assert.equal(prepared, 0);
});

for (const engine of ["sqlite", "postgres"] as const) {
  test(`${engine}: collection aggregates preserve authorization, roster partition, effective team approval and visible submission history`, async (t) => {
    const local = engine === "sqlite" ? new LocalDatabase(":memory:") : null;
    local?.migrate();
    const pg = engine === "postgres" ? await createPGliteFixture() : null;
    const db = pg?.db || local!;
    const service = (who = "owner") =>
      new PortalService(db, fixtures[who], LOCAL_CREDIT_KEY, () => time);
    let calls = 0;
    const aggregateDb: Database = {
      prepare(sql) {
        calls++;
        assert.match(sql, /^WITH /);
        return db.prepare(sql);
      },
      batch: db.batch.bind(db),
    };
    const stats = (collection: "participants" | "teams" | "submissions") =>
      readAdminStats(
        {
          db: aggregateDb,
          async staff() {
            return service().staff();
          },
        },
        collection,
      );
    try {
      await t.test(
        "one aggregate result per route handles empty collections without NaN or PII",
        async () => {
          const emptyStaff = {
            db: aggregateDb,
            async staff() {
              return {} as any;
            },
          };
          for (const collection of [
            "participants",
            "teams",
            "submissions",
          ] as const) {
            const before = calls;
            const result = await readAdminStats(emptyStaff, collection);
            assert.equal(calls, before + 1);
            assert.deepEqual(
              result.cards.map((card) => card.value),
              [0, 0, 0],
            );
            assert.equal(result.scope, "Entire collection");
          }
        },
      );
      await seedLocal(db);
      await t.test(
        "existing participants, Viewers, volunteers, judges, anonymous and removed staff cannot obtain counts",
        async () => {
          for (const who of ["alice", "stranger", "judge"])
            await assert.rejects(readAdminStats(service(who), "participants"), {
              code: "ADMIN_REQUIRED",
            });
          await batch(db, [
            [
              "INSERT INTO portal_roles VALUES('fake_judge2','volunteer','fake_owner',?)",
              time,
            ],
          ]);
          await assert.rejects(
            readAdminStats(service("judge2"), "participants"),
            { code: "ADMIN_REQUIRED" },
          );
          await assert.rejects(
            readAdminStats(
              new PortalService(db, null, LOCAL_CREDIT_KEY),
              "teams",
            ),
            { code: "SIGN_IN_REQUIRED" },
          );
          await batch(db, [removal("participant", "fake_admin")]);
          await assert.rejects(
            readAdminStats(service("admin"), "submissions"),
            { code: "PARTICIPANT_REMOVED" },
          );
          await batch(db, [
            [
              "UPDATE record_removals SET active=0 WHERE kind='participant' AND target_id='fake_admin'",
            ],
          ]);
          assert.equal(
            (await readAdminStats(service("admin"), "participants")).collection,
            "participants",
          );
        },
      );
      await t.test(
        "roster union deduplicates sources, includes no-account emails and excludes Viewers/removals/terminal records",
        async () => {
          await batch(db, [
            [
              "INSERT INTO registrations(email,status) VALUES('roster-only@portal.test','pending')",
            ],
            [
              "INSERT INTO luma_roster VALUES('luma-only@portal.test','fake_owner',?)",
              time,
            ],
            [
              "INSERT INTO luma_roster VALUES('ALICE@portal.test','fake_owner',?)",
              time,
            ],
            removal("participant", "fake_bob"),
          ]);
          await service().command("admin-delete-participant", {
            userId: "fake_dave",
            expectedLeaderTeamIds: [],
            confirmation: "DELETE_PARTICIPANT",
          });
          const before = calls;
          const result = await stats("participants");
          assert.equal(calls, before + 1);
          assert.deepEqual(values(result), {
            roster: 14,
            accounts: 12,
            without_account: 2,
          });
          assert.equal(result.cards[1].label, "Portal accounts");
          assert.doesNotMatch(
            JSON.stringify(result),
            /@|fake_|email|phone|manual|CSV|Profile complete|Signed in/i,
          );
          // Actual profile completeness is deliberately not approximated by completed_at.
          await batch(db, [
            [
              "UPDATE profile_details SET phone='invalid' WHERE user_id='fake_alice'",
            ],
          ]);
          assert.deepEqual(await stats("participants"), result);
        },
      );
      await t.test(
        "approval is all-current-member Going/Checked in, empty false, independent of actual lock and manual team status",
        async () => {
          await batch(db, [
            [
              "INSERT INTO teams VALUES('empty-team','Empty team','fake_judge','',?)",
              time,
            ],
            [
              "INSERT INTO teams VALUES('removed-team','Removed team','fake_judge','',?)",
              time,
            ],
            removal("team", "removed-team"),
            [
              "INSERT INTO team_locks VALUES('fake_team1','fake_alice',?)",
              time,
            ],
            ["INSERT INTO team_locks VALUES('fake_team3','fake_bob',?)", time],
            [
              "INSERT INTO team_status_overrides(team_id,status,reason,actor_id,updated_at) VALUES('fake_team5','Locked','Synthetic status only','fake_owner',?)",
              time,
            ],
            [
              "INSERT INTO participant_status_overrides VALUES('fake_eve','Absent','Synthetic absence','fake_owner',?)",
              time,
            ],
          ]);
          assert.deepEqual(values(await stats("teams")), {
            formed: 4,
            locked: 2,
            approved: 1,
          });
          await batch(db, [
            [
              "UPDATE registrations SET status='pending' WHERE email='alice@portal.test'",
            ],
          ]);
          assert.equal(values(await stats("teams")).approved, 0);
          await batch(db, [
            [
              "UPDATE registrations SET status='approved' WHERE email='alice@portal.test'",
            ],
          ]);
          // A reconciled absence overrides an older Going choice.
          await batch(db, [
            [
              "INSERT INTO participant_status_overrides VALUES('fake_alice','Going','Synthetic choice','fake_owner','2026-10-22T06:00:00.000Z')",
            ],
            [
              "INSERT INTO automatic_absences VALUES('fake_alice','2026-10-22T07:00:00.000Z','2026-10-22T07:00:00.000Z')",
            ],
          ]);
          assert.equal(values(await stats("teams")).approved, 0);
          // A later explicit Checked in state is approved again; no team lock changes.
          await batch(db, [
            [
              "UPDATE participant_status_overrides SET status='Checked in',updated_at=? WHERE user_id='fake_alice'",
              time,
            ],
          ]);
          const result = await stats("teams");
          assert.deepEqual(values(result), {
            formed: 4,
            locked: 2,
            approved: 1,
          });
          assert.match(result.note!, /can overlap/);
        },
      );
      await t.test(
        "distinct projects, submitted teams and visible versions do not multiply and never reset durable attempts",
        async () => {
          // Use the still-active team5 and restore its attendance eligibility for fixture writes.
          await batch(db, [
            [
              "UPDATE participant_status_overrides SET status='Checked in' WHERE user_id='fake_eve'",
            ],
          ]);
          await attend(db, "fake_eve", "fake_alice");
          await batch(db, [
            [
              "INSERT INTO projects(id,team_id,slug,draft,updated_at) VALUES('active-project','fake_team5','active-synthetic','{}',?)",
              time,
            ],
            [
              "INSERT INTO projects(id,team_id,slug,draft,updated_at) VALUES('draft-project','fake_team1','draft-synthetic','{}',?)",
              time,
            ],
            [
              "INSERT INTO submission_versions VALUES('visible-v1','fake_team5',1,'{}',?)",
              "2026-11-01T04:00:00.000Z",
            ],
            [
              "INSERT INTO submission_versions VALUES('hidden-v2','fake_team5',2,'{}',?)",
              "2026-11-01T04:01:00.000Z",
            ],
            removal("submission", "hidden-v2"),
          ]);
          const beforeLedger = await one(
            db,
            "SELECT * FROM submission_attempt_ledger WHERE team_id='fake_team5'",
          );
          assert.deepEqual(values(await stats("submissions")), {
            projects: 2,
            submitted_teams: 1,
            versions: 1,
          });
          await batch(db, [removal("project", "active-project")]);
          assert.deepEqual(values(await stats("submissions")), {
            projects: 1,
            submitted_teams: 0,
            versions: 0,
          });
          assert.deepEqual(
            await one(
              db,
              "SELECT * FROM submission_attempt_ledger WHERE team_id='fake_team5'",
            ),
            beforeLedger,
          );
          assert.equal(
            (await one<{ n: number }>(
              db,
              "SELECT count(*) n FROM submission_versions WHERE team_id='fake_team5'",
            ))!.n,
            2,
          );
        },
      );
    } finally {
      if (pg) await pg.pool.end();
      else local!.close();
    }
  });
}
