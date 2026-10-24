import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { LocalDatabase } from "../lib/local-test/sqlite";
import { createPGliteFixture } from "./neon-db-fixture";
import { loadMigrationPlan } from "../neon/migration-plan";
import { applyPortalMigrations } from "../neon/db/migrate";
import { seedLocal, fixtures, LOCAL_CREDIT_KEY } from "../scripts/fixtures";
import { seedRichVisual } from "../scripts/visual-rich-fixtures";
import { PortalService } from "../lib/service";
import { batch, rows, one, type Database } from "../lib/db";
const plain = (v: unknown) => JSON.parse(JSON.stringify(v));
const digest = (s: string) => createHash("sha256").update(s).digest("hex");

test("SQLite populated0025 upgrade: transactional failure restores guards/data;0026 preserves every old row, seeds exact attempt maxima and remains immutable", async () => {
  const db = new LocalDatabase(":memory:");
  try {
    for (const name of readdirSync(
      new URL("../db/migrations/", import.meta.url),
    )
      .filter((n) => n.endsWith(".sql") && n < "0026")
      .sort())
      db.raw.exec(
        readFileSync(
          new URL("../db/migrations/" + name, import.meta.url),
          "utf8",
        ),
      );
    await seedLocal(db);
    await seedRichVisual(db);
    const names = db.raw
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
      )
      .all()
      .map((r) => String(r.name));
    const snapshot = () =>
      Promise.all(names.map((t) => rows(db, `SELECT * FROM ${t} ORDER BY 1`)));
    const before = plain(await snapshot());
    const sql = readFileSync(
      new URL(
        "../db/migrations/0026_terminal_record_deletion.sql",
        import.meta.url,
      ),
      "utf8",
    );
    db.raw.exec("BEGIN IMMEDIATE");
    assert.throws(() =>
      db.raw.exec(sql + "; SELECT * FROM synthetic_missing_upgrade_table;"),
    );
    db.raw.exec("ROLLBACK");
    assert.equal(
      db.raw
        .prepare(
          "SELECT name FROM sqlite_master WHERE name='terminal_record_deletions'",
        )
        .get(),
      undefined,
    );
    assert.deepEqual(plain(await snapshot()), before);
    await assert.rejects(
      batch(db, [
        ["DELETE FROM submission_versions WHERE team_id='fake_team5'"],
      ]),
      /IMMUTABLE/,
    );
    db.raw.exec("BEGIN IMMEDIATE");
    db.raw.exec(sql);
    db.raw.exec("COMMIT");
    assert.deepEqual(plain(await snapshot()), before);
    assert.deepEqual(
      plain(
        await rows(
          db,
          "SELECT * FROM submission_attempt_ledger ORDER BY team_id",
        ),
      ),
      [
        { team_id: "fake_team1", attempts: 2 },
        { team_id: "fake_team5", attempts: 3 },
      ],
    );
    await new PortalService(db, fixtures.admin, LOCAL_CREDIT_KEY).command(
      "admin-delete-team",
      { teamId: "fake_team5", confirmation: "DELETE_TEAM" },
    );
    assert.equal(
      (await one(
        db,
        "SELECT attempts FROM submission_attempt_ledger WHERE team_id='fake_team5'",
      ))!.attempts,
      3,
    );
  } finally {
    db.close();
  }
});

