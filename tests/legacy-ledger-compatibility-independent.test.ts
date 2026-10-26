import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { batch, one, rows } from "../lib/db";
import type { PostgresPool } from "../neon/db/adapter";
import { loadMigrationPlan } from "../neon/migration-plan";
import {
  inspectPopulatedUpgrade,
  applyPopulatedUpgrade,
  verifyUpgradePlan,
  type UpgradeBaseline,
  type UpgradeTarget,
} from "../neon/db/populated-upgrade";
import { legacyLedgerIndependentFixture } from "./legacy-ledger-independent-fixture";

const baseline = JSON.parse(
  readFileSync(
    new URL(
      "../evidence/neon-host-archive/historical-ledger-checksums.json",
      import.meta.url,
    ),
    "utf8",
  ),
) as UpgradeBaseline;
const hashes = JSON.parse(
  readFileSync(
    new URL(
      "../evidence/legacy-ledger-independent/derived-historical-hashes.json",
      import.meta.url,
    ),
    "utf8",
  ),
) as { historical: { name: string; lf: string; crlf: string }[] };
const now = new Date("2026-10-24T12:00:00.000Z");
const confirmation = {
  backupCheckpoint: "synthetic-independent-verified-restore",
  restoreVerified: true,
};
const targetFor = (identity: {
  database: string;
  role: string;
}): UpgradeTarget => ({
  host: "synthetic-independent.invalid",
  port: "5432",
  ...identity,
});
const historical = hashes.historical.map(({ name, crlf }) => ({
  name,
  checksum: crlf,
}));
function traced(pool: PostgresPool, sql: string[]): PostgresPool {
  return {
    async connect() {
      const connection = await pool.connect();
      return {
        async query(text, values) {
          sql.push(text);
          return connection.query(text, values);
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
const noDdlOrWrites = (sql: string[]) =>
  assert.equal(
    sql.some((text) =>
      /^\s*(CREATE|ALTER|INSERT|UPDATE|DELETE|DROP|TRUNCATE)\b/i.test(text),
    ),
    false,
  );
const domain = (snapshot: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(snapshot).filter(
      ([name]) => name !== "portal_schema_migrations",
    ),
  );

test("independent legacy ledger: exact seven CRLF aliases derive from pinned LF source while canonical thirteen-entry digest matches the reviewed plan", async () => {
  const plan = await loadMigrationPlan();
  assert.equal(
    verifyUpgradePlan(plan, baseline),
    "2dc505efb7e5cf25f4e9da1a56e9aa9cb4a816735b222127b9fdfdb5daafa277",
  );
  assert.equal(historical.length, 7);
  for (const [i, entry] of hashes.historical.entries()) {
    assert.equal(plan[i].name, entry.name);
    assert.equal(plan[i].checksum, entry.lf);
    assert.equal(
      createHash("sha256")
        .update(plan[i].sql.replace(/\n/g, "\r\n"))
        .digest("hex"),
      entry.crlf,
    );
    assert.notEqual(entry.lf, entry.crlf);
  }
});

test("independent legacy ledger: canonical LF history and an existing canonical receipt without the new mode field stay valid", async () => {
  const f = await legacyLedgerIndependentFixture("lf");
  try {
    const target = targetFor(f.identity),
      before = await f.snapshot();
    const receipt = await inspectPopulatedUpgrade(
      f.pool,
      f.plan,
      baseline,
      target,
      now,
    );
    assert.equal((receipt as any).historicalEncoding, "canonical-lf");
    delete (receipt as any).historicalEncoding;
    const result = await applyPopulatedUpgrade(
      f.pool,
      f.plan,
      baseline,
      target,
      receipt,
      confirmation,
      now,
    );
    assert.equal((result as any).historicalEncoding, "canonical-lf");
    assert.deepEqual(result.applied, [
      "0102_credit_stock.sql",
      "0103_project_media_limits.sql",
      "0104_admin_team_corrections.sql",
      "0105_terminal_record_deletion.sql",
      "0106_admin_team_unlock.sql",
      "0107_admin_team_lock.sql",
    ]);
    const after = await f.snapshot();
    assert.deepEqual(domain(after), domain(before));
    assert.deepEqual(
      (after.portal_schema_migrations as any[]).slice(0, 7),
      before.portal_schema_migrations,
    );
  } finally {
    await f.db.close();
  }
});

test("independent actual CRLF history: readonly inspect, populated7→13 canonical features, unchanged legacy ledger/data and repeat[]", async () => {
  const f = await legacyLedgerIndependentFixture();
  try {
    const before = await f.snapshot(),
      target = targetFor(f.identity),
      inspection: string[] = [];
    assert.deepEqual(
      (before.portal_schema_migrations as any[]).map(({ name, checksum }) => ({
        name,
        checksum,
      })),
      historical,
    );
    const receipt = await inspectPopulatedUpgrade(
      traced(f.pool, inspection),
      f.plan,
      baseline,
      target,
      now,
    );
    assert.equal((receipt as any).historicalEncoding, "legacy-windows-crlf");
    assert.deepEqual(receipt.ledger, historical);
    assert.deepEqual(receipt.pending, [
      "0102_credit_stock.sql",
      "0103_project_media_limits.sql",
      "0104_admin_team_corrections.sql",
      "0105_terminal_record_deletion.sql",
      "0106_admin_team_unlock.sql",
      "0107_admin_team_lock.sql",
    ]);
    assert.deepEqual(await f.snapshot(), before);
    assert.equal(
      inspection[0],
      "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY",
    );
    noDdlOrWrites(inspection);
    const sql: string[] = [];
    const result = await applyPopulatedUpgrade(
      traced(f.pool, sql),
      f.plan,
      baseline,
      target,
      receipt,
      confirmation,
      now,
    );
    assert.equal((result as any).historicalEncoding, "legacy-windows-crlf");
    assert.deepEqual(result.applied, receipt.pending);
    const after = await f.snapshot(),
      ledger = after.portal_schema_migrations as any[];
    assert.deepEqual(domain(after), domain(before));
    assert.equal(ledger.length, 13);
    assert.deepEqual(ledger.slice(0, 7), before.portal_schema_migrations);
    assert.deepEqual(
      ledger.slice(7).map(({ name, checksum }) => ({ name, checksum })),
      baseline.pendingFeatureMigrations,
    );
    for (const item of f.plan.slice(0, 7)) {
      assert.equal(
        sql.includes(item.sql),
        false,
        item.name + " cannot replay LF SQL",
      );
      assert.equal(
        sql.includes(item.sql.replace(/\n/g, "\r\n")),
        false,
        item.name + " cannot replay CRLF SQL",
      );
    }
    assert.equal(
      sql.some((text) =>
        /^\s*(UPDATE|DELETE|TRUNCATE)\b.*portal_schema_migrations/i.test(text),
      ),
      false,
    );
    for (const item of f.plan.slice(7))
      assert.equal(sql.includes(item.sql), true);
    assert.equal(
      (await rows(f.db, "SELECT * FROM credit_code_history")).length,
      20,
    );
    assert.equal(
      (await rows(f.db, "SELECT * FROM credit_allocations")).length,
      1,
    );
    const refreshed = await inspectPopulatedUpgrade(
      f.pool,
      f.plan,
      baseline,
      target,
      now,
    );
    assert.deepEqual(refreshed.pending, []);
    const repeated = await applyPopulatedUpgrade(
      f.pool,
      f.plan,
      baseline,
      target,
      refreshed,
      confirmation,
      now,
    );
    assert.deepEqual(repeated.applied, []);
    assert.deepEqual(await f.snapshot(), after);
  } finally {
    await f.db.close();
  }
});

test("independent legacy ledger: mixed, arbitrary, missing, unknown and CRLF/out-of-order feature rows refuse without ledger or domain writes", async () => {
  const f = await legacyLedgerIndependentFixture();
  try {
    const target = targetFor(f.identity),
      original = (
        await f.engine.query<{
          name: string;
          checksum: string;
          applied_at: string;
        }>(
          "SELECT name,checksum,applied_at::text AS applied_at FROM portal_schema_migrations ORDER BY name",
        )
      ).rows,
      receipt = await inspectPopulatedUpgrade(
        f.pool,
        f.plan,
        baseline,
        target,
        now,
      );
    for (const kind of [
      "mixed",
      "arbitrary",
      "missing",
      "unknown",
      "crlf-feature",
      "feature-order",
    ]) {
      await batch(f.db, [
        ["DELETE FROM portal_schema_migrations"],
        ...original.map(
          (row) =>
            [
              "INSERT INTO portal_schema_migrations(name,checksum,applied_at) VALUES(?,?,?)",
              row.name,
              row.checksum,
              row.applied_at,
            ] as [string, ...unknown[]],
        ),
      ]);
      if (kind === "mixed" || kind === "arbitrary")
        await batch(f.db, [
          [
            "UPDATE portal_schema_migrations SET checksum=? WHERE name=?",
            kind === "mixed" ? baseline.historical[0].checksum : "0".repeat(64),
            historical[0].name,
          ],
        ]);
      if (kind === "missing")
        await batch(f.db, [
          [
            "DELETE FROM portal_schema_migrations WHERE name=?",
            historical[0].name,
          ],
        ]);
      if (kind === "unknown")
        await batch(f.db, [
          [
            "INSERT INTO portal_schema_migrations(name,checksum) VALUES('0099_unknown.sql',?)",
            "a".repeat(64),
          ],
        ]);
      if (kind === "crlf-feature") {
        const feature = f.plan[7];
        await batch(f.db, [
          [
            "INSERT INTO portal_schema_migrations(name,checksum) VALUES(?,?)",
            feature.name,
            createHash("sha256")
              .update(feature.sql.replace(/\n/g, "\r\n"))
              .digest("hex"),
          ],
        ]);
      }
      if (kind === "feature-order")
        await batch(f.db, [
          [
            "INSERT INTO portal_schema_migrations(name,checksum) VALUES(?,?)",
            f.plan[8].name,
            f.plan[8].checksum,
          ],
        ]);
      const before = await f.snapshot(),
        sql: string[] = [];
      await assert.rejects(
        inspectPopulatedUpgrade(
          traced(f.pool, sql),
          f.plan,
          baseline,
          target,
          now,
        ),
        { code: "UPGRADE_HISTORICAL_LEDGER_MISMATCH" },
      );
      noDdlOrWrites(sql);
      const applySql: string[] = [];
      await assert.rejects(
        applyPopulatedUpgrade(
          traced(f.pool, applySql),
          f.plan,
          baseline,
          target,
          receipt,
          confirmation,
          now,
        ),
        { code: "UPGRADE_HISTORICAL_LEDGER_MISMATCH" },
      );
      noDdlOrWrites(applySql);
      assert.deepEqual(await f.snapshot(), before, kind);
    }
  } finally {
    await f.db.close();
  }
});

test("independent legacy ledger: canonical alias mode changes after receipt are rejected under the same lock before DDL", async () => {
  const f = await legacyLedgerIndependentFixture();
  try {
    const target = targetFor(f.identity),
      receipt = await inspectPopulatedUpgrade(
        f.pool,
        f.plan,
        baseline,
        target,
        now,
      );
    await batch(
      f.db,
      baseline.historical.map(({ name, checksum }) => [
        "UPDATE portal_schema_migrations SET checksum=? WHERE name=?",
        checksum,
        name,
      ]),
    );
    const before = await f.snapshot(),
      sql: string[] = [];
    await assert.rejects(
      applyPopulatedUpgrade(
        traced(f.pool, sql),
        f.plan,
        baseline,
        target,
        receipt,
        confirmation,
        now,
      ),
      { code: "UPGRADE_DATABASE_CHANGED_SINCE_INSPECTION" },
    );
    assert.ok(sql.some((text) => text.includes("pg_advisory_xact_lock")));
    noDdlOrWrites(sql);
    assert.deepEqual(await f.snapshot(), before);
    await assert.rejects(one(f.db, "SELECT * FROM credit_code_history"));
  } finally {
    await f.db.close();
  }
});

test("independent legacy ledger: feature collision rolls back all new schema and retains seven original CRLF ledger rows and populated records", async () => {
  const f = await legacyLedgerIndependentFixture();
  try {
    await batch(f.db, [
      [
        "INSERT INTO credit_types VALUES('independent-duplicate',' BUILDER BOOST (FAKE) ','Synthetic legacy collision',1)",
      ],
    ]);
    const target = targetFor(f.identity),
      receipt = await inspectPopulatedUpgrade(
        f.pool,
        f.plan,
        baseline,
        target,
        now,
      ),
      before = await f.snapshot();
    await assert.rejects(
      applyPopulatedUpgrade(
        f.pool,
        f.plan,
        baseline,
        target,
        receipt,
        confirmation,
        now,
      ),
      { code: "23505" },
    );
    assert.deepEqual(await f.snapshot(), before);
    assert.deepEqual(
      await rows<any>(
        f.db,
        "SELECT name,checksum FROM portal_schema_migrations ORDER BY name",
      ),
      historical,
    );
    await assert.rejects(one(f.db, "SELECT * FROM credit_category_keys"));
  } finally {
    await f.db.close();
  }
});
