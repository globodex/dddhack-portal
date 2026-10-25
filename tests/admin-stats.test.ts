import assert from "node:assert/strict";
import { test } from "node:test";
import { LocalDatabase } from "../lib/local-test/sqlite";
import { batch, one, type Database } from "../lib/db";
import { readAdminStats, type AdminStatsDTO } from "../lib/admin-stats";
import { personStatus } from "../lib/portal-status";
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

test("reused route authority is checked freshly before collection counts", async () => {
  const db = new LocalDatabase(":memory:");
  db.migrate();
  try {
    await seedLocal(db);
    const service = new PortalService(
      db,
      fixtures.admin,
      LOCAL_CREDIT_KEY,
      () => time,
    );
    const actor = await service.staff();
    let repeatedBootstrap = false;
    const reader = {
      db,
      async staff() {
        repeatedBootstrap = true;
        throw new Error("Unexpected repeated bootstrap");
      },
    };
    assert.equal(
      (await readAdminStats(reader, "participants", actor)).collection,
      "participants",
    );
    assert.equal(repeatedBootstrap, false);
    await batch(db, [
      [
        "INSERT INTO portal_roles VALUES('fake_admin','participant','fake_owner',?)",
        time,
      ],
    ]);
    await assert.rejects(readAdminStats(reader, "participants", actor), {
      code: "ADMIN_REQUIRED",
    });
    await batch(db, [
      ["DELETE FROM portal_roles WHERE user_id='fake_admin'"],
      removal("participant", "fake_admin"),
    ]);
    await assert.rejects(readAdminStats(reader, "teams", actor), {
      code: "ADMIN_REQUIRED",
    });
    await assert.rejects(
      readAdminStats(reader, "submissions", { ...actor, deactivated: true }),
      { code: "ADMIN_REQUIRED" },
    );
    const participant = await new PortalService(
      db,
      fixtures.alice,
      LOCAL_CREDIT_KEY,
      () => time,
    ).actor();
    await assert.rejects(readAdminStats(reader, "participants", participant), {
      code: "ADMIN_REQUIRED",
    });
  } finally {
    db.close();
  }
});

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
              Array(result.cards.length).fill(0),
            );
            assert.equal(result.scope, "Entire collection");
            if (collection === "teams")
              assert.deepEqual(
                result.teamSizes?.map((size) => size.value),
                [0, 0, 0, 0, 0],
              );
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
            going: 11,
            checked_in: 0,
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
          const filtered = (await service().view("/admin/participants", {
            search: "no-such-participant",
            page: 7,
          })) as { stats: AdminStatsDTO };
          assert.deepEqual(filtered.stats, result);
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
          assert.equal(
            result.cards.find((card) => card.key === "approved")?.label,
            "Approved teams",
          );
        },
      );
      await t.test(
        "one team-size breakdown uses current memberships, excludes empty/removed teams, and remains independent of filtering",
        async () => {
          const before = await stats("teams");
          assert.deepEqual(before.teamSizes, [
            { label: "Solo", value: 1 },
            { label: "2 people", value: 1 },
            { label: "3 people", value: 0 },
            { label: "4 people", value: 0 },
            { label: "5 people", value: 1 },
          ]);
          await batch(db, [
            [
              "INSERT INTO teams VALUES('four-person-team','Four person team','fake_owner','',?)",
              time,
            ],
            ...["owner", "admin", "judge", "judge2"].map(
              (who) =>
                [
                  "INSERT INTO memberships VALUES(?,?,?)",
                  "fake_" + who,
                  "four-person-team",
                  time,
                ] as [string, ...unknown[]],
            ),
            [
              "DELETE FROM memberships WHERE team_id='fake_team5' AND user_id IN ('fake_hari','fake_ivy')",
            ],
          ]);
          const changed = await stats("teams");
          assert.deepEqual(
            changed.teamSizes?.map((size) => size.value),
            [1, 1, 1, 1, 0],
          );
          assert.equal(values(changed).formed, 5);
          const filtered = (await service().view("/admin/teams", {
            search: "missing-team",
            page: 9,
          })) as { stats: AdminStatsDTO };
          assert.deepEqual(filtered.stats, changed);
          await batch(db, [
            ...["hari", "ivy"].map(
              (who) =>
                [
                  "INSERT INTO memberships VALUES(?,?,?)",
                  "fake_" + who,
                  "fake_team5",
                  time,
                ] as [string, ...unknown[]],
            ),
          ]);
        },
      );
      await t.test(
        "Going and Checked-in follow status/absence precedence while check-in also requires valid attendance evidence",
        async () => {
          const initial = values(await stats("participants"));
          // A manual Checked in label alone is not an attendance record.
          assert.equal(
            (await personStatus(service(), "fake_alice")).status,
            "Checked in",
          );
          assert.equal(
            (await personStatus(service(), "fake_alice")).checkedIn,
            false,
          );
          await attend(db, "fake_alice");
          assert.equal(
            values(await stats("participants")).checked_in,
            initial.checked_in! + 1,
          );
          await batch(db, [
            [
              "UPDATE participant_status_overrides SET status='Going',updated_at=? WHERE user_id='fake_alice'",
              time,
            ],
          ]);
          const going = values(await stats("participants"));
          assert.equal(going.checked_in, initial.checked_in);
          assert.equal(going.going, initial.going! + 1);
          assert.equal(
            (await one<{ n: number }>(
              db,
              "SELECT count(*) n FROM manual_checkins WHERE user_id='fake_alice'",
            ))!.n,
            1,
          );
          await batch(db, [
            [
              "UPDATE participant_status_overrides SET updated_at='2026-10-22T06:00:00.000Z' WHERE user_id='fake_alice'",
            ],
          ]);
          assert.equal(
            (await personStatus(service(), "fake_alice")).status,
            "Absent",
          );
          assert.equal(
            values(await stats("participants")).going,
            initial.going,
          );
          await batch(db, [
            [
              "UPDATE participant_status_overrides SET status='Checked in' WHERE user_id='fake_alice'",
            ],
          ]);
          // A reconciled absence is newer than this stale override despite preserved receipt.
          assert.equal(
            (await personStatus(service(), "fake_alice")).checkedIn,
            true,
          );
          assert.equal(
            values(await stats("participants")).checked_in,
            initial.checked_in,
          );
          await batch(db, [
            [
              "UPDATE participant_status_overrides SET updated_at=? WHERE user_id='fake_alice'",
              time,
            ],
            [
              "UPDATE registrations SET status='pending' WHERE email='alice@portal.test'",
            ],
          ]);
          assert.equal(
            values(await stats("participants")).checked_in,
            initial.checked_in,
          );
          await batch(db, [
            [
              "UPDATE registrations SET status='approved' WHERE email='alice@portal.test'",
            ],
          ]);
          assert.equal(
            values(await stats("participants")).checked_in,
            initial.checked_in! + 1,
          );
          // A roster-only approved email can be Going, then explicitly reconciled Absent.
          await batch(db, [
            [
              "UPDATE registrations SET status='approved' WHERE email='roster-only@portal.test'",
            ],
          ]);
          const beforeAbsence = values(await stats("participants"));
          await batch(db, [
            [
              "INSERT INTO registration_absences VALUES('roster-only@portal.test',?,?)",
              time,
              time,
            ],
          ]);
          assert.equal(
            values(await stats("participants")).going,
            beforeAbsence.going! - 1,
          );
        },
      );
      await t.test(
        "Projects, visible committed versions and never-submitted Drafts preserve hidden and durable history",
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
            versions: 1,
            drafts: 1,
          });
          const cards = (await stats("submissions")).cards;
          assert.deepEqual(
            cards.map((card) => card.label),
            ["Projects", "Submissions", "Drafts"],
          );
          assert.equal(cards[1].caption, "Committed versions");
          // Editing a submitted project's working draft is not a never-submitted draft.
          await batch(db, [
            [
              "UPDATE projects SET draft=?,revision=revision+1,updated_at=? WHERE id='active-project'",
              JSON.stringify({ projectName: "Later saved edit" }),
              "2026-11-01T05:00:00.000Z",
            ],
          ]);
          assert.equal(values(await stats("submissions")).drafts, 1);
          await batch(db, [removal("submission", "visible-v1")]);
          assert.deepEqual(values(await stats("submissions")), {
            projects: 2,
            versions: 0,
            drafts: 1,
          });
          // Legacy/pruned history can retain only the positive immutable attempt ledger.
          await batch(db, [
            ["INSERT INTO submission_attempt_ledger VALUES('fake_team1',1)"],
          ]);
          assert.deepEqual(values(await stats("submissions")), {
            projects: 2,
            versions: 0,
            drafts: 0,
          });
          const filtered = (await service().view("/admin/submissions", {
            search: "missing-project",
            page: 6,
          })) as { stats: AdminStatsDTO };
          assert.deepEqual(filtered.stats, await stats("submissions"));
          await batch(db, [removal("project", "active-project")]);
          assert.deepEqual(values(await stats("submissions")), {
            projects: 1,
            versions: 0,
            drafts: 0,
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
