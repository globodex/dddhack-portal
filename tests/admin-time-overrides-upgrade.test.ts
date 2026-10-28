import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { batch, one, rows } from "../lib/db";
import { LocalDatabase } from "../lib/local-test/sqlite";
import { seedLocal } from "../scripts/fixtures";
import { legacyLedgerIndependentFixture } from "./legacy-ledger-independent-fixture";
import { applyPortalMigrations } from "../neon/db/migrate";
import {
  inspectPopulatedUpgrade,
  applyPopulatedUpgrade,
  type UpgradeBaseline,
  type UpgradeTarget,
} from "../neon/db/populated-upgrade";
import type { PostgresPool } from "../neon/db/adapter";

const baseline: UpgradeBaseline = JSON.parse(
  readFileSync(
    new URL(
      "../evidence/neon-host-archive/historical-ledger-checksums.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const migration = "0108_admin_testing_and_team_corrections.sql",
  at = "2026-10-22T08:00:00.000Z";
const confirmation = {
  backupCheckpoint: "synthetic-admin-lock-verified-restore",
  restoreVerified: true,
};
const stripLedger = (data: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(data).filter(
      ([name]) => name !== "portal_schema_migrations",
    ),
  );

for (const encoding of ["lf", "crlf"] as const) {
  test(`admin-testing upgrade ${encoding}: populated13→14 applies only0108, preserves data/checksums/locks and repeats with no work`, async () => {
    const f = await legacyLedgerIndependentFixture(encoding);
    try {
      await applyPortalMigrations(f.pool, f.plan.slice(7, 13));
      const target: UpgradeTarget = {
        host: "synthetic-admin-lock.invalid",
        port: "5432",
        ...f.identity,
      };
      const before = await f.snapshot(),
        inspected = await inspectPopulatedUpgrade(
          f.pool,
          f.plan,
          baseline,
          target,
        );
      assert.equal(inspected.ledger.length, 13);
      assert.deepEqual(inspected.pending, [migration]);
      assert.deepEqual(await f.snapshot(), before);
      const applied = await applyPopulatedUpgrade(
        f.pool,
        f.plan,
        baseline,
        target,
        inspected,
        confirmation,
      );
      assert.deepEqual(applied.applied, [migration]);
      const after = await f.snapshot();
      assert.deepEqual(stripLedger(after), stripLedger(before));
      assert.deepEqual(
        (after.portal_schema_migrations as any[]).slice(0, 13),
        before.portal_schema_migrations,
      );
      const repeat = await inspectPopulatedUpgrade(
        f.pool,
        f.plan,
        baseline,
        target,
      );
      assert.equal(repeat.ledger.length, 14);
      assert.deepEqual(repeat.pending, []);
      assert.deepEqual(
        (
          await applyPopulatedUpgrade(
            f.pool,
            f.plan,
            baseline,
            target,
            repeat,
            confirmation,
          )
        ).applied,
        [],
      );
      assert.deepEqual(await f.snapshot(), after);
    } finally {
      await f.db.close();
    }
  });
}

test("admin-lock migration DDL failure rolls back the trigger function and ledger without rewriting any recorded hash", async () => {
  const f = await legacyLedgerIndependentFixture("crlf");
  try {
    await applyPortalMigrations(f.pool, f.plan.slice(7, 13));
    const target: UpgradeTarget = {
      host: "synthetic-admin-lock.invalid",
      port: "5432",
      ...f.identity,
    };
    const receipt = await inspectPopulatedUpgrade(
        f.pool,
        f.plan,
        baseline,
        target,
      ),
      before = await f.snapshot();
    const definition = async () =>
      (
        await f.engine.query(
          "SELECT pg_get_functiondef('portal_trigger_submission_guard'::regproc) definition",
        )
      ).rows;
    const beforeFunction = await definition();
    const failing: PostgresPool = {
      async connect() {
        const c = await f.pool.connect();
        return {
          query: (sql, values) =>
            c.query(
              sql === f.plan[13].sql
                ? sql + "; SELECT synthetic_missing_lock_function()"
                : sql,
              values,
            ),
          release: (error) => c.release(error),
        };
      },
      end: () => f.pool.end(),
    };
    await assert.rejects(
      applyPopulatedUpgrade(
        failing,
        f.plan,
        baseline,
        target,
        receipt,
        confirmation,
      ),
    );
    assert.deepEqual(await definition(), beforeFunction);
    assert.deepEqual(await f.snapshot(), before);
  } finally {
    await f.db.close();
  }
});
