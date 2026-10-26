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
const migration = "0107_admin_team_lock.sql",
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
  test(`admin-lock upgrade ${encoding}: populated12→13 applies only0107, preserves data/checksums/locks and repeats with no work`, async () => {
    const f = await legacyLedgerIndependentFixture(encoding);
    try {
      await applyPortalMigrations(f.pool, f.plan.slice(7, 12));
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
      assert.equal(inspected.ledger.length, 12);
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
        (after.portal_schema_migrations as any[]).slice(0, 12),
        before.portal_schema_migrations,
      );
      const repeat = await inspectPopulatedUpgrade(
        f.pool,
        f.plan,
        baseline,
        target,
      );
      assert.equal(repeat.ledger.length, 13);
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
    await applyPortalMigrations(f.pool, f.plan.slice(7, 12));
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
          "SELECT pg_get_functiondef('portal_trigger_complete_team_lock'::regproc) definition",
        )
      ).rows;
    const beforeFunction = await definition();
    const failing: PostgresPool = {
      async connect() {
        const c = await f.pool.connect();
        return {
          query: (sql, values) =>
            c.query(
              sql === f.plan[12].sql
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

test("SQLite and Drizzle mirrors add only exact admin capability while normal leader/idea/profile checks remain", async () => {
  const source = readFileSync(
    new URL("../db/migrations/0028_admin_team_lock.sql", import.meta.url),
    "utf8",
  );
  const mirror = readFileSync(
    new URL("../drizzle/0030_admin_team_lock.sql", import.meta.url),
    "utf8",
  );
  assert.equal(
    source.replace(/\s+/g, " ").trim(),
    mirror
      .replaceAll("--> statement-breakpoint", "")
      .replace(/\s+/g, " ")
      .trim(),
  );
  for (const directory of ["../db/migrations/", "../drizzle/"]) {
    const db = new LocalDatabase(":memory:");
    try {
      for (const name of readdirSync(new URL(directory, import.meta.url))
        .filter(
          (name) =>
            name.endsWith(".sql") &&
            !["0028_admin_team_lock.sql", "0030_admin_team_lock.sql"].includes(
              name,
            ),
        )
        .sort())
        db.raw.exec(
          readFileSync(
            new URL(directory + name, import.meta.url),
            "utf8",
          ).replaceAll("--> statement-breakpoint", ""),
        );
      await seedLocal(db);
      await batch(db, [
        ["DELETE FROM ideas WHERE team_id='fake_team3'"],
        ["DELETE FROM participant_profiles WHERE user_id='fake_carol'"],
      ]);
      const token =
        "admin-team-lock:" + JSON.stringify(["fake_team3", "fake_admin", at]);
      const insert = () =>
        batch(db, [
          ["INSERT INTO write_guards VALUES(?,1)", token],
          ["INSERT INTO team_locks VALUES('fake_team3','fake_admin',?)", at],
          ["DELETE FROM write_guards WHERE token=?", token],
        ]);
      await assert.rejects(insert(), /LEADER_REQUIRED/);
      db.raw.exec(
        directory.includes("drizzle")
          ? mirror.replaceAll("--> statement-breakpoint", "")
          : source,
      );
      await assert.rejects(
        batch(db, [
          ["INSERT INTO team_locks VALUES('fake_team3','fake_bob',?)", at],
        ]),
        /TEAM_IDEA_REQUIRED/,
      );
      await insert();
      assert.equal(
        (await one<any>(
          db,
          "SELECT locked_by FROM team_locks WHERE team_id='fake_team3'",
        ))!.locked_by,
        "fake_admin",
      );
      assert.equal(
        await one(db, "SELECT team_id FROM ideas WHERE team_id='fake_team3'"),
        undefined,
      );
      assert.deepEqual(await rows(db, "SELECT * FROM write_guards"), []);
    } finally {
      db.close();
    }
  }
});
