import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { batch } from "../lib/db";
import { applyPortalMigrations } from "../neon/db/migrate";
import type { PostgresPool } from "../neon/db/adapter";
import {
  applyPopulatedUpgrade,
  inspectPopulatedUpgrade,
  verifyUpgradePlan,
  type UpgradeBaseline,
  type UpgradeTarget,
} from "../neon/db/populated-upgrade";
import { legacyLedgerIndependentFixture } from "./legacy-ledger-independent-fixture";

const approval = JSON.parse(
  readFileSync(
    new URL(
      "../evidence/neon-host-archive/historical-ledger-checksums.json",
      import.meta.url,
    ),
    "utf8",
  ),
) as UpgradeBaseline;
const expectedDigest =
  "9bcf3f083d47a1b700e467c60f3b9eff57193491bb1e2929b1c2a4f21ba532d1";
const feature = "0104_admin_team_corrections.sql";
const now = new Date("2026-10-24T20:00:00.000Z");
const confirmation = {
  backupCheckpoint: "synthetic-0104-verified-restore",
  restoreVerified: true,
};
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
async function fixture(encoding: "lf" | "crlf") {
  const f = await legacyLedgerIndependentFixture(encoding);
  await applyPortalMigrations(
    f.pool,
    f.plan.filter(
      (item) =>
        item.name === "0102_credit_stock.sql" ||
        item.name === "0103_project_media_limits.sql",
    ),
  );
  await batch(f.db, [
    [
      "INSERT INTO team_locks(team_id,locked_by,locked_at) VALUES('fake_team1','fake_alice','2026-10-22T08:00:00.000Z')",
    ],
  ]);
  const target: UpgradeTarget = {
    host: "synthetic-0104.invalid",
    port: "5432",
    ...f.identity,
  };
  async function state() {
    const names = (
      await f.engine.query<{ table_name: string }>(
        "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name",
      )
    ).rows.map((row) => row.table_name);
    const data: Record<string, string[]> = {};
    for (const name of names)
      data[name] = (
        await f.engine.query<{ row: string }>(
          `SELECT to_jsonb(t)::text AS row FROM public."${name.replaceAll('"', '""')}" t ORDER BY 1`,
        )
      ).rows.map((row) => row.row);
    return data;
  }
  const functions = async () =>
    (
      await f.engine.query(
        "SELECT proname,pg_get_functiondef(oid) definition FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('portal_trigger_locked_memberships_insert','portal_trigger_membership_guard','portal_trigger_locked_teams_update') ORDER BY proname",
      )
    ).rows;
  return { ...f, target, state, functions };
}
const domain = (state: Record<string, string[]>) =>
  Object.fromEntries(
    Object.entries(state).filter(
      ([name]) => name !== "portal_schema_migrations",
    ),
  );
const noDdl = (queries: string[]) =>
  assert.equal(
    queries.some((sql) =>
      /^\s*(CREATE|ALTER|INSERT|UPDATE|DELETE|DROP|TRUNCATE)\b/i.test(sql),
    ),
    false,
  );

