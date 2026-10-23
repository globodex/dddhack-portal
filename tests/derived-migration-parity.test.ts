import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { Miniflare } from "miniflare";
import { seedLocal } from "../scripts/fixtures";
import { one, rows, type Database } from "../lib/db";
import { submission } from "./helpers";
import { draftPolicy } from "../lib/policy";

async function migrate(db: Database, path: string, excluded: string) {
  const directory = new URL(path, import.meta.url);
  const sql = readdirSync(directory)
    .filter((name) => name.endsWith(".sql") && name !== excluded)
    .sort()
    .map((name) => readFileSync(new URL(name, directory), "utf8"))
    .join("\n");
  await applyMigration(db, sql);
}
async function applyMigration(db: Database, source: string) {
  const sql = source
    .replaceAll("--> statement-breakpoint", "\n")
    .replace(/^\s*--.*$/gm, "");
  let buffer = "";
  for (const line of sql.split("\n")) {
    buffer += line + "\n";
    if (
      line.trim().endsWith(";") &&
      (!buffer.trim().startsWith("CREATE TRIGGER") ||
        line.trim() === "END;" ||
        line.trim().startsWith("CREATE TRIGGER"))
    ) {
      await db.prepare(buffer).all();
      buffer = "";
    }
  }
  assert.equal(buffer.trim(), "");
}

test(
  "local and hosted derived-readiness migrations preserve real D1 submission and frozen guards",
  { timeout: 60000 },
  async () => {
    const mf = new Miniflare({
      modules: true,
      script:
        'export default {fetch(){return new Response("synthetic migration parity")}}',
      compatibilityDate: "2026-07-01",
      cf: false,
      d1Databases: { LOCAL: "derived-local", HOSTED: "derived-hosted" },
    });
    try {
      for (const [binding, directory] of [
        ["LOCAL", "../db/migrations/"],
        ["HOSTED", "../drizzle/"],
      ] as const) {
        const db: Database = await mf.getD1Database(binding);
        const derived =
          binding === "LOCAL"
            ? "0022_derived_operational_gates.sql"
            : "0025_derived_operational_gates.sql";
        await migrate(db, directory, derived);
        await seedLocal(db);
        const policy = {
          ...draftPolicy,
          confirmations: [],
          operationScopes: [],
          lumaRequired: true,
        };
        await db
          .prepare("UPDATE event_settings SET active=0,policy=? WHERE id=1")
          .bind(JSON.stringify(policy))
          .all();
        const before = await one(db, "SELECT * FROM event_settings");
        const existingUsers = await rows(
          db,
          "SELECT id,email,name FROM users ORDER BY id",
        );
        const existingInventory = await rows(
          db,
          "SELECT id,type_id,fingerprint FROM credit_inventory ORDER BY id",
        );
        await applyMigration(
          db,
          readFileSync(new URL(directory + derived, import.meta.url), "utf8"),
        );
        assert.deepEqual(
          await one(db, "SELECT * FROM event_settings"),
          before,
          binding + ": upgrade preserves inactive saved policy",
        );
        assert.deepEqual(
          await rows(db, "SELECT id,email,name FROM users ORDER BY id"),
          existingUsers,
          binding + ": upgrade preserves existing users",
        );
        assert.deepEqual(
          await rows(
            db,
            "SELECT id,type_id,fingerprint FROM credit_inventory ORDER BY id",
          ),
          existingInventory,
          binding + ": upgrade preserves existing inventory",
        );
        assert.equal(
          (
            await rows(
              db,
              "SELECT name FROM sqlite_master WHERE type='trigger' AND name IN ('submissions_operational_scope','checkin_operational_scope')",
            )
          ).length,
          0,
          binding,
        );
        await assert.rejects(
          db
            .prepare(
              "INSERT INTO check_ins VALUES('fake_pending','fake_admin','2026-11-01T04:00:00.000Z')",
            )
            .all(),
          /PORTAL_GOING_REQUIRED/,
          binding,
        );
        await db
          .prepare(
            "INSERT INTO check_ins VALUES('fake_alice','fake_admin','2026-11-01T04:00:00.000Z')",
          )
          .all();
        await db
          .prepare(
            "INSERT INTO check_ins VALUES('fake_bob','fake_admin','2026-11-01T04:00:00.000Z')",
          )
          .all();
        const insert = async (
          id: string,
          attempt: number,
          time: string,
          team = "fake_team1",
        ) =>
          db
            .prepare(
              "INSERT INTO submission_versions(id,team_id,attempt,payload,created_at) VALUES(?,?,?,?,?)",
            )
            .bind(id, team, attempt, JSON.stringify(submission), time)
            .all();
        await assert.rejects(
          insert("fake_before", 1, "2026-11-01T02:29:59.999Z"),
          /SUBMISSIONS_CLOSED/,
          binding,
        );
        await assert.rejects(
          insert("fake_close", 1, "2026-11-01T10:30:00.000Z"),
          /SUBMISSIONS_CLOSED/,
          binding,
        );
        await assert.rejects(
          insert("fake_invalid", 1, "invalid-time"),
          /SUBMISSIONS_CLOSED/,
          binding,
        );
        for (const attempt of [1, 2, 3])
          await insert(
            `fake_version_${attempt}`,
            attempt,
            "2026-11-01T04:00:00.000Z",
          );
        assert.equal(
          (await rows(db, "SELECT * FROM submission_versions")).length,
          3,
          binding,
        );
        await assert.rejects(
          insert("fake_fourth", 4, "2026-11-01T04:00:00.000Z"),
          /CHECK|PROJECT_LOCKED|THIRD/,
          binding,
        );
        await assert.rejects(
          db
            .prepare(
              "UPDATE submission_versions SET payload='{}' WHERE id='fake_version_1'",
            )
            .all(),
          /IMMUTABLE/,
          binding,
        );
        assert.deepEqual(
          await one(db, "SELECT * FROM event_settings"),
          before,
          binding + ": no flag rewrite or initialization",
        );
        const revision = await one<{ version: number }>(
          db,
          "SELECT version FROM scoring_revision WHERE id=1",
        );
        await db
          .prepare(
            "INSERT INTO result_snapshots VALUES('fake_parity_snapshot',1,?,'[]','2026-11-01T13:00:00.000Z','fake_owner')",
          )
          .bind(revision!.version)
          .all();
        await assert.rejects(
          insert(
            "fake_after_freeze",
            1,
            "2026-11-01T04:00:00.000Z",
            "fake_team3",
          ),
          /RESULTS_FROZEN/,
          binding,
        );
        await assert.rejects(
          db
            .prepare(
              "UPDATE result_snapshots SET payload='[1]' WHERE id='fake_parity_snapshot'",
            )
            .all(),
          /IMMUTABLE/,
          binding,
        );
        assert.equal(
          (
            await rows(
              db,
              "SELECT * FROM submission_versions WHERE team_id='fake_team3'",
            )
          ).length,
          0,
          binding,
        );
      }
    } finally {
      await mf.dispose();
    }
  },
);
