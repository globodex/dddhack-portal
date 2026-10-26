import assert from "node:assert/strict";
import { test } from "node:test";
import { LocalDatabase } from "../lib/local-test/sqlite";
import { readAdminStats, type AdminStatsDTO } from "../lib/admin-stats";
import { PortalService } from "../lib/service";
import { batch, rows, type Database, type Statement } from "../lib/db";
import { authenticatedRequestEvidenceStatement } from "../lib/sign-in-evidence";
import { fixtures, LOCAL_CREDIT_KEY, seedLocal } from "../scripts/fixtures";
import { attend } from "./helpers";
import { createPGliteFixture } from "./neon-db-fixture";

const at = "2026-10-22T08:00:00.000Z";
const card = (stats: AdminStatsDTO, key: string) =>
  stats.cards.find((item) => item.key === key)!;
const bucket = (
  stats: AdminStatsDTO,
  key: string,
  dimension: "gender" | "profession",
  label: string,
) =>
  card(stats, key).breakdown![dimension].find((item) => item.label === label)!
    .value;
function reconcile(stats: AdminStatsDTO) {
  for (const item of stats.cards) {
    assert.ok(item.breakdown);
    const breakdown = item.breakdown;
    if (!breakdown.available) {
      assert.equal(item.value, null);
      assert.deepEqual(breakdown.gender, []);
      assert.deepEqual(breakdown.profession, []);
    } else {
      for (const axis of [breakdown.gender, breakdown.profession]) {
        assert.equal(
          axis.reduce((total, entry) => total + entry.value, 0),
          item.value,
        );
        assert.equal(new Set(axis.map((entry) => entry.key)).size, axis.length);
        for (const entry of axis)
          assert.ok(Number.isSafeInteger(entry.value) && entry.value >= 0);
      }
    }
  }
}