for (const encoding of ["lf", "crlf"] as const) {
  test(`0104 upgrade ${encoding}: populated existing9→10 applies only0104, preserves all prior rows/hashes and repeats with no work`, async () => {
    const f = await fixture(encoding);
    try {
      const before = await f.state(),
        functionsBefore = await f.functions(),
        inspectQueries: string[] = [];
      assert.equal(before.portal_schema_migrations.length, 9);
      assert.equal(before.credit_inventory.length, 20);
      assert.equal(before.credit_allocations.length, 1);
      assert.equal(before.team_locks.length, 1);
      assert.equal(before.submission_versions.length, 1);
      const receipt = await inspectPopulatedUpgrade(
        traced(f.pool, inspectQueries),
        f.plan,
        approval,
        f.target,
        now,
      );
      assert.equal(receipt.planDigest, expectedDigest);
      assert.equal(
        receipt.historicalEncoding,
        encoding === "lf" ? "canonical-lf" : "legacy-windows-crlf",
      );
      assert.deepEqual(receipt.pending, [feature]);
      assert.equal(receipt.ledger.length, 9);
      noDdl(inspectQueries);
      assert.deepEqual(await f.state(), before);
      const queries: string[] = [];
      const result = await applyPopulatedUpgrade(
        traced(f.pool, queries),
        f.plan,
        approval,
        f.target,
        receipt,
        confirmation,
        now,
      );
      assert.deepEqual(result.applied, [feature]);
      const after = await f.state();
      assert.deepEqual(domain(after), domain(before));
      assert.equal(after.portal_schema_migrations.length, 10);
      assert.deepEqual(
        after.portal_schema_migrations.filter(
          (row) => JSON.parse(row).name !== feature,
        ),
        before.portal_schema_migrations,
      );
      assert.notDeepEqual(await f.functions(), functionsBefore);
      for (const item of f.plan.slice(0, 9)) {
        assert.equal(queries.includes(item.sql), false, item.name);
        assert.equal(
          queries.includes(item.sql.replace(/\n/g, "\r\n")),
          false,
          item.name,
        );
      }
      assert.equal(queries.includes(f.plan[9].sql), true);
      assert.equal(
        queries.some((sql) =>
          /^\s*(UPDATE|DELETE)\b.*portal_schema_migrations/i.test(sql),
        ),
        false,
      );
      const refreshed = await inspectPopulatedUpgrade(
        f.pool,
        f.plan,
        approval,
        f.target,
        now,
      );
      assert.deepEqual(refreshed.pending, []);
      assert.deepEqual(
        (
          await applyPopulatedUpgrade(
            f.pool,
            f.plan,
            approval,
            f.target,
            refreshed,
            confirmation,
            now,
          )
        ).applied,
        [],
      );
      assert.deepEqual(await f.state(), after);
    } finally {
      await f.db.close();
    }
  });
}

