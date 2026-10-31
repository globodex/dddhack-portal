import assert from "node:assert/strict";
import { test } from "node:test";
import {
  readFileSync,
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import {
  applyPopulatedUpgrade,
  inspectPopulatedUpgrade,
  verifyUpgradePlan,
  verifyUpgradeTarget,
  type UpgradeBaseline,
  type UpgradeReceipt,
  type UpgradeTarget,
} from "../neon/db/populated-upgrade";
import type { PostgresPool } from "../neon/db/adapter";
import { loadMigrationPlan } from "../neon/migration-plan";
import { applyPortalMigrations } from "../neon/db/migrate";
import { one, rows, batch } from "../lib/db";
import { populatedUpgradeIndependentFixture } from "./populated-upgrade-independent-fixture";

const baseline = JSON.parse(
  readFileSync(
    new URL(
      "../evidence/neon-host-archive/historical-ledger-checksums.json",
      import.meta.url,
    ),
    "utf8",
  ),
) as UpgradeBaseline;
const now = new Date("2026-10-24T12:00:00.000Z");
const checkpoint = "synthetic-verified-restore:INDEPENDENT_BACKUP_SECRET";
const confirmed = { backupCheckpoint: checkpoint, restoreVerified: true };
const targetFor = (identity: {
  database: string;
  role: string;
}): UpgradeTarget => ({
  host: "synthetic-independent-db.invalid",
  port: "5432",
  ...identity,
});
const denied = (code: string) => (error: unknown) =>
  (error as { code?: string }).code === code;

function traced(pool: PostgresPool, sequence: string[]): PostgresPool {
  return {
    async connect() {
      const connection = await pool.connect();
      return {
        async query(sql, values) {
          sequence.push(sql);
          return connection.query(sql, values);
        },
        release(error) {
          connection.release(error);
        },
      };
    },
    end() {
      return pool.end();
    },
  };
}

test("independent populated upgrade: read-only inspection, pending-only7→18, all old data preserved and fresh-receipt repeat[]", async () => {
  const f = await populatedUpgradeIndependentFixture();
  try {
    const target = targetFor(f.identity),
      before = await f.snapshot(),
      inspectSql: string[] = [];
    const receipt = await inspectPopulatedUpgrade(
      traced(f.pool, inspectSql),
      f.plan,
      baseline,
      target,
      now,
    );
    assert.deepEqual(await f.snapshot(), before);
    assert.equal(
      inspectSql[0],
      "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY",
    );
    assert.equal(
      inspectSql.some((sql) =>
        /^\s*(CREATE|ALTER|INSERT|UPDATE|DELETE|DROP)\b/i.test(sql),
      ),
      false,
    );
    assert.equal(receipt.ledger.length, 7);
    assert.deepEqual(receipt.pending, [
      "0102_credit_stock.sql",
      "0103_project_media_limits.sql",
      "0104_admin_team_corrections.sql",
      "0105_terminal_record_deletion.sql",
      "0106_admin_team_unlock.sql",
      "0107_admin_team_lock.sql",
      "0108_admin_testing_and_team_corrections.sql",
      "0109_owner_ai_model_usage.sql",
        "0110_admin_submission_access.sql",
        "0111_admin_missing_team_idea.sql",
        "0112_continuous_engagement.sql",
    ]);
    const serialized = JSON.stringify(receipt);
    for (const marker of [
      target.host,
      "postgresql://",
      "alice@portal.test",
      "+12025550100",
      "FAKE-NOT-REDEEMABLE",
      checkpoint,
      "SELECT ",
      "INSERT ",
    ])
      assert.equal(serialized.includes(marker), false);
    const applySql: string[] = [];
    const result = await applyPopulatedUpgrade(
      traced(f.pool, applySql),
      f.plan,
      baseline,
      target,
      receipt,
      confirmed,
      now,
    );
    assert.deepEqual(result.applied, receipt.pending);
    assert.equal(result.ownerBackupRestoreAcknowledged, true);
    assert.equal(JSON.stringify(result).includes(checkpoint), false);
    const after = await f.snapshot();
    assert.deepEqual(
      Object.fromEntries(
        Object.entries(after).filter(([k]) => k !== "portal_schema_migrations"),
      ),
      Object.fromEntries(
        Object.entries(before).filter(
          ([k]) => k !== "portal_schema_migrations",
        ),
      ),
    );
    const journal = after.portal_schema_migrations as { name: string }[];
    assert.equal(journal.length, 18);
    assert.deepEqual(journal.slice(0, 7), before.portal_schema_migrations);
    assert.equal(
      (await rows(f.db, "SELECT * FROM credit_code_history")).length,
      20,
    );
    assert.equal(
      (await rows(f.db, "SELECT * FROM credit_allocations")).length,
      1,
    );
    assert.equal(applySql[0], "BEGIN ISOLATION LEVEL SERIALIZABLE");
    const lock = applySql.findIndex((sql) =>
      sql.includes("pg_advisory_xact_lock"),
    );
    const identity = applySql.findIndex((sql) =>
      sql.includes("current_database()"),
    );
    const create = applySql.findIndex((sql) =>
      sql.startsWith("CREATE TABLE IF NOT EXISTS portal_schema_migrations"),
    );
    assert.ok(lock >= 0 && identity > lock && create > identity);
    await assert.rejects(
      applyPopulatedUpgrade(
        f.pool,
        f.plan,
        baseline,
        target,
        receipt,
        confirmed,
        now,
      ),
      denied("UPGRADE_DATABASE_CHANGED_SINCE_INSPECTION"),
    );
    const refreshed = await inspectPopulatedUpgrade(
      f.pool,
      f.plan,
      baseline,
      target,
      now,
    );
    assert.deepEqual(refreshed.pending, []);
    assert.deepEqual(
      (
        await applyPopulatedUpgrade(
          f.pool,
          f.plan,
          baseline,
          target,
          refreshed,
          confirmed,
          now,
        )
      ).applied,
      [],
    );
    assert.deepEqual(await f.snapshot(), after);
  } finally {
    await f.db.close();
  }
});

test("independent populated upgrade: missing ledger refuses without creating or adopting one", async () => {
  const f = await populatedUpgradeIndependentFixture();
  try {
    const target = targetFor(f.identity);
    const receipt = await inspectPopulatedUpgrade(
      f.pool,
      f.plan,
      baseline,
      target,
      now,
    );
    await f.engine.exec("DROP TABLE portal_schema_migrations");
    await assert.rejects(
      inspectPopulatedUpgrade(f.pool, f.plan, baseline, target, now),
      denied("UPGRADE_HISTORICAL_LEDGER_REQUIRED"),
    );
    const sequence: string[] = [];
    await assert.rejects(
      applyPopulatedUpgrade(
        traced(f.pool, sequence),
        f.plan,
        baseline,
        target,
        receipt,
        confirmed,
        now,
      ),
      denied("UPGRADE_HISTORICAL_LEDGER_REQUIRED"),
    );
    assert.equal(
      sequence.some((sql) => sql.startsWith("CREATE TABLE")),
      false,
    );
    assert.equal(
      (
        await f.engine.query<{ ledger: unknown }>(
          "SELECT to_regclass('public.portal_schema_migrations') ledger",
        )
      ).rows[0].ledger,
      null,
    );
    assert.equal(
      (await rows(f.db, "SELECT * FROM credit_inventory")).length,
      20,
    );
    assert.equal(
      (await rows(f.db, "SELECT * FROM credit_allocations")).length,
      1,
    );
  } finally {
    await f.db.close();
  }
});

test("independent populated upgrade: existing0102 ledger allows remaining0103/0104/0105/0106 and preserves existing stock backfill", async () => {
  const f = await populatedUpgradeIndependentFixture();
  try {
    await applyPortalMigrations(
      f.pool,
      f.plan.filter((m) => m.name <= "0102_credit_stock.sql"),
    );
    const target = targetFor(f.identity);
    const receipt = await inspectPopulatedUpgrade(
      f.pool,
      f.plan,
      baseline,
      target,
      now,
    );
    assert.equal(receipt.ledger.length, 8);
    assert.deepEqual(receipt.pending, [
      "0103_project_media_limits.sql",
      "0104_admin_team_corrections.sql",
      "0105_terminal_record_deletion.sql",
      "0106_admin_team_unlock.sql",
      "0107_admin_team_lock.sql",
      "0108_admin_testing_and_team_corrections.sql",
      "0109_owner_ai_model_usage.sql",
        "0110_admin_submission_access.sql",
        "0111_admin_missing_team_idea.sql",
        "0112_continuous_engagement.sql",
    ]);
    const before = await f.snapshot();
    const history = await rows(
      f.db,
      "SELECT * FROM credit_code_history ORDER BY inventory_id",
    );
    const result = await applyPopulatedUpgrade(
      f.pool,
      f.plan,
      baseline,
      target,
      receipt,
      confirmed,
      now,
    );
    assert.deepEqual(result.applied, [
      "0103_project_media_limits.sql",
      "0104_admin_team_corrections.sql",
      "0105_terminal_record_deletion.sql",
      "0106_admin_team_unlock.sql",
      "0107_admin_team_lock.sql",
      "0108_admin_testing_and_team_corrections.sql",
      "0109_owner_ai_model_usage.sql",
        "0110_admin_submission_access.sql",
        "0111_admin_missing_team_idea.sql",
        "0112_continuous_engagement.sql",
    ]);
    const after = await f.snapshot();
    assert.deepEqual(
      Object.fromEntries(
        Object.entries(after).filter(([k]) => k !== "portal_schema_migrations"),
      ),
      Object.fromEntries(
        Object.entries(before).filter(
          ([k]) => k !== "portal_schema_migrations",
        ),
      ),
    );
    assert.deepEqual(
      await rows(
        f.db,
        "SELECT * FROM credit_code_history ORDER BY inventory_id",
      ),
      history,
    );
  } finally {
    await f.db.close();
  }
});

test("independent populated upgrade: unknown, missing, mismatched and0103-only ledger states fail before DDL and retain current data", async () => {
  const f = await populatedUpgradeIndependentFixture();
  try {
    const target = targetFor(f.identity);
    const receipt = await inspectPopulatedUpgrade(
      f.pool,
      f.plan,
      baseline,
      target,
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
    for (const kind of ["unknown", "missing", "checksum", "0103-only"]) {
      await f.engine.exec("DELETE FROM portal_schema_migrations");
      for (const row of original)
        await f.engine.query(
          "INSERT INTO portal_schema_migrations(name,checksum,applied_at) VALUES($1,$2,$3)",
          [row.name, row.checksum, row.applied_at],
        );
      if (kind === "unknown")
        await f.engine.query(
          "INSERT INTO portal_schema_migrations(name,checksum) VALUES('0000_unexpected.sql',$1)",
          ["a".repeat(64)],
        );
      if (kind === "missing")
        await f.engine.exec(
          "DELETE FROM portal_schema_migrations WHERE name='0100_auth.sql'",
        );
      if (kind === "checksum")
        await f.engine.query(
          "UPDATE portal_schema_migrations SET checksum=$1 WHERE name='0001_portal.sql'",
          ["b".repeat(64)],
        );
      if (kind === "0103-only")
        await f.engine.query(
          "INSERT INTO portal_schema_migrations(name,checksum) VALUES($1,$2)",
          [
            baseline.pendingFeatureMigrations[1].name,
            baseline.pendingFeatureMigrations[1].checksum,
          ],
        );
      const before = await f.snapshot();
      await assert.rejects(
        inspectPopulatedUpgrade(f.pool, f.plan, baseline, target, now),
        denied("UPGRADE_HISTORICAL_LEDGER_MISMATCH"),
      );
      const sequence: string[] = [];
      await assert.rejects(
        applyPopulatedUpgrade(
          traced(f.pool, sequence),
          f.plan,
          baseline,
          target,
          receipt,
          confirmed,
          now,
        ),
        denied("UPGRADE_HISTORICAL_LEDGER_MISMATCH"),
      );
      assert.equal(
        sequence.some((sql) => sql.startsWith("CREATE TABLE")),
        false,
        kind,
      );
      assert.deepEqual(await f.snapshot(), before, kind);
    }
  } finally {
    await f.db.close();
  }
});

test("independent populated upgrade: connected role and changed table counts revalidated after inspection under migration lock", async () => {
  const f = await populatedUpgradeIndependentFixture();
  try {
    const target = targetFor(f.identity);
    const receipt = await inspectPopulatedUpgrade(
      f.pool,
      f.plan,
      baseline,
      target,
      now,
    );
    await f.engine.exec(
      "CREATE ROLE independent_upgrade_other; SET ROLE independent_upgrade_other",
    );
    try {
      await assert.rejects(
        applyPopulatedUpgrade(
          f.pool,
          f.plan,
          baseline,
          target,
          receipt,
          confirmed,
          now,
        ),
        denied("UPGRADE_CONNECTED_IDENTITY_MISMATCH"),
      );
    } finally {
      await f.engine.exec("RESET ROLE");
    }
    await batch(f.db, [
      [
        "INSERT INTO credit_inventory(id,type_id,ciphertext,fingerprint,created_at,voucher_value) SELECT 'independent-stale-stock',type_id,ciphertext,'independent-stale-fingerprint',created_at,voucher_value FROM credit_inventory WHERE id='fake_item_0'",
      ],
    ]);
    const before = await f.snapshot();
    await assert.rejects(
      applyPopulatedUpgrade(
        f.pool,
        f.plan,
        baseline,
        target,
        receipt,
        confirmed,
        now,
      ),
      denied("UPGRADE_DATABASE_CHANGED_SINCE_INSPECTION"),
    );
    assert.deepEqual(await f.snapshot(), before);
    await assert.rejects(one(f.db, "SELECT * FROM credit_code_history"));
  } finally {
    await f.db.close();
  }
});

test("independent populated upgrade: actual PostgreSQL postcondition failure rolls all feature DDL, ledger and triggered data back", async () => {
  const f = await populatedUpgradeIndependentFixture();
  try {
    await f.engine
      .exec(`CREATE FUNCTION independent_upgrade_side_effect() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.name='0103_project_media_limits.sql' THEN
          INSERT INTO audit_logs VALUES('independent-postcondition','fake_owner','independent-fixture','synthetic','{}','Synthetic rollback proof','2026-10-24T12:00:00.000Z');
        END IF;
        RETURN NEW;
      END; $$;
      CREATE TRIGGER independent_upgrade_side_effect AFTER INSERT ON portal_schema_migrations FOR EACH ROW EXECUTE FUNCTION independent_upgrade_side_effect();`);
    const target = targetFor(f.identity);
    const receipt = await inspectPopulatedUpgrade(
      f.pool,
      f.plan,
      baseline,
      target,
      now,
    );
    const before = await f.snapshot();
    await assert.rejects(
      applyPopulatedUpgrade(
        f.pool,
        f.plan,
        baseline,
        target,
        receipt,
        confirmed,
        now,
      ),
      denied("UPGRADE_POST_VALIDATION_FAILED"),
    );
    assert.deepEqual(await f.snapshot(), before);
    assert.equal((await rows(f.db, "SELECT * FROM audit_logs")).length, 0);
    await assert.rejects(one(f.db, "SELECT * FROM credit_code_history"));
    await assert.rejects(
      batch(f.db, [
        [
          "UPDATE portal_media_uploads SET byte_length=5000000 WHERE id='synthetic-independent-ready'",
        ],
      ]),
      /check constraint/,
    );
  } finally {
    await f.db.close();
  }
});

test("independent populated upgrade: legacy credit collision aborts with existing ledger and data unchanged", async () => {
  const f = await populatedUpgradeIndependentFixture();
  try {
    await batch(f.db, [
      [
        "INSERT INTO credit_types VALUES('independent-duplicate',' BUILDER BOOST (FAKE) ','Synthetic legacy collision',1)",
      ],
    ]);
    const target = targetFor(f.identity);
    const receipt = await inspectPopulatedUpgrade(
      f.pool,
      f.plan,
      baseline,
      target,
      now,
    );
    const before = await f.snapshot();
    await assert.rejects(
      applyPopulatedUpgrade(
        f.pool,
        f.plan,
        baseline,
        target,
        receipt,
        confirmed,
        now,
      ),
      denied("23505"),
    );
    assert.deepEqual(await f.snapshot(), before);
    await assert.rejects(one(f.db, "SELECT * FROM credit_category_keys"));
  } finally {
    await f.db.close();
  }
});

test("independent populated upgrade: source, receipt age/digest and owner restore acknowledgment guards refuse before connection", async () => {
  const plan = await loadMigrationPlan();
  let connections = 0;
  const noDatabase: PostgresPool = {
    async connect() {
      connections++;
      throw new Error("DATABASE_MUST_NOT_CONNECT");
    },
    async end() {},
  };
  const target = targetFor({
    database: "synthetic_database",
    role: "synthetic_role",
  });
  const receipt: UpgradeReceipt = {
    format: "portal-populated-upgrade-v1",
    createdAt: now.toISOString(),
    planDigest: verifyUpgradePlan(plan, baseline),
    targetDigest: createHash("sha256")
      .update(JSON.stringify(target))
      .digest("hex"),
    ledger: [],
    pending: [],
    counts: {},
  };
  for (const acknowledgment of [
    { backupCheckpoint: "", restoreVerified: true },
    { backupCheckpoint: checkpoint, restoreVerified: false },
    { backupCheckpoint: "line\nbreak", restoreVerified: true },
  ])
    await assert.rejects(
      applyPopulatedUpgrade(
        noDatabase,
        plan,
        baseline,
        target,
        receipt,
        acknowledgment,
        now,
      ),
      denied("UPGRADE_VERIFIED_RESTORE_CHECKPOINT_REQUIRED"),
    );
  for (const bad of [
    { ...receipt, targetDigest: "not-a-valid-target-digest" },
    { ...receipt, createdAt: "2026-10-22T00:00:00.000Z" },
    { ...receipt, createdAt: "2026-10-25T00:00:00.000Z" },
  ])
    await assert.rejects(
      applyPopulatedUpgrade(
        noDatabase,
        plan,
        baseline,
        target,
        bad,
        confirmed,
        now,
      ),
      denied("UPGRADE_RECEIPT_INVALID_OR_STALE"),
    );
  const altered = plan.map((m, i) =>
    i === 0 ? { ...m, sql: m.sql + "\n-- unexpected source" } : m,
  );
  assert.throws(
    () => verifyUpgradePlan(altered, baseline),
    denied("UPGRADE_SOURCE_PLAN_MISMATCH"),
  );
  assert.equal(connections, 0);
});

test("independent populated upgrade: private target input rejects override URLs, pooler, wrong identity and control characters", () => {
  const expected = {
    host: "synthetic.example.test",
    database: "synthetic_database",
    role: "synthetic_role",
  };
  const url =
    "postgresql://synthetic_role:INDEPENDENT_URL_SECRET@synthetic.example.test/synthetic_database?sslmode=require";
  assert.deepEqual(verifyUpgradeTarget(url, expected), {
    ...expected,
    port: "5432",
  });
  for (const bad of [
    url + "&host=other.example.test",
    url + "&user=other",
    url + "&dbname=other",
    url + "&options=-crole=other",
    url.replace("synthetic.example.test", "synthetic-pooler.example.test"),
    url.replace("synthetic_database", "other_database"),
    url.replace("synthetic_role:", "other_role:"),
    url.replace("postgresql:", "https:"),
    url.replace("/synthetic_database?", "/synthetic_database%0A?"),
  ])
    assert.throws(() => verifyUpgradeTarget(bad, expected));
});

test("independent populated upgrade CLI: offline default/strict flags, private receipt no-overwrite and generic secret-free errors", () => {
  const cwd = mkdtempSync(join(tmpdir(), "ddd-upgrade-independent-cli-"));
  const script = resolve("neon/scripts/upgrade-populated.ts");
  const loader = createRequire(import.meta.url).resolve("tsx");
  const safeEnv: NodeJS.ProcessEnv = {
    NODE_ENV: "test",
    PATH: process.env.PATH || "",
    DATABASE_URL_UNPOOLED:
      "postgresql://synthetic_role:INDEPENDENT_URL_SECRET@synthetic.example.test/synthetic_database?sslmode=require",
    MIGRATION_EXPECTED_HOST: "synthetic.example.test",
    MIGRATION_EXPECTED_DATABASE: "synthetic_database",
    MIGRATION_EXPECTED_ROLE: "synthetic_role",
  };
  const run = (args: string[], env: NodeJS.ProcessEnv = safeEnv) =>
    spawnSync(process.execPath, ["--import", loader, script, ...args], {
      cwd,
      env,
      encoding: "utf8",
      timeout: 15_000,
    });
  try {
    const defaults = run([], { NODE_ENV: "test", PATH: safeEnv.PATH });
    assert.equal(defaults.status, 0);
    const plan = JSON.parse(defaults.stdout);
    assert.equal(plan.mode, "source-plan-only");
    assert.equal(plan.migrations.length, 18);
    for (const args of [
      ["--apply-synthetic"],
      ["--plan", "--unknown"],
      ["--apply-populated"],
      ["--inspect-populated", "--receipt", "elsewhere.json"],
    ]) {
      const result = run(args);
      assert.equal(result.status, 1, args.join(" "));
      assert.equal(
        (result.stdout + result.stderr).includes("INDEPENDENT_URL_SECRET"),
        false,
      );
      assert.equal(
        (result.stdout + result.stderr).includes("postgresql://"),
        false,
      );
      assert.equal((result.stdout + result.stderr).includes("SELECT "), false);
    }
    const synthetic = run(
      ["--inspect-populated", "--receipt", ".local/blocked.json"],
      { ...safeEnv, PORTAL_SYNTHETIC_DATABASE: "1" },
    );
    assert.equal(synthetic.status, 1);
    assert.equal(
      JSON.parse(synthetic.stderr).code,
      "UPGRADE_SYNTHETIC_FLAG_FORBIDDEN",
    );
    mkdirSync(join(cwd, ".local"), { recursive: true });
    const existing = join(cwd, ".local", "existing.json");
    writeFileSync(existing, "synthetic-existing-file-must-survive");
    const refused = run([
      "--inspect-populated",
      "--receipt",
      ".local/existing.json",
    ]);
    assert.equal(refused.status, 1);
    assert.equal(JSON.parse(refused.stderr).code, "UPGRADE_STOPPED_FOR_REVIEW");
    assert.equal(
      readFileSync(existing, "utf8"),
      "synthetic-existing-file-must-survive",
    );
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