test("PostgreSQL full populated0104 ledger upgrade preserves auth/audit/all old rows, then removes target source/media while retaining the deleted former leader's surviving-team draft assets", async () => {
  const full = await loadMigrationPlan();
  const migration = full.find(
    (m) => m.name === "0105_terminal_record_deletion.sql",
  )!;
  assert(migration);
  const pg = await createPGliteFixture({
    excludeMigrations: full.map((m) => m.name),
  });
  try {
    const prior = full.filter((m) => m.name < "0105");
    await applyPortalMigrations(pg.pool, prior);
    await seedLocal(pg.db);
    await seedRichVisual(pg.db);
    const now = new Date().toISOString();
    await batch(pg.db, [
      [
        "INSERT INTO approved_evaluation_snapshots VALUES('visual_eve_v3',?,'{}',?,'fake_admin',?,NULL)",
        "a".repeat(40),
        "b".repeat(64),
        now,
      ],
      [
        "INSERT INTO approved_evaluation_snapshots VALUES('visual_alice_v2',?,'{}',?,'fake_admin',?,NULL)",
        "a".repeat(40),
        "c".repeat(64),
        now,
      ],
      [
        "INSERT INTO portal_media_uploads(id,actor_id,team_id,revision,kind,bucket,staging_key,content_type,byte_length,expires_at,state,object_key,image_content_type,image_byte_length,width,height,sha256,finalized_at,consumed_at,version_id) VALUES('synthetic-target-upload','fake_eve','fake_team5',3,'logo','synthetic-cascade-bucket','synthetic-target-staging','image/png',100,?,'consumed','synthetic-target-object','image/png',100,64,64,?,?,?,'visual_eve_v3')",
        now,
        "d".repeat(64),
        now,
        now,
      ],
      [
        "INSERT INTO portal_media_uploads(id,actor_id,team_id,revision,kind,bucket,staging_key,content_type,byte_length,expires_at,state) VALUES('synthetic-unrelated-upload','fake_eve','fake_team1',2,'logo','synthetic-cascade-bucket','synthetic-unrelated-staging','image/png',100,?,'pending')",
        now,
      ],
      [
        "INSERT INTO auth_users VALUES('fake_eve','eve@portal.test','Synthetic auth identity',?)",
        now,
      ],
      [
        "INSERT INTO auth_sessions VALUES('synthetic-cascade-session','fake_eve',9999999999999)",
      ],
      [
        "INSERT INTO audit_logs VALUES('synthetic-old-user-audit','fake_eve','synthetic-person-action','opaque-entity','{}','Synthetic old audit',?)",
        now,
      ],
    ]);
    const tableNames = (
      await pg.engine.query<{ tablename: string }>(
        "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename<>'portal_schema_migrations' ORDER BY tablename",
      )
    ).rows.map((r) => r.tablename);
    const snapshot = () =>
      Promise.all(
        tableNames.map((t) => rows(pg.db, `SELECT * FROM ${t} ORDER BY 1`)),
      );
    const before = plain(await snapshot());
    const ledger = plain(
      await rows(pg.db, "SELECT * FROM portal_schema_migrations ORDER BY name"),
    );
    const broken =
      migration.sql + "; SELECT * FROM synthetic_missing_upgrade_table;";
    await assert.rejects(
      applyPortalMigrations(pg.pool, [
        { ...migration, sql: broken, checksum: digest(broken) },
      ]),
    );
    assert.deepEqual(plain(await snapshot()), before);
    assert.deepEqual(
      plain(
        await rows(
          pg.db,
          "SELECT * FROM portal_schema_migrations ORDER BY name",
        ),
      ),
      ledger,
    );
    assert.equal(
      (
        await pg.engine.query<{ table_name: string | null }>(
          "SELECT to_regclass('terminal_record_deletions') AS table_name",
        )
      ).rows[0].table_name,
      null,
    );
    assert.deepEqual(await applyPortalMigrations(pg.pool, [migration]), [
      migration.name,
    ]);
    assert.deepEqual(await applyPortalMigrations(pg.pool, [migration]), []);
    assert.deepEqual(plain(await snapshot()), before);
    assert.deepEqual(
      plain(
        (
          await rows(
            pg.db,
            "SELECT * FROM portal_schema_migrations ORDER BY name",
          )
        ).filter((r: any) => r.name !== migration.name),
      ),
      ledger,
    );
    const stable = plain(
      await rows(
        pg.db,
        "SELECT * FROM approved_evaluation_snapshots WHERE version_id='visual_alice_v2'",
      ),
    );
    const oldAudit = plain(
      await rows(
        pg.db,
        "SELECT * FROM audit_logs WHERE id='synthetic-old-user-audit'",
      ),
    );
    await new PortalService(pg.db, fixtures.admin, LOCAL_CREDIT_KEY).command(
      "admin-delete-participant",
      { userId: "fake_eve", confirmation: "DELETE_PARTICIPANT" },
    );
    assert.equal(
      (
        await rows(
          pg.db,
          "SELECT * FROM approved_evaluation_snapshots WHERE version_id='visual_eve_v3'",
        )
      ).length,
      0,
    );
    assert.equal(
      (
        await rows(
          pg.db,
          "SELECT * FROM portal_media_uploads WHERE team_id='fake_team5'",
        )
      ).length,
      0,
    );
    assert.deepEqual(
      plain(
        await rows(
          pg.db,
          "SELECT * FROM approved_evaluation_snapshots WHERE version_id='visual_alice_v2'",
        ),
      ),
      stable,
    );
    assert(
      await one(
        pg.db,
        "SELECT id FROM portal_media_uploads WHERE id='synthetic-unrelated-upload'",
      ),
    );
    assert.deepEqual(
      plain(
        await rows(
          pg.db,
          "SELECT * FROM audit_logs WHERE id='synthetic-old-user-audit'",
        ),
      ),
      oldAudit,
    );
    assert(
      await one(
        pg.db,
        "SELECT token_hash FROM auth_sessions WHERE token_hash='synthetic-cascade-session'",
      ),
    );
    assert.equal(
      (await one(
        pg.db,
        "SELECT attempts FROM submission_attempt_ledger WHERE team_id='fake_team5'",
      ))!.attempts,
      3,
    );
  } finally {
    await pg.db.close();
  }
});
