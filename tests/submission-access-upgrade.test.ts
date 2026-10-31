import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { legacyLedgerIndependentFixture } from "./legacy-ledger-independent-fixture";
import { applyPortalMigrations } from "../neon/db/migrate";
import {
  inspectPopulatedUpgrade,
  applyPopulatedUpgrade,
} from "../neon/db/populated-upgrade";
import type { PostgresPool } from "../neon/db/adapter";
const baseline = JSON.parse(
  readFileSync(
    "evidence/neon-host-archive/historical-ledger-checksums.json",
    "utf8",
  ),
);
const confirmation = {
  backupCheckpoint: "synthetic-restore-verified",
  restoreVerified: true,
};
for (const encoding of ["lf", "crlf"] as const)
  test(`0110/0111 ${encoding}: populated 15→18 preserves rows and ledger hashes; DDL failure rolls back capabilities`, async () => {
    const f = await legacyLedgerIndependentFixture(encoding);
    try {
      await applyPortalMigrations(f.pool, f.plan.slice(7, 15));
      const target = {
        host: "synthetic-submission.invalid",
        port: "5432",
        ...f.identity,
      };
      const before = await f.snapshot(),
        receipt = await inspectPopulatedUpgrade(
          f.pool,
          f.plan,
          baseline,
          target,
        );
      assert.equal(receipt.ledger.length, 15);
      assert.deepEqual(receipt.pending, [
        "0110_admin_submission_access.sql",
        "0111_admin_missing_team_idea.sql",
        "0112_continuous_engagement.sql",
      ]);
      assert.deepEqual(await f.snapshot(), before);
      const definitions = () =>
        f.engine.query(
          "SELECT proname,prosrc FROM pg_proc WHERE proname IN ('portal_trigger_leader_draft_checkin_insert','portal_trigger_draft_team_checkin_insert','portal_trigger_leader_submission_checkin','portal_trigger_submission_team_checkin','portal_trigger_idea_insert_lock','portal_trigger_locked_ideas_insert') ORDER BY proname",
        );
      const old = (await definitions()).rows;
      for (const failedIndex of [15, 16]) {
        const fail: PostgresPool = {
          async connect() {
            const c = await f.pool.connect();
            return {
              query: (sql, values) =>
                c.query(
                  sql === f.plan[failedIndex].sql
                    ? sql + "; SELECT synthetic_submission_rollback_failure()"
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
            fail,
            f.plan,
            baseline,
            target,
            receipt,
            confirmation,
          ),
        );
        assert.deepEqual(await f.snapshot(), before);
        assert.deepEqual((await definitions()).rows, old);
      }
      const fresh = await inspectPopulatedUpgrade(
        f.pool,
        f.plan,
        baseline,
        target,
      );
      const applied = await applyPopulatedUpgrade(
        f.pool,
        f.plan,
        baseline,
        target,
        fresh,
        confirmation,
      );
      assert.deepEqual(applied.applied, [
        "0110_admin_submission_access.sql",
        "0111_admin_missing_team_idea.sql",
        "0112_continuous_engagement.sql",
      ]);
      const after = await f.snapshot();
      for (const [table, rows] of Object.entries(before))
        if (table !== "portal_schema_migrations")
          assert.deepEqual(after[table], rows, table);
      assert.deepEqual(
        (after.portal_schema_migrations as any[]).slice(0, 15),
        before.portal_schema_migrations,
      );
      const repeat = await inspectPopulatedUpgrade(
        f.pool,
        f.plan,
        baseline,
        target,
      );
      assert.equal(repeat.ledger.length, 18);
      assert.deepEqual(repeat.pending, []);
    } finally {
      await f.pool.end();
    }
  });
