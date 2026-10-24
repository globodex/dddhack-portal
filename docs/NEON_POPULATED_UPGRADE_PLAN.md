# Owner-operated incremental upgrade for the populated database

This is a manual plan, not a command run by an agent. The hosted database already contains real participants, teams, submissions and credit inventory. No hosted ledger, rows or credentials were read by this packaging lane. Do not seed, reset, recreate the schema or treat that target as synthetic. **Do not set `PORTAL_SYNTHETIC_DATABASE=1` or use `--apply-synthetic` on it.** The existing `neon/scripts/migrate.ts` remains inspect-only by default, with a separate synthetic-only apply guard.

Before any owner-controlled write, establish and record a backup/restore checkpoint for the exact intended target, verify its branch/host/database/role privately, and review the source plan against its checksum ledger. Use an exclusive migration window. The expected seven historical ledger entries and exact checksums are in `evidence/neon-host-archive/historical-ledger-checksums.json`. They are source expectations, not a claimed observation of the hosted ledger. Missing historical entries, unknown ledger names, changed checksums or an unexpected target must stop the upgrade for review.

Only the two new feature migrations may be pending, in this order:

| Migration                       | SHA256                                                             | Purpose                                                        |
| ------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------- |
| `0102_credit_stock.sql`         | `74bf8549edbecb753424a86e692844e962be02c0faeddda8f0b2dd3ffaacb72e` | Add stock category keys, fingerprint/history/import invariants |
| `0103_project_media_limits.sql` | `3f42da160787977b7655fe74647655bd656f4c55467c2a42b3dd1627859f462c` | Widen source/canonical byte and saved-dimension CHECKs         |

These are renamed **new, unapplied** feature files. Their SQL bytes/checksums are unchanged. Historical `0000`..`0004`, `0100_auth.sql` and `0101_approved_evaluation.sql` remain unchanged. The combined source plan is globally sorted, so the new files follow the existing auth/evaluation history. The strict checksum/order validator is retained.

A concrete operator route is a separately reviewed local one-off using the existing `pg.Pool`, `loadMigrationPlan()` and `applyPortalMigrations()` library functions. It must verify the privately recorded target against the actual connection, read `portal_schema_migrations`, require all seven historical name/checksum pairs, reject unknown entries, and accept the new entries only with matching checksums. If `0103` is recorded without `0102`, stop. Run the following library call only after those checks and the backup/restore checkpoint are confirmed:

```ts
// Owner-reviewed local one-off, run only in the exclusive migration window.
// Verification inputs below are local operator inputs, not Function settings.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Pool } from "pg";
import { loadMigrationPlan } from "./neon/migration-plan.ts";
import { applyPortalMigrations } from "./neon/db/migrate.ts";

async function reviewedUpgrade() {
  assert.notEqual(process.env.PORTAL_SYNTHETIC_DATABASE, "1");
  for (const key of [
    "DATABASE_URL_UNPOOLED",
    "MIGRATION_EXPECTED_HOST",
    "MIGRATION_EXPECTED_DATABASE",
    "MIGRATION_EXPECTED_ROLE",
    "MIGRATION_BACKUP_RESTORE_CHECKPOINT",
  ])
    assert.ok(process.env[key], "Missing private operator verification input");
  assert.ok(
    new URL(process.env.DATABASE_URL_UNPOOLED).hostname ===
      process.env.MIGRATION_EXPECTED_HOST,
    "Unexpected target host",
  );

  // Checkpoint must identify an actual verified backup/restore point.
  const approved = JSON.parse(
    readFileSync(
      "evidence/neon-host-archive/historical-ledger-checksums.json",
      "utf8",
    ),
  );
  const plan = await loadMigrationPlan();
  const expected = [
    ...approved.historical,
    ...approved.pendingFeatureMigrations,
  ];
  assert.deepEqual(
    plan.map(({ name, checksum }) => ({ name, checksum })),
    expected,
  );
  const expectedByName = new Map(expected.map((m) => [m.name, m.checksum]));
  const newNames = new Set(
    approved.pendingFeatureMigrations.map((m) => m.name),
  );
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL_UNPOOLED,
    max: 1,
  });
  try {
    const identity = (
      await pool.query("SELECT current_database() database, current_user role")
    ).rows[0];
    assert.ok(
      identity.database === process.env.MIGRATION_EXPECTED_DATABASE &&
        identity.role === process.env.MIGRATION_EXPECTED_ROLE,
      "Unexpected database/role",
    );
    const ledger = (
      await pool.query(
        "SELECT name,checksum FROM portal_schema_migrations ORDER BY name",
      )
    ).rows;
    const recorded = new Map(ledger.map((m) => [m.name, m.checksum]));
    for (const historical of approved.historical)
      assert.ok(
        recorded.get(historical.name) === historical.checksum,
        "Historical ledger missing or checksum mismatch",
      );
    for (const row of ledger)
      assert.ok(
        expectedByName.get(row.name) === row.checksum,
        "Unknown ledger entry or checksum mismatch",
      );
    assert.ok(
      !recorded.has("0103_project_media_limits.sql") ||
        recorded.has("0102_credit_stock.sql"),
      "Unexpected pending migration order",
    );

    // The helper rechecks checksums under its SERIALIZABLE transaction and
    // advisory transaction lock; the exclusive window covers this preflight.
    const applied = await applyPortalMigrations(pool, plan);
    assert.ok(applied.every((name) => newNames.has(name)));
    console.log({ applied }); // Names only; no credentials/codes/row contents.
    // Complete read-only data/ledger validation below before publishing.
  } finally {
    await pool.end();
  }
}
reviewedUpgrade().catch((error) => {
  const code = /^[A-Z0-9_]+$/.test(error?.code || "")
    ? error.code
    : "UPGRADE_STOPPED_FOR_REVIEW";
  console.error({ code }); // Keep raw SQL/DETAIL/credentials out of shared logs.
  process.exitCode = 1;
});
```

This helper revalidates existing checksums and applies only missing migrations inside one `SERIALIZABLE` transaction with advisory transaction lock `(742019, 1)`. It rolls back on an error. This is an operator-reviewed incremental route for a populated target; it is **not** an instruction to bypass or repurpose the synthetic-only CLI. No migration is applied at Function startup.

`0102` intentionally fails atomically if legacy normalized category keys or global credit fingerprints collide. Review collisions privately against the checkpoint; do not automatically delete, merge, relabel or recycle codes. A checksum mismatch must not be resolved by editing the ledger or rewriting applied SQL. Preserve participant/team/project rows, allocations, existing auth history and all existing credentials/provider configuration.

After a successful pending-only upgrade, verify the two ledger checksums and read-only counts/relationships against the checkpoint: participants/teams/projects/submission versions and existing inventory/allocations must be preserved; new stock-history/category associations must match existing inventory. Existing media references and pending/ready/consumed receipts remain valid. Run mutation/concurrency regression checks in a disposable restored clone, not by adding fake records to the populated hosted database. Keep migration outcomes and restore instructions with the owner's private release record before manually publishing the reviewed backend ZIP.

Independent [populated upgrade proof](https://github.com/Param302/dddhack-portal/blob/d195fe89b8d327709ffe11d6e87e6c747d1dd96b/docs/COMBINED_MIGRATION_UPGRADE_INDEPENDENT_REVIEW.md) passes six local cases against integrated source `191b76ed26f430128b14112f77b74ad3e26b1ec0`: the seven-entry historical ledger gains only `0102`/`0103`, populated synthetic records remain equal, repeat is empty, and both legacy collision cases roll back atomically. The proof covers actual persisted synthetic auth/profile/team/project/submission/evaluation/inventory/allocation/media rows. It uses local single-connection PGlite and does not claim a hosted ledger inspection or native multi-connection concurrency result. Root integrated the proof as `4b9a6498087a4cca38d465d90e3643778140b942`.
