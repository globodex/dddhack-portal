import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
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
import { historicalLedgerCompatibility } from "../neon/db/historical-ledger-compatibility";
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
const feature = "0105_terminal_record_deletion.sql",
  digest = "3624c82a7dc7026b5db4179dc021e5d88d33c66bafab35c4916c5a476e04293b";
const now = new Date("2026-10-24T22:00:00.000Z"),
  confirmation = {
    backupCheckpoint: "synthetic-0105-verified-restore",
    restoreVerified: true,
  };
function traced(pool: PostgresPool, queries: string[]): PostgresPool {
  return {
    async connect() {
      const c = await pool.connect();
      return {
        async query(sql, values) {
          queries.push(sql);
          return c.query(sql, values);
        },
        release(error) {
          c.release(error);
        },
      };
    },
    end: () => pool.end(),
  };
}
async function fixture(encoding: "lf" | "crlf", prefix: 9 | 10) {
  const f = await legacyLedgerIndependentFixture(encoding);
  await applyPortalMigrations(f.pool, f.plan.slice(7, prefix));
  await batch(f.db, [
    [
      "INSERT INTO team_locks(team_id,locked_by,locked_at) VALUES('fake_team1','fake_alice','2026-10-22T08:00:00.000Z')",
    ],
    [
      "INSERT INTO submission_versions(id,team_id,attempt,payload,created_at) SELECT 'synthetic-second-version',team_id,2,payload,created_at FROM submission_versions WHERE id='synthetic-independent-version'",
    ],
  ]);
  const target: UpgradeTarget = {
    host: "synthetic-0105.invalid",
    port: "5432",
    ...f.identity,
  };
  async function state() {
    const names = (
      await f.engine.query<{ table_name: string }>(
        "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name",
      )
    ).rows;
    const data: Record<string, string[]> = {};
    for (const { table_name } of names)
      data[table_name] = (
        await f.engine.query<{ row: string }>(
          `SELECT to_jsonb(t)::text AS row FROM public."${table_name.replaceAll('"', '""')}" t ORDER BY 1`,
        )
      ).rows.map((x) => x.row);
    return data;
  }
  const functions = async () =>
    (
      await f.engine.query(
        "SELECT proname,pg_get_functiondef(oid) definition FROM pg_proc WHERE pronamespace='public'::regnamespace AND prokind='f' ORDER BY proname,oid",
      )
    ).rows;
  return { ...f, target, state, functions };
}
for (const encoding of ["lf", "crlf"] as const)
  for (const prefix of [9, 10] as const)
    test(`0105 upgrade ${encoding}: populated${prefix}→19 preserves existing data/ledger and max attempts, pending-only then repeat[]`, async () => {
      const f = await fixture(encoding, prefix);
      try {
        const before = await f.state(),
          inspected: string[] = [];
        assert.equal(before.portal_schema_migrations.length, prefix);
        assert.equal(before.submission_versions.length, 2);
        const receipt = await inspectPopulatedUpgrade(
          traced(f.pool, inspected),
          f.plan,
          approval,
          f.target,
          now,
        );
        const pending =
          prefix === 9
            ? [
                "0104_admin_team_corrections.sql",
                feature,
                "0106_admin_team_unlock.sql",
                "0107_admin_team_lock.sql",
                "0108_admin_testing_and_team_corrections.sql",
                "0109_owner_ai_model_usage.sql",
        "0110_admin_submission_access.sql",
        "0111_admin_missing_team_idea.sql",
        "0112_continuous_engagement.sql", "0113_submission_vote_window.sql",
              ]
            : [
                feature,
                "0106_admin_team_unlock.sql",
                "0107_admin_team_lock.sql",
                "0108_admin_testing_and_team_corrections.sql",
                "0109_owner_ai_model_usage.sql",
        "0110_admin_submission_access.sql",
        "0111_admin_missing_team_idea.sql",
        "0112_continuous_engagement.sql", "0113_submission_vote_window.sql",
              ];
        assert.deepEqual(receipt.pending, pending);
        assert.equal(receipt.planDigest, digest);
        assert.equal(
          receipt.historicalEncoding,
          encoding === "lf" ? "canonical-lf" : "legacy-windows-crlf",
        );
        assert.deepEqual(await f.state(), before);
        assert.ok(
          !inspected.some((sql) =>
            /^\s*(CREATE|ALTER|INSERT|UPDATE|DELETE|DROP)\b/i.test(sql),
          ),
        );
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
        assert.deepEqual(result.applied, pending);
        const after = await f.state();
        assert.equal(after.portal_schema_migrations.length, 19);
        for (const [name, data] of Object.entries(before)) {
          if (name !== "portal_schema_migrations")
            assert.deepEqual(after[name], data, name);
        }
        assert.deepEqual(
          after.portal_schema_migrations.filter(
            (row) => !pending.includes(JSON.parse(row).name),
          ),
          before.portal_schema_migrations,
        );
        assert.deepEqual(after.terminal_record_deletions, []);
        assert.deepEqual(
          after.submission_attempt_ledger.map((row) => JSON.parse(row)),
          [{ team_id: "fake_team1", attempts: 2 }],
        );
        for (const item of f.plan.slice(0, prefix)) {
          assert.ok(!queries.includes(item.sql), item.name);
          assert.ok(
            !queries.includes(item.sql.replaceAll("\n", "\r\n")),
            item.name,
          );
        }
        for (const item of f.plan.slice(prefix))
          assert.ok(queries.includes(item.sql), item.name);
        assert.ok(queries[0].includes("SERIALIZABLE"));
        assert.ok(queries.some((sql) => sql.includes("pg_advisory_xact_lock")));
        const fresh = await inspectPopulatedUpgrade(
          f.pool,
          f.plan,
          approval,
          f.target,
          now,
        );
        assert.deepEqual(
          (
            await applyPopulatedUpgrade(
              f.pool,
              f.plan,
              approval,
              f.target,
              fresh,
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

test("0105 upgrade: previous ten-entry receipt stops offline, and mixed/unknown/noncanonical feature ledgers remain rejected", async () => {
  const f = await fixture("crlf", 10);
  try {
    const receipt = await inspectPopulatedUpgrade(
      f.pool,
      f.plan,
      approval,
      f.target,
      now,
    );
    let connections = 0;
    const offline: PostgresPool = {
      async connect() {
        connections++;
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
            "9bcf3f083d47a1b700e467c60f3b9eff57193491bb1e2929b1c2a4f21ba532d1",
        },
        confirmation,
        now,
      ),
      { code: "UPGRADE_RECEIPT_INVALID_OR_STALE" },
    );
    assert.equal(connections, 0);
    assert.ok(historicalLedgerCompatibility(f.plan, receipt.ledger));
    const wrongFeature = {
      name: feature,
      checksum: createHash("sha256")
        .update(f.plan[10].sql.replaceAll("\n", "\r\n"))
        .digest("hex"),
    };
    for (const ledger of [
      [...receipt.ledger, wrongFeature],
      [...receipt.ledger, { name: feature, checksum: "0".repeat(64) }],
      [
        { ...receipt.ledger[0], checksum: approval.historical[0].checksum },
        ...receipt.ledger.slice(1),
      ],
      [
        ...receipt.ledger,
        { name: "9999_unknown.sql", checksum: "f".repeat(64) },
      ],
      [
        ...receipt.ledger.filter(
          (x) => x.name !== "0104_admin_team_corrections.sql",
        ),
        { name: feature, checksum: f.plan[10].checksum },
      ],
    ])
      assert.equal(historicalLedgerCompatibility(f.plan, ledger), null);
    assert.equal(verifyUpgradePlan(f.plan, approval), digest);
  } finally {
    await f.db.close();
  }
});

test("0105 upgrade: a real incorrect attempt backfill fails postvalidation and rolls tables/functions/ledger back atomically", async () => {
  const f = await fixture("crlf", 9);
  try {
    await f.engine.exec(
      `CREATE FUNCTION synthetic_0105_bad_attempt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.name='0105_terminal_record_deletion.sql' THEN UPDATE submission_attempt_ledger SET attempts=3; END IF; RETURN NEW; END; $$; CREATE TRIGGER synthetic_0105_bad_attempt AFTER INSERT ON portal_schema_migrations FOR EACH ROW EXECUTE FUNCTION synthetic_0105_bad_attempt();`,
    );
    const before = await f.state(),
      functions = await f.functions(),
      receipt = await inspectPopulatedUpgrade(
        f.pool,
        f.plan,
        approval,
        f.target,
        now,
      );
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
      { code: "UPGRADE_ATTEMPT_BACKFILL_MISMATCH" },
    );
    assert.deepEqual(await f.state(), before);
    assert.deepEqual(await f.functions(), functions);
    assert.equal(
      (
        await f.engine.query<{
          deleted: string | null;
          attempts: string | null;
        }>(
          "SELECT to_regclass('public.terminal_record_deletions') deleted,to_regclass('public.submission_attempt_ledger') attempts",
        )
      ).rows[0].deleted,
      null,
    );
  } finally {
    await f.db.close();
  }
});
