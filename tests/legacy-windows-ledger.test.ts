import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  applyPortalMigrations,
  loadPortalMigrations,
  type PortalMigration,
} from "../neon/db/migrate";
import { loadMigrationPlan } from "../neon/migration-plan";
import {
  applyPopulatedUpgrade,
  inspectPopulatedUpgrade,
  verifyUpgradePlan,
  type UpgradeBaseline,
  type UpgradeTarget,
} from "../neon/db/populated-upgrade";
import type { PostgresPool } from "../neon/db/adapter";
import { createPGliteFixture } from "./neon-db-fixture";
import { seedLocal } from "../scripts/fixtures";
import { batch } from "../lib/db";

const baseline: UpgradeBaseline = JSON.parse(
  await readFile(
    new URL(
      "../evidence/neon-host-archive/historical-ledger-checksums.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const now = new Date("2026-10-24T12:00:00.000Z");
const confirmation = {
  backupCheckpoint: "synthetic-local-verified-restore",
  restoreVerified: true,
};
const crlf = (migration: PortalMigration): PortalMigration => {
  const sql = migration.sql.replaceAll("\n", "\r\n");
  return {
    ...migration,
    sql,
    checksum: createHash("sha256").update(sql).digest("hex"),
  };
};
const stops = (code: string) => (error: unknown) =>
  (error as { code?: string }).code === code;
function traced(pool: PostgresPool, queries: string[]): PostgresPool {
  return {
    async connect() {
      const connection = await pool.connect();
      return {
        async query(sql, values) {
          queries.push(sql);
          return connection.query(sql, values);
        },
        release(error) {
          connection.release(error);
        },
      };
    },
    end: () => pool.end(),
  };
}
async function fixture(encoding: "lf" | "crlf" = "crlf") {
  const f = await createPGliteFixture({
    excludeMigrations: (await loadPortalMigrations()).map((m) => m.name),
  });
  const plan = await loadMigrationPlan();
  await applyPortalMigrations(
    f.pool,
    plan.slice(0, 7).map((m) => (encoding === "crlf" ? crlf(m) : m)),
  );
  await seedLocal(f.db);
  await batch(f.db, [
    [
      "INSERT INTO check_ins VALUES('fake_alice','fake_admin','2026-10-22T08:00:00.000Z')",
    ],
    [
      "INSERT INTO credit_allocations(inventory_id,type_id,user_id,assigned_at,recipient_email) VALUES('fake_item_0','fake_credit','fake_alice','2026-10-22T08:00:00.000Z','alice@portal.test')",
    ],
    [
      "INSERT INTO auth_users(id,email,name,email_verified_at) VALUES('fake_alice','alice@portal.test','Synthetic preserved Alice','2026-10-22T08:00:00.000Z')",
    ],
    [
      "INSERT INTO auth_sessions(token_hash,auth_user_id,expires_at) VALUES('synthetic-legacy-preserved-session','fake_alice',1900000000000)",
    ],
    [
      "INSERT INTO submission_versions(id,team_id,attempt,payload,created_at) VALUES('synthetic-legacy-version','fake_team1',1,?,'2026-11-01T04:30:00.000Z')",
      JSON.stringify({
        projectName: "Synthetic preserved project",
        description: "Preserved local upgrade content",
        attestation: true,
      }),
    ],
    [
      "INSERT INTO projects(id,team_id,slug,draft,revision,published_version_id,updated_at) VALUES('synthetic-legacy-project','fake_team1','synthetic-legacy-project','{}',1,'synthetic-legacy-version','2026-10-22T08:00:00.000Z')",
    ],
    [
      "INSERT INTO approved_evaluation_snapshots(version_id,commit_sha,snapshot_json,snapshot_sha256,approved_by,approved_at) VALUES('synthetic-legacy-version',?,'{}',?,'fake_owner','2026-10-22T08:00:00.000Z')",
      "b".repeat(40),
      createHash("sha256").update("{}").digest("hex"),
    ],
  ]);
  const identity = (
    await f.engine.query<{ database: string; role: string }>(
      "SELECT current_database() database,current_user role",
    )
  ).rows[0];
  const target: UpgradeTarget = {
    host: "synthetic-legacy.invalid",
    port: "5432",
    ...identity,
  };
  const snapshot = async (tables?: string[]) => {
    const names =
      tables ||
      (
        await f.engine.query<{ table_name: string }>(
          "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name",
        )
      ).rows.map((r) => r.table_name);
    const result: Record<string, unknown> = {};
    for (const name of names)
      result[name] = (
        await f.engine.query(
          `SELECT row_to_json(t) record FROM public."${name.replaceAll('"', '""')}" t ORDER BY row_to_json(t)::text`,
        )
      ).rows;
    return result;
  };
  return { ...f, plan, target, snapshot };
}

test("historical Windows CRLF: actual seven-entry ledger inspects read-only and upgrades only two canonical features without rewriting old rows", async () => {
  const f = await fixture();
  try {
    assert.equal(
      verifyUpgradePlan(f.plan, baseline),
      "498280b69647485b4f55c35331a0f8af486983d819ee2dc25fb1840f1e657506",
    );
    // Reproduces the old strict runner mismatch. Compatibility must stay outside it.
    await assert.rejects(
      applyPortalMigrations(f.pool, f.plan),
      /MIGRATION_CHECKSUM_MISMATCH: 0000_compatibility.sql/,
    );
    const before = await f.snapshot();
    const queries: string[] = [];
    const receipt = await inspectPopulatedUpgrade(
      traced(f.pool, queries),
      f.plan,
      baseline,
      f.target,
      now,
    );
    assert.equal((receipt as any).historicalEncoding, "legacy-windows-crlf");
    assert.equal(queries[0], "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    assert.ok(
      !queries.some((sql) =>
        /^\s*(CREATE|ALTER|INSERT|UPDATE|DELETE|DROP)\b/i.test(sql),
      ),
    );
    assert.deepEqual(await f.snapshot(), before);
    assert.deepEqual(
      receipt.ledger,
      f.plan
        .slice(0, 7)
        .map(crlf)
        .map(({ name, checksum }) => ({ name, checksum })),
    );
    assert.deepEqual(receipt.pending, [
      "0102_credit_stock.sql",
      "0103_project_media_limits.sql",
    ]);
    const appliedSql: string[] = [];
    const result = await applyPopulatedUpgrade(
      traced(f.pool, appliedSql),
      f.plan,
      baseline,
      f.target,
      receipt,
      confirmation,
      now,
    );
    assert.deepEqual(result.applied, receipt.pending);
    assert.equal((result as any).historicalEncoding, "legacy-windows-crlf");
    const after = await f.snapshot(Object.keys(before));
    const withoutLedger = (value: Record<string, unknown>) =>
      Object.fromEntries(
        Object.entries(value).filter(
          ([name]) => name !== "portal_schema_migrations",
        ),
      );
    assert.deepEqual(withoutLedger(after), withoutLedger(before));
    const ledger = (
      await f.engine.query<{ name: string; checksum: string }>(
        "SELECT name,checksum FROM portal_schema_migrations ORDER BY name",
      )
    ).rows;
    assert.deepEqual(ledger.slice(0, 7), receipt.ledger);
    assert.deepEqual(ledger.slice(7), baseline.pendingFeatureMigrations);
    const recorded = before.portal_schema_migrations as any[];
    const afterRecorded = after.portal_schema_migrations as any[];
    for (const old of recorded)
      assert.deepEqual(
        afterRecorded.find((row) => row.record.name === old.record.name),
        old,
      );
    assert.ok(
      !appliedSql.some((sql) =>
        /^\s*(UPDATE|DELETE).*portal_schema_migrations/i.test(sql),
      ),
    );
    const fresh = await inspectPopulatedUpgrade(
      f.pool,
      f.plan,
      baseline,
      f.target,
      now,
    );
    assert.deepEqual(fresh.pending, []);
    assert.deepEqual(
      (
        await applyPopulatedUpgrade(
          f.pool,
          f.plan,
          baseline,
          f.target,
          fresh,
          confirmation,
          now,
        )
      ).applied,
      [],
    );
    assert.deepEqual(await f.snapshot(Object.keys(before)), after);
  } finally {
    await f.db.close();
  }
});

test("historical Windows CRLF: canonical0102 already applied leaves only0103 pending and keeps all existing stock records", async () => {
  const f = await fixture();
  try {
    await applyPortalMigrations(
      f.pool,
      f.plan.slice(0, 8).map((m, i) => (i < 7 ? crlf(m) : m)),
    );
    const before = await f.snapshot();
    const receipt = await inspectPopulatedUpgrade(
      f.pool,
      f.plan,
      baseline,
      f.target,
      now,
    );
    assert.equal((receipt as any).historicalEncoding, "legacy-windows-crlf");
    assert.deepEqual(receipt.pending, ["0103_project_media_limits.sql"]);
    assert.deepEqual(
      (
        await applyPopulatedUpgrade(
          f.pool,
          f.plan,
          baseline,
          f.target,
          receipt,
          confirmation,
          now,
        )
      ).applied,
      receipt.pending,
    );
    const after = await f.snapshot(Object.keys(before));
    for (const [table, value] of Object.entries(before))
      if (table !== "portal_schema_migrations")
        assert.deepEqual(after[table], value, table);
  } finally {
    await f.db.close();
  }
});

test("historical Windows CRLF: mixed, arbitrary, missing, unknown and noncanonical feature ledgers fail before DDL", async () => {
  const f = await fixture();
  try {
    const receipt = await inspectPopulatedUpgrade(
      f.pool,
      f.plan,
      baseline,
      f.target,
      now,
    );
    const original = (
      await f.engine.query<{
        name: string;
        checksum: string;
        applied_at: string;
      }>(
        "SELECT name,checksum,applied_at::text applied_at FROM portal_schema_migrations ORDER BY name",
      )
    ).rows;
    const cases = [
      "mixed",
      "arbitrary",
      "missing",
      "unknown",
      "0103-only",
      "0102-crlf",
      "0103-crlf",
    ];
    for (const kind of cases) {
      await f.engine.exec("DELETE FROM portal_schema_migrations");
      for (const row of original)
        await f.engine.query(
          "INSERT INTO portal_schema_migrations(name,checksum,applied_at) VALUES($1,$2,$3)",
          [row.name, row.checksum, row.applied_at],
        );
      if (kind === "mixed" || kind === "arbitrary")
        await f.engine.query(
          "UPDATE portal_schema_migrations SET checksum=$1 WHERE name=$2",
          [
            kind === "mixed" ? f.plan[0].checksum : "a".repeat(64),
            f.plan[0].name,
          ],
        );
      if (kind === "missing")
        await f.engine.exec(
          "DELETE FROM portal_schema_migrations WHERE name='0100_auth.sql'",
        );
      if (kind === "unknown")
        await f.engine.query(
          "INSERT INTO portal_schema_migrations(name,checksum) VALUES('0005_unknown.sql',$1)",
          ["a".repeat(64)],
        );
      if (kind === "0103-only")
        await f.engine.query(
          "INSERT INTO portal_schema_migrations(name,checksum) VALUES($1,$2)",
          [f.plan[8].name, f.plan[8].checksum],
        );
      if (kind === "0102-crlf" || kind === "0103-crlf") {
        await f.engine.query(
          "INSERT INTO portal_schema_migrations(name,checksum) VALUES($1,$2)",
          [
            f.plan[7].name,
            kind === "0102-crlf"
              ? crlf(f.plan[7]).checksum
              : f.plan[7].checksum,
          ],
        );
        if (kind === "0103-crlf")
          await f.engine.query(
            "INSERT INTO portal_schema_migrations(name,checksum) VALUES($1,$2)",
            [f.plan[8].name, crlf(f.plan[8]).checksum],
          );
      }
      const before = await f.snapshot();
      await assert.rejects(
        inspectPopulatedUpgrade(f.pool, f.plan, baseline, f.target, now),
        stops("UPGRADE_HISTORICAL_LEDGER_MISMATCH"),
        kind,
      );
      const queries: string[] = [];
      await assert.rejects(
        applyPopulatedUpgrade(
          traced(f.pool, queries),
          f.plan,
          baseline,
          f.target,
          receipt,
          confirmation,
          now,
        ),
        stops("UPGRADE_HISTORICAL_LEDGER_MISMATCH"),
        kind,
      );
      assert.ok(
        !queries.some((sql) =>
          /^\s*(CREATE|ALTER|INSERT|UPDATE|DELETE|DROP)\b/i.test(sql),
        ),
        kind,
      );
      assert.deepEqual(await f.snapshot(), before, kind);
    }
  } finally {
    await f.db.close();
  }
});

test("historical Windows CRLF: stale receipt data and whole-encoding switch are rechecked under the unchanged migration lock", async () => {
  const f = await fixture();
  try {
    const receipt = await inspectPopulatedUpgrade(
      f.pool,
      f.plan,
      baseline,
      f.target,
      now,
    );
    await f.engine.exec(
      "INSERT INTO users(id,email,name,created_at) VALUES('synthetic-count-race','count-race@example.invalid','Synthetic race','2026-10-22T08:00:00.000Z')",
    );
    const before = await f.snapshot();
    const queries: string[] = [];
    await assert.rejects(
      applyPopulatedUpgrade(
        traced(f.pool, queries),
        f.plan,
        baseline,
        f.target,
        receipt,
        confirmation,
        now,
      ),
      stops("UPGRADE_DATABASE_CHANGED_SINCE_INSPECTION"),
    );
    assert.ok(
      queries.findIndex((sql) => sql.includes("current_database()")) >
        queries.findIndex((sql) => sql.includes("pg_advisory_xact_lock")),
    );
    assert.ok(!queries.some((sql) => sql.startsWith("CREATE TABLE")));
    assert.deepEqual(await f.snapshot(), before);
    const fresh = await inspectPopulatedUpgrade(
      f.pool,
      f.plan,
      baseline,
      f.target,
      now,
    );
    for (const migration of f.plan.slice(0, 7))
      await f.engine.query(
        "UPDATE portal_schema_migrations SET checksum=$1 WHERE name=$2",
        [migration.checksum, migration.name],
      );
    const changed = await f.snapshot();
    await assert.rejects(
      applyPopulatedUpgrade(
        f.pool,
        f.plan,
        baseline,
        f.target,
        fresh,
        confirmation,
        now,
      ),
      stops("UPGRADE_DATABASE_CHANGED_SINCE_INSPECTION"),
    );
    assert.deepEqual(await f.snapshot(), changed);
  } finally {
    await f.db.close();
  }
});

test("historical Windows CRLF: failed postcondition rolls feature DDL, new ledger entries and triggered writes back atomically", async () => {
  const f = await fixture();
  try {
    await f.engine
      .exec(`CREATE FUNCTION synthetic_legacy_postcondition() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.name='0103_project_media_limits.sql' THEN
          INSERT INTO audit_logs VALUES('synthetic-legacy-side-effect','fake_owner','local-fixture','local','{}','Synthetic rollback proof','2026-10-24T12:00:00.000Z');
        END IF;
        RETURN NEW;
      END; $$;
      CREATE TRIGGER synthetic_legacy_postcondition AFTER INSERT ON portal_schema_migrations FOR EACH ROW EXECUTE FUNCTION synthetic_legacy_postcondition();`);
    const receipt = await inspectPopulatedUpgrade(
      f.pool,
      f.plan,
      baseline,
      f.target,
      now,
    );
    const before = await f.snapshot();
    await assert.rejects(
      applyPopulatedUpgrade(
        f.pool,
        f.plan,
        baseline,
        f.target,
        receipt,
        confirmation,
        now,
      ),
      stops("UPGRADE_POST_VALIDATION_FAILED"),
    );
    assert.deepEqual(await f.snapshot(), before);
    assert.equal(
      (
        await f.engine.query(
          "SELECT to_regclass('public.credit_code_history') history",
        )
      ).rows[0].history,
      null,
    );
  } finally {
    await f.db.close();
  }
});
