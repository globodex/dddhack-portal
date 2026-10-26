import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { batch } from "../lib/db";
import { applyPortalMigrations } from "../neon/db/migrate";
import type { PostgresPool } from "../neon/db/adapter";
import {
  inspectPopulatedUpgrade,
  applyPopulatedUpgrade,
  verifyUpgradePlan,
  type UpgradeBaseline,
  type UpgradeTarget,
} from "../neon/db/populated-upgrade";
import { historicalLedgerCompatibility } from "../neon/db/historical-ledger-compatibility";
import { legacyLedgerIndependentFixture } from "./legacy-ledger-independent-fixture";

const approval: UpgradeBaseline = JSON.parse(
  readFileSync(
    new URL(
      "../evidence/neon-host-archive/historical-ledger-checksums.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const digest =
  "2dc505efb7e5cf25f4e9da1a56e9aa9cb4a816735b222127b9fdfdb5daafa277";
const feature = "0106_admin_team_unlock.sql";
const now = new Date("2026-10-25T18:00:00.000Z");
const confirmation = {
  backupCheckpoint: "synthetic-unlock-verified-restore",
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
async function fixture(encoding: "lf" | "crlf", prefix: 9 | 11) {
  const f = await legacyLedgerIndependentFixture(encoding);
  await applyPortalMigrations(f.pool, f.plan.slice(7, prefix));
  await batch(f.db, [
    [
      "INSERT INTO team_locks VALUES('fake_team3','fake_bob','2026-10-22T08:00:00.000Z')",
    ],
    [
      "INSERT INTO check_ins VALUES('fake_bob','fake_admin','2026-10-22T08:00:00.000Z')",
    ],
    [
      "INSERT INTO projects(id,team_id,slug,draft,revision,updated_at) VALUES('synthetic-unlock-upgrade-draft','fake_team3','synthetic-unlock-upgrade-draft','{\"private\":\"synthetic\"}',1,'2026-10-22T08:00:00.000Z')",
    ],
  ]);
  const target: UpgradeTarget = {
    host: "synthetic-unlock.invalid",
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
  async function functions() {
    return (
      await f.engine.query(
        "SELECT proname,pg_get_functiondef(oid) definition FROM pg_proc WHERE pronamespace='public'::regnamespace AND prokind='f' ORDER BY proname,oid",
      )
    ).rows;
  }
  return { ...f, target, state, functions };
}

for (const encoding of ["lf", "crlf"] as const)
  for (const prefix of [9, 11] as const)
    test(`0106 upgrade ${encoding}: populated${prefix}→13 applies the exact pending suffix, preserves all old data/ledger/locks, then repeats[]`, async () => {
      const f = await fixture(encoding, prefix);
      try {
        const before = await f.state(),
          inspectQueries: string[] = [];
        const receipt = await inspectPopulatedUpgrade(
          traced(f.pool, inspectQueries),
          f.plan,
          approval,
          f.target,
          now,
        );
        assert.deepEqual(await f.state(), before);
        assert.ok(
          !inspectQueries.some((sql) =>
            /^\s*(CREATE|ALTER|INSERT|UPDATE|DELETE|DROP)\b/i.test(sql),
          ),
        );
        const pending =
          prefix === 11
            ? [feature, "0107_admin_team_lock.sql"]
            : [
                "0104_admin_team_corrections.sql",
                "0105_terminal_record_deletion.sql",
                feature,
                "0107_admin_team_lock.sql",
              ];
        assert.deepEqual(receipt.pending, pending);
        assert.equal(receipt.planDigest, digest);
        assert.equal(
          receipt.historicalEncoding,
          encoding === "lf" ? "canonical-lf" : "legacy-windows-crlf",
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
        assert.equal(after.portal_schema_migrations.length, 13);
        for (const [table, data] of Object.entries(before))
          if (table !== "portal_schema_migrations")
            assert.deepEqual(after[table], data, table);
        assert.deepEqual(
          after.portal_schema_migrations.filter(
            (row) => !pending.includes(JSON.parse(row).name),
          ),
          before.portal_schema_migrations,
        );
        assert.deepEqual(after.terminal_record_deletions, []);
        assert.deepEqual(
          after.submission_attempt_ledger.map((row) => JSON.parse(row)),
          [{ team_id: "fake_team1", attempts: 1 }],
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

test("0106 upgrade: an eleven-entry receipt cannot authorize this plan; gaps, unknown entries and feature CRLF remain rejected", async () => {
  const f = await fixture("crlf", 11);
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
        throw Error("MUST_NOT_CONNECT");
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
            "e3b7a348e2c9e3f4f066a78fbd02274a0e111155b3af527f99bdc545bbe32691",
        },
        confirmation,
        now,
      ),
      { code: "UPGRADE_RECEIPT_INVALID_OR_STALE" },
    );
    assert.equal(connections, 0);
    const migration = f.plan.at(-1)!;
    for (const ledger of [
      [
        ...receipt.ledger,
        {
          name: feature,
          checksum: createHash("sha256")
            .update(migration.sql.replaceAll("\n", "\r\n"))
            .digest("hex"),
        },
      ],
      [
        ...receipt.ledger.filter(
          (entry) => entry.name !== "0105_terminal_record_deletion.sql",
        ),
        { name: feature, checksum: migration.checksum },
      ],
      [
        ...receipt.ledger,
        { name: "9999_unknown.sql", checksum: "f".repeat(64) },
      ],
    ])
      assert.equal(historicalLedgerCompatibility(f.plan, ledger), null);
    assert.equal(verifyUpgradePlan(f.plan, approval), digest);
  } finally {
    await f.db.close();
  }
});

test("0106 upgrade: DDL failure rolls the replacement lock guard and ledger back atomically without changing old rows", async () => {
  const f = await fixture("lf", 11);
  try {
    const before = await f.state(),
      functions = await f.functions();
    const migration = f.plan.at(-1)!;
    const sql =
      migration.sql + "; SELECT * FROM synthetic_missing_unlock_upgrade_table;";
    await assert.rejects(
      applyPortalMigrations(f.pool, [
        {
          ...migration,
          sql,
          checksum: createHash("sha256").update(sql).digest("hex"),
        },
      ]),
      /synthetic_missing_unlock_upgrade_table/,
    );
    assert.deepEqual(await f.state(), before);
    assert.deepEqual(await f.functions(), functions);
    await assert.rejects(
      batch(f.db, [
        [
          "INSERT INTO write_guards VALUES(?,1)",
          'admin-team-unlock:["fake_team3","2026-10-22T08:00:00.000Z"]',
        ],
        ["DELETE FROM team_locks WHERE team_id='fake_team3'"],
      ]),
      /IMMUTABLE/,
    );
    assert.deepEqual(await f.state(), before);
  } finally {
    await f.db.close();
  }
});