test("0104 upgrade: old nine-entry receipts stop before connection; unknown/mixed/tampered ledger and stale same-target state stop before DDL", async () => {
  const f = await fixture("crlf");
  try {
    const receipt = await inspectPopulatedUpgrade(
      f.pool,
      f.plan,
      approval,
      f.target,
      now,
    );
    let connects = 0;
    const offline: PostgresPool = {
      async connect() {
        connects++;
        throw new Error("MUST_NOT_CONNECT");
      },
      async end() {},
    };
    await assert.rejects(
      applyPopulatedUpgrade(
        offline,
        f.plan,
        approval,
        f.target,
        {
          ...receipt,
          planDigest:
            "498280b69647485b4f55c35331a0f8af486983d819ee2dc25fb1840f1e657506",
        },
        confirmation,
        now,
      ),
      { code: "UPGRADE_RECEIPT_INVALID_OR_STALE" },
    );
    assert.equal(connects, 0);
    const original = (
      await f.engine.query<{
        name: string;
        checksum: string;
        applied_at: string;
      }>(
        "SELECT name,checksum,applied_at::text applied_at FROM portal_schema_migrations ORDER BY name",
      )
    ).rows;
    for (const kind of [
      "mixed",
      "unknown",
      "tampered-feature",
      "crlf-0104",
      "ledger-mode-race",
      "counts-race",
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
      if (kind === "mixed")
        await batch(f.db, [
          [
            "UPDATE portal_schema_migrations SET checksum=? WHERE name=?",
            approval.historical[0].checksum,
            approval.historical[0].name,
          ],
        ]);
      if (kind === "unknown")
        await batch(f.db, [
          [
            "INSERT INTO portal_schema_migrations(name,checksum) VALUES('0099_unapproved.sql',?)",
            "f".repeat(64),
          ],
        ]);
      if (kind === "tampered-feature")
        await batch(f.db, [
          [
            "UPDATE portal_schema_migrations SET checksum=? WHERE name='0103_project_media_limits.sql'",
            "0".repeat(64),
          ],
        ]);
      if (kind === "crlf-0104")
        await batch(f.db, [
          [
            "INSERT INTO portal_schema_migrations(name,checksum) VALUES(?,?)",
            feature,
            createHash("sha256")
              .update(f.plan[9].sql.replace(/\n/g, "\r\n"))
              .digest("hex"),
          ],
        ]);
      if (kind === "ledger-mode-race")
        await batch(
          f.db,
          approval.historical.map((row) => [
            "UPDATE portal_schema_migrations SET checksum=? WHERE name=?",
            row.checksum,
            row.name,
          ]),
        );
      if (kind === "counts-race")
        await batch(f.db, [
          [
            "INSERT INTO audit_logs VALUES('synthetic-0104-race','fake_owner','synthetic','local','{}','Synthetic receipt race','2026-10-24T20:00:00.000Z')",
          ],
        ]);
      const before = await f.state(),
        functionsBefore = await f.functions(),
        queries: string[] = [];
      await assert.rejects(
        applyPopulatedUpgrade(
          traced(f.pool, queries),
          f.plan,
          approval,
          f.target,
          receipt,
          confirmation,
          now,
        ),
        {
          code: kind.endsWith("race")
            ? "UPGRADE_DATABASE_CHANGED_SINCE_INSPECTION"
            : "UPGRADE_HISTORICAL_LEDGER_MISMATCH",
        },
      );
      noDdl(queries);
      assert.deepEqual(await f.state(), before, kind);
      assert.deepEqual(await f.functions(), functionsBefore, kind);
    }
  } finally {
    await f.db.close();
  }
});

test("0104 upgrade: real postcondition failure rolls function replacements, ledger append and triggered data back atomically", async () => {
  const f = await fixture("crlf");
  try {
    await f.engine.exec(
      `CREATE FUNCTION synthetic_0104_side_effect() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.name='0104_admin_team_corrections.sql' THEN INSERT INTO audit_logs VALUES('synthetic-0104-side-effect','fake_owner','synthetic','local','{}','Synthetic rollback check','2026-10-24T20:00:00.000Z'); END IF; RETURN NEW; END; $$; CREATE TRIGGER synthetic_0104_side_effect AFTER INSERT ON portal_schema_migrations FOR EACH ROW EXECUTE FUNCTION synthetic_0104_side_effect();`,
    );
    const receipt = await inspectPopulatedUpgrade(
        f.pool,
        f.plan,
        approval,
        f.target,
        now,
      ),
      before = await f.state(),
      functionsBefore = await f.functions();
    await assert.rejects(
      applyPopulatedUpgrade(
        f.pool,
        f.plan,
        approval,
        f.target,
        receipt,
        confirmation,
        now,
      ),
      { code: "UPGRADE_POST_VALIDATION_FAILED" },
    );
    assert.deepEqual(await f.state(), before);
    assert.deepEqual(await f.functions(), functionsBefore);
  } finally {
    await f.db.close();
  }
});

test("0104 source plan pins exactly ten LF files and leaves all nine previous SQL blobs and seven historical approval entries unchanged", async () => {
  const { loadMigrationPlan } = await import("../neon/migration-plan");
  const plan = await loadMigrationPlan();
  assert.equal(plan.length, 10);
  assert.equal(verifyUpgradePlan(plan, approval), expectedDigest);
  assert.equal(plan[9].name, feature);
  for (const item of plan.slice(0, 9)) {
    const path =
      item.name === "0100_auth.sql"
        ? "neon/auth-migrations/0001_auth.sql"
        : item.name === "0101_approved_evaluation.sql"
          ? "neon/auth-migrations/0002_approved_evaluation.sql"
          : "neon/migrations/" + item.name;
    const old = spawnSync("git", ["show", "f54306b:" + path]);
    assert.equal(old.status, 0);
    assert.equal(
      createHash("sha256").update(old.stdout).digest("hex"),
      item.checksum,
      item.name,
    );
  }
  const oldApproval = JSON.parse(
    spawnSync(
      "git",
      [
        "show",
        "f54306b:evidence/neon-host-archive/historical-ledger-checksums.json",
      ],
      { encoding: "utf8" },
    ).stdout,
  );
  assert.deepEqual(approval.historical, oldApproval.historical);
  assert.deepEqual(
    approval.pendingFeatureMigrations.slice(0, 2),
    oldApproval.pendingFeatureMigrations,
  );
  assert.deepEqual(
    approval.pendingFeatureMigrations.map((row) => row.name),
    ["0102_credit_stock.sql", "0103_project_media_limits.sql", feature],
  );
});