test("demographic aggregates authorize before querying and never expand ordinary participant or public payloads", async () => {
  let queries = 0;
  await assert.rejects(
    readAdminStats(
      {
        db: {
          prepare() {
            queries++;
            throw new Error("No private query");
          },
        } as unknown as Database,
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
  assert.equal(queries, 0);
  const db = new LocalDatabase(":memory:");
  db.migrate();
  try {
    await seedLocal(db);
    const service = (who: string) =>
      new PortalService(db, fixtures[who], LOCAL_CREDIT_KEY, () => at);
    for (const who of ["alice", "stranger", "judge"]) {
      await assert.rejects(readAdminStats(service(who), "participants"), {
        code: "ADMIN_REQUIRED",
      });
      await assert.rejects(service(who).view("/admin/participants"), {
        code: "ADMIN_REQUIRED",
      });
    }
    await assert.rejects(
      readAdminStats(
        new PortalService(db, null, LOCAL_CREDIT_KEY),
        "participants",
      ),
      { code: "SIGN_IN_REQUIRED" },
    );
    await batch(db, [
      [
        "INSERT INTO portal_roles VALUES('fake_judge2','volunteer','fake_owner',?)",
        at,
      ],
    ]);
    const volunteer = await service("judge2").view("/admin/participants");
    assert.equal("stats" in volunteer, false);
    for (const route of [
      "/discover/participants",
      "/discover/teams",
      "/projects",
    ]) {
      const view = await service("stranger").view(route);
      assert.doesNotMatch(
        JSON.stringify(view),
        /breakdown|Other saved response|Confirmed sign-ins only/,
      );
    }
    const admin = service("admin"),
      actor = await admin.staff();
    await batch(db, [
      [
        "INSERT INTO portal_roles VALUES('fake_admin','participant','fake_owner',?)",
        at,
      ],
    ]);
    await assert.rejects(readAdminStats(admin, "participants", actor), {
      code: "ADMIN_REQUIRED",
    });
  } finally {
    db.close();
  }
});

for (const engine of ["sqlite", "postgres"] as const) {
  test(`${engine}: per-card gender and profession groups use exact whole-collection cohorts without inventing history`, async (t) => {
    const local = engine === "sqlite" ? new LocalDatabase(":memory:") : null;
    local?.migrate();
    const pg = engine === "postgres" ? await createPGliteFixture() : null;
    const db = pg?.db || local!;
    const service = (who = "owner") =>
      new PortalService(db, fixtures[who], LOCAL_CREDIT_KEY, () => at);
    const get = () => readAdminStats(service(), "participants");
    try {
      await t.test(
        "empty populations have real zero buckets while unknown sign-ins have no fabricated zero breakdown",
        async () => {
          const empty = await readAdminStats(
            {
              db,
              async staff() {
                return {} as any;
              },
            },
            "participants",
          );
          reconcile(empty);
          for (const item of empty.cards) assert.equal(item.value, 0);
          await seedLocal(db);
          const unknown = await get();
          assert.equal(card(unknown, "signed_in").value, null);
          assert.deepEqual(card(unknown, "signed_in").breakdown, {
            available: false,
            gender: [],
            profession: [],
          });
          reconcile(unknown);
        },
      );
      await t.test(
        "saved edits, legacy choices, confirmed defaults and incomplete-only registration prefills stay distinct",
        async () => {
          await batch(db, [
            ["UPDATE profiles SET gender='man' WHERE user_id='fake_alice'"],
            [
              "UPDATE profile_details SET best_description='Startup Founder' WHERE user_id='fake_alice'",
            ],
            ["UPDATE profiles SET gender='woman' WHERE user_id='fake_bob'"],
            [
              "UPDATE profile_details SET best_description='College Student' WHERE user_id='fake_bob'",
            ],
            [
              "UPDATE profile_details SET best_description='Independent Developer' WHERE user_id='fake_carol'",
            ],
            [
              "UPDATE profiles SET gender='self-described',gender_description='PRIVATE-GENDER-TEXT' WHERE user_id='fake_dave'",
            ],
            [
              "UPDATE profile_details SET best_description='PRIVATE-LEGACY dave@example.test' WHERE user_id='fake_dave'",
            ],
            [
              "UPDATE profiles SET gender='prefer-not-to-say' WHERE user_id IN ('fake_eve','fake_frank')",
            ],
            [
              "UPDATE participant_profiles SET gender_confirmed=0 WHERE user_id='fake_eve'",
            ],
            [
              "UPDATE profile_details SET best_description='Other (non-tech)' WHERE user_id='fake_frank'",
            ],
            [
              "UPDATE profile_details SET best_description='Working Professional' WHERE user_id='fake_gina'",
            ],
            ["DELETE FROM participant_profiles WHERE user_id='fake_hari'"],
            [
              "INSERT INTO roster_prefills VALUES('hari@portal.test',?,?)",
              JSON.stringify({
                bestDescription: "College Student",
                sex: "Female",
              }),
              at,
            ],
            [
              "INSERT INTO roster_prefills VALUES('eve@portal.test',?,?)",
              JSON.stringify({
                bestDescription: "School Student",
                sex: "Male",
              }),
              at,
            ],
            [
              "INSERT INTO roster_prefills VALUES('alice@portal.test',?,?)",
              JSON.stringify({ bestDescription: "School Student" }),
              at,
            ],
            [
              "INSERT INTO registrations(email,status) VALUES('new-roster@example.test','pending')",
            ],
            [
              "INSERT INTO luma_roster VALUES('new-roster@example.test','fake_owner',?)",
              at,
            ],
            [
              "INSERT INTO roster_prefills VALUES('new-roster@example.test',?,?)",
              JSON.stringify({
                bestDescription: "School Student",
                sex: "Female",
              }),
              at,
            ],
            [
              "UPDATE profiles SET gender='woman' WHERE user_id='fake_stranger'",
            ],
            [
              "UPDATE profile_details SET best_description='Working Professional' WHERE user_id='fake_stranger'",
            ],
          ]);
          const stats = await get();
          reconcile(stats);
          assert.equal(card(stats, "roster").value, 15);
          assert.equal(bucket(stats, "roster", "gender", "Male"), 1);
          assert.equal(bucket(stats, "roster", "gender", "Female"), 1);
          assert.equal(bucket(stats, "roster", "gender", "Self-described"), 1);
          assert.equal(
            bucket(stats, "roster", "gender", "Prefer not to say"),
            1,
          );
          assert.equal(bucket(stats, "roster", "gender", "Not provided"), 3);
          assert.equal(
            bucket(stats, "roster", "profession", "Startup Founder"),
            1,
          );
          assert.equal(
            bucket(stats, "roster", "profession", "College Student"),
            2,
          );
          assert.equal(
            bucket(stats, "roster", "profession", "School Student"),
            1,
          );
          assert.equal(
            bucket(stats, "roster", "profession", "Other (non-tech)"),
            1,
          );
          assert.equal(
            bucket(stats, "roster", "profession", "Other saved response"),
            1,
          );
          assert.doesNotMatch(
            JSON.stringify(stats),
            /PRIVATE-|example\.test|portal\.test|gender_description/,
          );
          const before = stats.cards.map((item) => item.value);
          await batch(db, [
            [
              "UPDATE profile_details SET best_description='Working Professional' WHERE user_id='fake_alice'",
            ],
          ]);
          const edited = await get();
          reconcile(edited);
          assert.deepEqual(
            edited.cards.map((item) => item.value),
            before,
          );
          assert.equal(
            bucket(edited, "roster", "profession", "Startup Founder"),
            0,
          );
          assert.equal(
            bucket(edited, "roster", "profession", "Working Professional"),
            2,
          );
        },
      );
      await t.test(
        "Going excludes check-in and Pending contains only unapproved people on pending teams",
        async () => {
          await attend(db, "fake_alice");
          await batch(db, [
            [
              "UPDATE registrations SET status='pending' WHERE email='bob@portal.test'",
            ],
          ]);
          const stats = await get();
          reconcile(stats);
          assert.equal(card(stats, "checked_in").value, 1);
          assert.equal(bucket(stats, "checked_in", "gender", "Male"), 1);
          assert.equal(
            bucket(stats, "checked_in", "profession", "Working Professional"),
            1,
          );
          assert.equal(card(stats, "going").value, 11);
          assert.equal(bucket(stats, "going", "gender", "Male"), 0);
          assert.equal(card(stats, "pending").value, 1);
          assert.equal(bucket(stats, "pending", "gender", "Female"), 1);
          assert.equal(
            bucket(stats, "pending", "profession", "College Student"),
            1,
          );
          assert.equal(
            bucket(stats, "pending", "gender", "Non-binary"),
            0,
            "Teamless pending person and approved teammates are not Pending",
          );
        },
      );
      await t.test(
        "proven signed-in cohort includes Viewers and lower-bound buckets do not include unproven accounts",
        async () => {
          for (const who of ["alice", "bob", "stranger"])
            await batch(db, [
              authenticatedRequestEvidenceStatement(
                { ...fixtures[who], source: "neon", emailVerified: true },
                at,
              )!,
            ]);
          const stats = await get();
          reconcile(stats);
          const signed = card(stats, "signed_in");
          assert.equal(signed.value, 3);
          assert.equal(signed.lowerBound, true);
          assert.equal(signed.breakdown!.scope, "Confirmed sign-ins only");
          assert.equal(bucket(stats, "signed_in", "gender", "Female"), 2);
          assert.equal(bucket(stats, "signed_in", "gender", "Male"), 1);
          assert.equal(
            bucket(stats, "signed_in", "profession", "Working Professional"),
            2,
          );
          assert.equal(
            bucket(stats, "signed_in", "profession", "College Student"),
            1,
          );
          assert.equal(
            card(stats, "roster").value,
            15,
            "A Viewer sign-in does not create registration",
          );
          await batch(db, [
            [
              "UPDATE participant_profiles SET gender_confirmed=0 WHERE user_id='fake_bob'",
            ],
          ]);
          const changed = await get();
          reconcile(changed);
          assert.equal(card(changed, "signed_in").value, 3);
          assert.equal(
            bucket(changed, "signed_in", "gender", "Not provided"),
            1,
          );
        },
      );
      await t.test(
        "removals and terminal stubs never leak into cohorts and search/page cannot change breakdown populations",
        async () => {
          await batch(db, [
            [
              "INSERT INTO record_removals(kind,target_id,active,reason,actor_id,updated_at) VALUES('participant','fake_alice',1,'Synthetic removal','fake_owner',?)",
              at,
            ],
          ]);
          await service().command("admin-delete-participant", {
            userId: "fake_pending",
            expectedLeaderTeamIds: [],
            confirmation: "DELETE_PARTICIPANT",
          });
          const stats = await get();
          reconcile(stats);
          assert.equal(card(stats, "roster").value, 13);
          assert.equal(card(stats, "signed_in").value, 2);
          assert.equal(card(stats, "checked_in").value, 0);
          const filtered = (await service().view("/admin/participants", {
            search: "no-match",
            page: 8,
          })) as { stats: AdminStatsDTO };
          assert.deepEqual(filtered.stats, stats);
        },
      );
      await t.test(
        "a single bounded aggregate returns only fixed-category count rows, never private profile records",
        async () => {
          let calls = 0,
            returned = 0;
          const measured: Database = {
            prepare(sql) {
              calls++;
              assert.match(sql, /^WITH /);
              const statement = db.prepare(sql);
              const wrapped: Statement = {
                bind(...args) {
                  statement.bind(...args);
                  return wrapped;
                },
                async all<T>() {
                  const result = await statement.all<T>();
                  returned += result.results.length;
                  assert.ok(result.results.length <= 71);
                  for (const row of result.results)
                    assert.doesNotMatch(
                      JSON.stringify(row),
                      /PRIVATE-|@|gender_description|best_description/,
                    );
                  return result;
                },
              };
              return wrapped;
            },
            batch: db.batch.bind(db),
          };
          const stats = await readAdminStats(
            { db: measured, staff: () => service().staff() },
            "participants",
          );
          reconcile(stats);
          assert.equal(calls, 1);
          assert.ok(returned > 1 && returned <= 71);
          for (const who of ["admin", "owner"])
            reconcile(await readAdminStats(service(who), "participants"));
        },
      );
    } finally {
      if (pg) await pg.pool.end();
      else local!.close();
    }
  });
}
