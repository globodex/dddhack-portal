import assert from "node:assert/strict";
import { test } from "node:test";
import { createPGliteFixture } from "./neon-db-fixture";
import { applyPortalMigrations } from "../neon/db/migrate";
import { seedLocal, fixtures, LOCAL_CREDIT_KEY } from "../scripts/fixtures";
import { one, rows, batch, assertPreviousWrite } from "../lib/db";
import { PortalService } from "../lib/service";
import { draftPolicy } from "../lib/policy";
import { submission } from "./helpers";
import { getTableConfig } from "drizzle-orm/pg-core";
import * as schema from "../neon/db/schema";
import manifest from "../neon/migrations/baseline-manifest.json";

const time = "2026-11-01T06:00:00.000Z";
const stockTriggerNames = [
  "credit_stock_not_retired",
  "credit_stock_record",
  "credit_stock_immutable",
  "credit_history_no_delete",
  "credit_history_immutable",
  "credit_assignment_not_recycled",
  "credit_assignment_record",
  "credit_assignment_immutable",
  "credit_import_no_update",
  "credit_import_no_delete",
];
const terminalTriggerNames = [
  "terminal_delete_no_update",
  "terminal_delete_no_delete",
  "terminal_delete_authority",
  "terminal_no_restore",
  "terminal_team_no_reuse",
  "terminal_participant_no_profile",
  "attempt_ledger_no_decrease",
  "attempt_ledger_no_delete",
  "durable_submission_attempt",
  "durable_submission_record",
  "terminal_credit_retire",
  "terminal_private_metadata",
];

test("PostgreSQL baseline installs every portal table/trigger and checksum migrations are repeatable", async () => {
  const { db, engine, pool, migrations } = await createPGliteFixture();
  try {
    const tables = await engine.query<{ count: number }>(
      "SELECT count(*)::int count FROM pg_tables WHERE schemaname='public' AND tablename <> 'portal_schema_migrations'",
    );
    const logicalTables = Object.values(schema).map(getTableConfig);
    const expectedTriggerNames = [
      ...manifest.triggers,
      ...stockTriggerNames,
      ...terminalTriggerNames,
    ].sort();
    assert.equal(tables.rows[0].count, logicalTables.length);
    const triggers = await engine.query<{ count: number }>(
      "SELECT count(*)::int count FROM pg_trigger WHERE NOT tgisinternal",
    );
    assert.equal(
      triggers.rows[0].count,
      expectedTriggerNames.length + logicalTables.length,
    );
    const triggerNames = await engine.query<{ tgname: string }>(
      "SELECT tgname FROM pg_trigger WHERE NOT tgisinternal AND tgname <> 'portal_serializable' ORDER BY tgname",
    );
    assert.deepEqual(
      triggerNames.rows.map((row) => row.tgname),
      expectedTriggerNames,
    );
    const serializable = await engine.query<{
      table_name: string;
      trigger_count: number;
    }>(
      "SELECT c.relname table_name,count(*)::int trigger_count FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE NOT t.tgisinternal AND t.tgname='portal_serializable' AND n.nspname='public' GROUP BY c.relname ORDER BY c.relname",
    );
    assert.deepEqual(
      serializable.rows,
      logicalTables
        .map((table) => ({ table_name: table.name, trigger_count: 1 }))
        .sort((a, b) => a.table_name.localeCompare(b.table_name)),
      "every logical table has exactly one SERIALIZABLE mutation guard",
    );
    const columns = await engine.query<{
      table_name: string;
      column_name: string;
    }>(
      "SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' ORDER BY column_name",
    );
    const foreignKeys = await engine.query<{ table_name: string; n: number }>(
      "SELECT table_name,count(*)::int n FROM information_schema.table_constraints WHERE table_schema='public' AND constraint_type='FOREIGN KEY' GROUP BY table_name",
    );
    const checks = await engine.query<{ table_name: string; n: number }>(
      "SELECT rel.relname table_name,count(*)::int n FROM pg_constraint c JOIN pg_class rel ON rel.oid=c.conrelid JOIN pg_namespace ns ON ns.oid=rel.relnamespace WHERE ns.nspname='public' AND c.contype='c' GROUP BY rel.relname",
    );
    for (const table of Object.values(schema)) {
      const config = getTableConfig(table);
      assert.deepEqual(
        columns.rows
          .filter((row) => row.table_name === config.name)
          .map((row) => row.column_name)
          .sort(),
        config.columns.map((column) => column.name).sort(),
        config.name + ": Drizzle columns match installed migration",
      );
      assert.equal(
        foreignKeys.rows.find((row) => row.table_name === config.name)?.n ?? 0,
        config.foreignKeys.length,
        config.name + ": Drizzle FKs match installed migration",
      );
      assert.equal(
        checks.rows.find((row) => row.table_name === config.name)?.n ?? 0,
        config.checks.length,
        config.name + ": Drizzle CHECK constraints match installed migration",
      );
    }
    assert.deepEqual(await applyPortalMigrations(pool, migrations), []);
    await assert.rejects(
      applyPortalMigrations(pool, [{ ...migrations[0], checksum: "tampered" }]),
      /INVALID_CHECKSUM/,
    );
    await assert.rejects(
      engine.query(
        "INSERT INTO users(id,email,name,created_at) VALUES('unsafe','unsafe@portal.test','Unsafe', '2026-10-01T00:00:00Z')",
      ),
      /SERIALIZABLE_TRANSACTION_REQUIRED/,
    );
  } finally {
    await db.close();
  }
});

