import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { LocalDatabase } from "../lib/local-test/sqlite";
import { seedLocal, fixtures, LOCAL_CREDIT_KEY } from "../scripts/fixtures";
import { seedRichVisual } from "../scripts/visual-rich-fixtures";
import { PortalService } from "../lib/service";

const directory = new URL("../drizzle/", import.meta.url);
const mirror = readFileSync(
  new URL("0028_terminal_record_deletion.sql", directory),
  "utf8",
);
const source = readFileSync(
  new URL(
    "../db/migrations/0026_terminal_record_deletion.sql",
    import.meta.url,
  ),
  "utf8",
);
const execute = (db: LocalDatabase, sql: string) =>
  db.raw.exec(sql.replaceAll("--> statement-breakpoint", ""));
function legacy(db: LocalDatabase, includeMirror = true) {
  for (const file of readdirSync(directory)
    .filter((name) => name.endsWith(".sql") && (includeMirror || name < "0028"))
    .sort())
    execute(db, readFileSync(new URL(file, directory), "utf8"));
}
const plain = (value: unknown) => JSON.parse(JSON.stringify(value));

test("Drizzle journal registers every SQL file and new mirror has one executable statement per breakpoint", () => {
  const journal = JSON.parse(
    readFileSync(new URL("meta/_journal.json", directory), "utf8"),
  );
  const files = readdirSync(directory)
    .filter((name) => name.endsWith(".sql"))
    .sort();
  assert.deepEqual(
    journal.entries.map((entry: any) => entry.tag + ".sql"),
    files,
  );
  assert.deepEqual(
    journal.entries.map((entry: any) => entry.idx),
    files.map((_, index) => index),
  );
  assert(journal.entries.every((entry: any) => entry.breakpoints === true));
  assert.equal(journal.entries[28].tag, "0028_terminal_record_deletion");
  assert.equal(journal.entries[29].tag, "0029_admin_team_unlock");
  assert.equal(journal.entries[30].tag, "0030_admin_team_lock");
  assert.equal(journal.entries[31].tag, "0031_admin_testing_and_team_corrections");
  assert.equal(journal.entries[32].tag, "0032_owner_ai_model_usage");
  assert.equal(journal.entries[33].tag, "0033_admin_submission_access");
  assert.equal(journal.entries[34].tag, "0034_admin_missing_team_idea");
  assert.equal(journal.entries[35].tag, "0035_continuous_engagement");
  assert.equal(journal.entries.at(-1).tag, "0037_post_submission_feedback");
  const parts = mirror
    .split("--> statement-breakpoint")
    .filter((part) => part.trim());
  assert.equal(parts.length, 50);
  // Normalize separators only: do not maintain an independently edited guard copy.
  assert.equal(
    mirror
      .replaceAll("--> statement-breakpoint", "")
      .replace(/\s+/g, " ")
      .trim(),
    source.replace(/\s+/g, " ").trim(),
  );
});

test("Drizzle mirror creates the exact canonical terminal tables and scoped immutable guards", () => {
  const canonical = new LocalDatabase(":memory:"),
    hosted = new LocalDatabase(":memory:");
  try {
    canonical.migrate();
    legacy(hosted);
    const names = [...mirror.matchAll(/^CREATE (?:TABLE|TRIGGER) (\w+)/gm)].map(
      (match) => match[1],
    );
    assert.equal(names.length, 31);
    const schema = (db: LocalDatabase) =>
      names.sort().map((name) => {
        const row = db.raw
          .prepare("SELECT type,name,sql FROM sqlite_master WHERE name=?")
          .get(name) as { type: string; name: string; sql: string };
        assert(row, name);
        return { ...row, sql: row.sql.replace(/\s+/g, " ").trim() };
      });
    assert.deepEqual(schema(hosted), schema(canonical));
  } finally {
    canonical.close();
    hosted.close();
  }
});

test("Populated legacy upgrade preserves data and gives the real actor/admin commands terminal cascade and attempt guards", async () => {
  const db = new LocalDatabase(":memory:");
  try {
    legacy(db, false);
    await seedLocal(db);
    await seedRichVisual(db);
    const tables = [
      "users",
      "teams",
      "memberships",
      "projects",
      "submission_versions",
      "credit_inventory",
      "credit_allocations",
      "credit_code_history",
      "audit_logs",
    ];
    const snapshot = () =>
      plain(
        tables.map((table) =>
          db.raw.prepare(`SELECT * FROM ${table} ORDER BY 1`).all(),
        ),
      );
    const before = snapshot();
    execute(db, mirror);
    assert.deepEqual(snapshot(), before);
    assert.deepEqual(
      plain(
        db.raw
          .prepare("SELECT * FROM submission_attempt_ledger ORDER BY team_id")
          .all(),
      ),
      [
        { team_id: "fake_team1", attempts: 2 },
        { team_id: "fake_team5", attempts: 3 },
      ],
    );
    const admin = new PortalService(db, fixtures.admin, LOCAL_CREDIT_KEY);
    assert.equal((await admin.actor()).role, "admin");
    const deleted = await admin.command("admin-delete-team", {
      teamId: "fake_team5",
      confirmation: "DELETE_TEAM",
    });
    assert.equal(deleted.changed, true);
    assert.equal(
      db.raw.prepare("SELECT * FROM projects WHERE team_id='fake_team5'").get(),
      undefined,
    );
    assert.equal(
      db.raw
        .prepare("SELECT * FROM submission_versions WHERE team_id='fake_team5'")
        .get(),
      undefined,
    );
    assert.equal(
      (
        db.raw
          .prepare(
            "SELECT attempts FROM submission_attempt_ledger WHERE team_id='fake_team5'",
          )
          .get() as any
      ).attempts,
      3,
    );
    assert(
      db.raw
        .prepare("SELECT id FROM projects WHERE team_id='fake_team1'")
        .get(),
    );
    await admin.command("admin-delete-participant", {
      userId: "fake_carol",
      expectedLeaderTeamIds: [],
      confirmation: "DELETE_PARTICIPANT",
    });
    await assert.rejects(
      new PortalService(db, fixtures.carol, LOCAL_CREDIT_KEY).actor(),
      { code: "PARTICIPANT_REMOVED" },
    );
    assert.equal(
      db.raw.prepare("SELECT * FROM profiles WHERE user_id='fake_carol'").get(),
      undefined,
    );
    assert.throws(
      () =>
        db.raw.exec(
          "DELETE FROM submission_attempt_ledger WHERE team_id='fake_team5'",
        ),
      /SUBMISSION_ATTEMPTS_IMMUTABLE/,
    );
    assert.throws(() => db.raw.exec("DELETE FROM audit_logs"), /IMMUTABLE/);
    assert.equal(db.raw.prepare("PRAGMA foreign_key_check").all().length, 0);
  } finally {
    db.close();
  }
});
