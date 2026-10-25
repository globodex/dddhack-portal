import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { batch, one, rows, type Database, type SQL } from "../lib/db";
import { LocalDatabase } from "../lib/local-test/sqlite";
import { seedLocal } from "../scripts/fixtures";
import { draftPolicy } from "../lib/policy";
import { createPGliteFixture } from "./neon-db-fixture";

const at = "2026-10-22T08:00:00.000Z";
const later = "2026-10-22T09:00:00.000Z";
const token = (teamId: string, lockedAt = at) =>
  "admin-team-unlock:" + JSON.stringify([teamId, lockedAt]);
const plain = (data: unknown) => JSON.parse(JSON.stringify(data));
const sqliteSource = readFileSync(
  new URL("../db/migrations/0027_admin_team_unlock.sql", import.meta.url),
  "utf8",
);
const drizzleSource = readFileSync(
  new URL("../drizzle/0029_admin_team_unlock.sql", import.meta.url),
  "utf8",
);
const protectedTables = [
  "users",
  "profiles",
  "participant_profiles",
  "profile_details",
  "teams",
  "memberships",
  "ideas",
  "idea_revisions",
  "projects",
  "submission_versions",
  "submission_attempt_ledger",
  "credit_inventory",
  "credit_allocations",
  "credit_code_history",
  "audit_logs",
  "team_locks",
  "write_guards",
];
const state = async (db: Database) =>
  plain(
    await Promise.all(
      protectedTables.map((table) =>
        rows(db, `SELECT * FROM ${table} ORDER BY 1`),
      ),
    ),
  );

async function fixture(engine: "sqlite" | "drizzle" | "postgres") {
  const db =
    engine === "postgres"
      ? (await createPGliteFixture()).db
      : new LocalDatabase(":memory:");
  if (engine === "sqlite") (db as LocalDatabase).migrate();
  if (engine === "drizzle") {
    const directory = new URL("../drizzle/", import.meta.url);
    for (const file of readdirSync(directory)
      .filter((name) => name.endsWith(".sql"))
      .sort())
      for (const sql of readFileSync(new URL(file, directory), "utf8")
        .split("--> statement-breakpoint")
        .filter((part) => part.trim()))
        (db as LocalDatabase).raw.exec(sql);
  }
  await seedLocal(db);
  await batch(db, [
    [
      "UPDATE event_settings SET active=1,policy=? WHERE id=1",
      JSON.stringify({
        ...draftPolicy,
        ideaLock: "2026-11-01T04:30:00.000Z",
        membershipFreeze: "2026-11-01T04:30:00.000Z",
        submissionOpen: "2026-10-22T07:00:00.000Z",
        submissionClose: "2026-11-01T10:30:00.000Z",
      }),
    ],
    ["INSERT INTO check_ins VALUES('fake_alice','fake_admin',?)", at],
    ["INSERT INTO check_ins VALUES('fake_bob','fake_admin',?)", at],
    [
      "INSERT INTO projects(id,team_id,slug,draft,revision,updated_at) VALUES('synthetic-unlock-draft','fake_team3','synthetic-unlock-draft','{\"preserved\":true}',1,?)",
      at,
    ],
    [
      "INSERT INTO idea_revisions VALUES('synthetic-unlock-idea-history','fake_team3','{\"preserved\":true}',?)",
      at,
    ],
    ["INSERT INTO team_locks VALUES('fake_team1','fake_alice',?)", at],
    ["INSERT INTO team_locks VALUES('fake_team3','fake_bob',?)", at],
  ]);
  return db;
}
function unlock(guard: string, teamId = "fake_team3"): SQL[] {
  return [
    ["INSERT INTO write_guards VALUES(?,1)", guard],
    ["DELETE FROM team_locks WHERE team_id=?", teamId],
    ["DELETE FROM write_guards WHERE token=?", guard],
  ];
}
async function rejectsUnchanged(
  db: Database,
  statements: SQL[],
  error: RegExp,
) {
  const before = await state(db);
  await assert.rejects(batch(db, statements), error);
  assert.deepEqual(
    await state(db),
    before,
    "failed unlock rolls back the exact lock, guard and all protected data",
  );
}

test("unlock mirror is canonical SQL with individually executable statement breakpoints; previous migration bytes remain immutable", () => {
  const normalize = (s: string) =>
    s.replaceAll("--> statement-breakpoint", "").replace(/\s+/g, " ").trim();
  assert.equal(normalize(drizzleSource), normalize(sqliteSource));
  assert.equal(drizzleSource.split("--> statement-breakpoint").length, 2);
  const previous = [
    [
      "../neon/migrations/0105_terminal_record_deletion.sql",
      "088b96a239915cd518765b5ef260c73feee913d8e0b181234110f7591676ccde",
    ],
    [
      "../db/migrations/0026_terminal_record_deletion.sql",
      "96b05c0a7e6184291a17e2eea702f11e27535f359b3948ed6034167719ddc22e",
    ],
  ];
  for (const [path, checksum] of previous)
    assert.equal(
      createHash("sha256")
        .update(readFileSync(new URL(path, import.meta.url)))
        .digest("hex"),
      checksum,
    );
});