test("PostgreSQL executes the synthetic portal seed, case-insensitive identity, directory aliases and atomic revision guards", async () => {
  const { db } = await createPGliteFixture();
  try {
    await seedLocal(db);
    assert.equal(
      (await one(db, "SELECT id FROM users WHERE email=?", "ALICE@PORTAL.TEST"))
        ?.id,
      "fake_alice",
    );
    await assert.rejects(
      db
        .prepare("INSERT INTO users(id,email,name,created_at) VALUES(?,?,?,?)")
        .bind("duplicate", "ALICE@PORTAL.TEST", "Duplicate", time)
        .all(),
      /duplicate key/,
    );
    await assert.rejects(
      batch(db, [
        [
          "UPDATE event_settings SET version=version+1 WHERE id=1 AND version=999",
        ],
        ...assertPreviousWrite(),
        ["UPDATE users SET name='Must roll back' WHERE id='fake_alice'"],
      ]),
      /check constraint/,
    );
    assert.equal(
      (await one(db, "SELECT name FROM users WHERE id='fake_alice'"))?.name,
      "Alice",
    );
    assert.equal((await one(db, "SELECT count(*) n FROM write_guards"))?.n, 0);
    const output = await batch(db, [
      ["UPDATE event_settings SET version=version+1 WHERE id=1 AND version=1"],
      ...assertPreviousWrite(),
    ]);
    assert.equal(
      output[0].meta!.changes,
      1,
      "rowCount excludes scoring_revision trigger writes",
    );
    const service = new PortalService(
      db,
      fixtures.alice,
      LOCAL_CREDIT_KEY,
      () => time,
    );
    const directory = await service.view("/discover/participants", {
      limit: 2,
    });
    assert.ok(directory);
    const aliases = await rows(
      db,
      "SELECT u.name displayName,COALESCE(pp.display_name,u.name) COLLATE NOCASE sortName FROM users u LEFT JOIN participant_profiles pp ON pp.user_id=u.id ORDER BY COALESCE(pp.display_name,u.name) COLLATE NOCASE,u.id LIMIT ?",
      2,
    );
    assert.equal(typeof aliases[0].displayName, "string");
    assert.ok("sortName" in aliases[0]);
  } finally {
    await db.close();
  }
});

test("PostgreSQL rejects bad submission windows, requires personal leader check-in, caps three immutable attempts and preserves frozen snapshots", async () => {
  const { db } = await createPGliteFixture();
  try {
    await seedLocal(db);
    await db
      .prepare("UPDATE event_settings SET policy=?,active=0 WHERE id=1")
      .bind(
        JSON.stringify({
          ...draftPolicy,
          confirmations: [],
          operationScopes: [],
        }),
      )
      .all();
    const insert = (
      id: string,
      attempt: number,
      at = time,
      team = "fake_team1",
    ) =>
      db
        .prepare(
          "INSERT INTO submission_versions(id,team_id,attempt,payload,created_at) VALUES(?,?,?,?,?)",
        )
        .bind(id, team, attempt, JSON.stringify(submission), at)
        .all();
    await assert.rejects(insert("no_checkin", 1), /CHECKIN_REQUIRED/);
    await db
      .prepare("INSERT INTO check_ins VALUES(?,?,?)")
      .bind("fake_alice", "fake_admin", time)
      .all();
    for (const at of [
      "invalid-time",
      "2026-11-01T02:29:59.999Z",
      "2026-11-01T10:30:00.000Z",
      "2026-02-30T06:00:00.000Z",
    ])
      await assert.rejects(insert("bad_" + at, 1, at), /SUBMISSIONS_CLOSED/);
    for (const attempt of [1, 2, 3])
      await insert("version_" + attempt, attempt);
    await assert.rejects(insert("version_4", 4), /check constraint/);
    await assert.rejects(
      db
        .prepare(
          "UPDATE submission_versions SET payload='{}' WHERE id='version_1'",
        )
        .all(),
      /IMMUTABLE/,
    );
    await assert.rejects(
      db.prepare("DELETE FROM submission_versions WHERE id='version_1'").all(),
      /IMMUTABLE/,
    );
    const revision = (await one<{ version: number }>(
      db,
      "SELECT version FROM scoring_revision WHERE id=1",
    ))!;
    await assert.rejects(
      db
        .prepare("INSERT INTO result_snapshots VALUES(?,?,?,?,?,?)")
        .bind("stale", 1, revision.version - 1, "[]", time, "fake_owner")
        .all(),
      /SCORING_CHANGED_RETRY/,
    );
    await db
      .prepare("INSERT INTO result_snapshots VALUES(?,?,?,?,?,?)")
      .bind("snapshot", 1, revision.version, "[]", time, "fake_owner")
      .all();
    await assert.rejects(
      insert("after_freeze", 1, time, "fake_team3"),
      /RESULTS_FROZEN/,
    );
    await assert.rejects(
      db
        .prepare("UPDATE result_snapshots SET payload='{}' WHERE id='snapshot'")
        .all(),
      /IMMUTABLE/,
    );
    assert.equal(
      (await one(db, "SELECT count(*) n FROM submission_versions"))?.n,
      3,
    );
  } finally {
    await db.close();
  }
});