for (const engine of ["sqlite", "drizzle", "postgres"] as const)
  test(`${engine}: exact admin unlock restores pre-lock mutability; stale, committed, durable and frozen barriers preserve state and cascade authority`, async (t) => {
    const db = await fixture(engine);
    try {
      await t.test(
        "unguarded, stale, wrong-team and differently serialized tokens are denied",
        async () => {
          await rejectsUnchanged(
            db,
            [["DELETE FROM team_locks WHERE team_id='fake_team3'"]],
            /IMMUTABLE/,
          );
          await rejectsUnchanged(
            db,
            unlock(token("fake_team3", later)),
            /IMMUTABLE/,
          );
          await rejectsUnchanged(db, unlock(token("fake_team1")), /IMMUTABLE/);
          await rejectsUnchanged(
            db,
            unlock('admin-team-unlock:["fake_team3", "' + at + '"]'),
            /IMMUTABLE/,
          );
          // A valid=0 write guard cannot be stored, so no falsy guard can authorize deletion.
          await rejectsUnchanged(
            db,
            [["INSERT INTO write_guards VALUES(?,0)", token("fake_team3")]],
            /CHECK|check constraint/i,
          );
        },
      );
      await t.test(
        "a later transaction failure rolls back lock removal and its guard",
        async () => {
          await rejectsUnchanged(
            db,
            [
              ...unlock(token("fake_team3")),
              ["SELECT * FROM synthetic_missing_unlock_table"],
            ],
            /synthetic_missing_unlock_table/,
          );
        },
      );
      await t.test(
        "exact lock removal preserves every other row and permits idea edit/member leave and rejoin",
        async () => {
          await assert.rejects(
            batch(db, [
              ["UPDATE ideas SET title='Blocked' WHERE team_id='fake_team3'"],
            ]),
            /TEAM_LOCKED/,
          );
          await assert.rejects(
            batch(db, [["DELETE FROM memberships WHERE user_id='fake_carol'"]]),
            /TEAM_LOCKED/,
          );
          const before = await state(db);
          await batch(db, unlock(token("fake_team3")));
          const after = await state(db);
          for (let i = 0; i < protectedTables.length; i++)
            if (protectedTables[i] !== "team_locks")
              assert.deepEqual(after[i], before[i], protectedTables[i]);
          assert.deepEqual(
            plain(
              await rows(db, "SELECT team_id FROM team_locks ORDER BY team_id"),
            ),
            [{ team_id: "fake_team1" }],
          );
          await batch(db, [
            [
              "UPDATE ideas SET title='Synthetic edited unlocked idea',description='Synthetic new description' WHERE team_id='fake_team3'",
            ],
            ["DELETE FROM memberships WHERE user_id='fake_carol'"],
            [
              "INSERT INTO memberships VALUES('fake_carol','fake_team3',?)",
              later,
            ],
          ]);
          assert.equal(
            (await one<{ title: string }>(
              db,
              "SELECT title FROM ideas WHERE team_id='fake_team3'",
            ))!.title,
            "Synthetic edited unlocked idea",
          );
          assert.equal(
            (
              await rows(
                db,
                "SELECT * FROM memberships WHERE team_id='fake_team3'",
              )
            ).length,
            3,
          );
        },
      );
      await t.test(
        "relocking invalidates the old timestamp token and never enables lock UPDATE",
        async () => {
          await batch(db, [
            ["INSERT INTO team_locks VALUES('fake_team3','fake_bob',?)", later],
          ]);
          await rejectsUnchanged(db, unlock(token("fake_team3")), /IMMUTABLE/);
          await rejectsUnchanged(
            db,
            [
              [
                "UPDATE team_locks SET locked_at=? WHERE team_id='fake_team3'",
                at,
              ],
            ],
            /IMMUTABLE/,
          );
        },
      );
      await t.test(
        "committed version blocks unlock; retired payload still leaves a durable attempt barrier; terminal cascade remains allowed",
        async () => {
          await batch(db, [
            [
              "INSERT INTO submission_versions VALUES('synthetic-unlock-committed','fake_team1',1,'{}',?)",
              later,
            ],
          ]);
          await rejectsUnchanged(
            db,
            unlock(token("fake_team1"), "fake_team1"),
            /TEAM_HAS_COMMITTED_SUBMISSIONS/,
          );
          await batch(db, [
            [
              "INSERT INTO write_guards VALUES(?,1)",
              'cascade-team:["fake_team1"]',
            ],
            ["DELETE FROM submission_versions WHERE team_id='fake_team1'"],
            [
              "DELETE FROM write_guards WHERE token=?",
              'cascade-team:["fake_team1"]',
            ],
          ]);
          assert.equal(
            (await one<{ attempts: number }>(
              db,
              "SELECT attempts FROM submission_attempt_ledger WHERE team_id='fake_team1'",
            ))!.attempts,
            1,
          );
          await rejectsUnchanged(
            db,
            unlock(token("fake_team1"), "fake_team1"),
            /TEAM_HAS_COMMITTED_SUBMISSIONS/,
          );
          await batch(db, unlock('cascade-team:["fake_team1"]', "fake_team1"));
          assert.equal(
            (
              await rows(
                db,
                "SELECT * FROM team_locks WHERE team_id='fake_team1'",
              )
            ).length,
            0,
          );
          assert.equal(
            (await one<{ attempts: number }>(
              db,
              "SELECT attempts FROM submission_attempt_ledger WHERE team_id='fake_team1'",
            ))!.attempts,
            1,
          );
        },
      );
      await t.test(
        "a frozen snapshot blocks both admin unlock and terminal-cascade lock removal",
        async () => {
          await batch(db, [
            [
              "INSERT INTO result_snapshots SELECT 'synthetic-unlock-frozen',e.version,r.version,'{}',?,'fake_owner' FROM event_settings e CROSS JOIN scoring_revision r WHERE e.id=1 AND r.id=1",
              later,
            ],
          ]);
          await rejectsUnchanged(
            db,
            unlock(token("fake_team3", later)),
            /RESULTS_FROZEN/,
          );
          await rejectsUnchanged(
            db,
            unlock('cascade-team:["fake_team3"]'),
            /RESULTS_FROZEN/,
          );
        },
      );
    } finally {
      await db.close();
    }
  });
