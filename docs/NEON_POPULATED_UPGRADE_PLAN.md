# Incremental 0104 upgrade for the populated portal

The owner reports that 0102 and 0103 are already applied. This handoff requires an existing nine-entry ledger and **only `0104_admin_team_corrections.sql` pending**. The new migration replaces three scoped correction guard functions. It changes no existing rows or tables and does not allocate credits or replay historical SQL.

These are owner-run instructions. No hosted database, credential, provider setting or production record was accessed or changed while preparing them. Use the exact reviewed release checkout supplied in the handoff. The matching backend archive will be rebuilt and verified separately; this document does not assert a new archive hash or authorize a deployment.

Never use `PORTAL_SYNTHETIC_DATABASE=1`, `--apply-synthetic`, seed/reset commands, schema replacement, ledger edits or a checksum bypass on the populated target. Keep the existing direct connection, environment file and provider configuration intact. No migration runs at Function startup.

## Verify local source, target and restore checkpoint

Use Node 24 or later and the reviewed dependency lockfile in the repository root. Run `npm ci` there only if dependencies are absent. Do not install packages inside an extracted Linux ARM64 backend archive. Before applying, establish and verify a usable restore checkpoint for the current populated target. An owner-verified provider restore point or restored backup branch is acceptable. Record its exact identifier, target and timestamp privately and verify a separate restored copy. This tool neither creates a backup nor tests a restore. Reconcile post-checkpoint writes before considering recovery.

```powershell
$ErrorActionPreference = 'Stop'
node --version
if ($LASTEXITCODE -ne 0) { throw 'Node is unavailable' }
git status --short
git rev-parse HEAD
# Compare HEAD with the exact reviewed release SHA supplied in the handoff.

# Local source only: no database connection.
node scripts/verify-migration-checkout.mjs --check
if ($LASTEXITCODE -eq 2) {
    node scripts/verify-migration-checkout.mjs --repair-line-endings
    if ($LASTEXITCODE -ne 0) { throw 'Source repair stopped; preserve local edits for review' }
} elseif ($LASTEXITCODE -ne 0) { throw 'Source checkout validation failed' }
node --import tsx neon/scripts/upgrade-populated.ts --plan
if ($LASTEXITCODE -ne 0) { throw 'Source plan validation failed' }

$env:MIGRATION_EXPECTED_HOST = Read-Host 'Exact intended direct database host'
$env:MIGRATION_EXPECTED_DATABASE = Read-Host 'Exact intended database name'
$env:MIGRATION_EXPECTED_ROLE = Read-Host 'Exact intended database role'
if ($env:PORTAL_SYNTHETIC_DATABASE -eq '1') { throw 'Stop: this is a populated target' }
New-Item -ItemType Directory -Force .local | Out-Null
```

The source plan must contain ten entries with digest `9bcf3f083d47a1b700e467c60f3b9eff57193491bb1e2929b1c2a4f21ba532d1`. The checkout helper validates all ten Git HEAD blobs and index entries before repairing exact CRLF/LF representations. It refuses real edits, BOMs, missing/extra SQL and changed approved hashes. It does not edit the index, read an env file or connect to a database. Scoped `.gitattributes` keeps SQL checkouts LF.

Use the existing `DATABASE_URL_UNPOOLED` in the private `.env.backend.local` or local environment. Node's `--env-file` does not replace an already-set variable; resolve any conflicting value privately. Never paste the URL, password, backup or private receipt into a ticket, screenshot or commit. The CLI checks expected direct URL identity and connected `current_database()`/`current_user`, rejects pooled hostnames and target overrides, and preserves existing TLS requirements. No new credential or provider setting is required.

The seven historical LF hashes and whole-history Windows CRLF compatibility remain unchanged. Recorded historical hashes are never rewritten. Features 0102, 0103 and 0104 require canonical LF hashes, with no CRLF ledger aliases. Old nine-entry receipts with digest `498280b69647485b4f55c35331a0f8af486983d819ee2dc25fb1840f1e657506` remain historical records and cannot authorize this new plan. Save fresh receipts under new filenames.

## Fresh inspect, pending-only apply, inspect again

Use an exclusive migration window without concurrent release/admin mutations. Inspection uses a read-only repeatable-read transaction and an exclusive new `.local/*.json` file. Receipts contain ledger hashes and table counts, without participant rows, credit values or connection URLs.

```powershell
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$beforeReceipt = '.local/pre-0104-' + $stamp + '.json'
node --env-file=.env.backend.local --import tsx neon/scripts/upgrade-populated.ts --inspect-populated --receipt $beforeReceipt
if ($LASTEXITCODE -ne 0) { throw 'Inspection stopped. Do not apply' }
$before = Get-Content -Raw -LiteralPath $beforeReceipt | ConvertFrom-Json
if ($before.planDigest -ne '9bcf3f083d47a1b700e467c60f3b9eff57193491bb1e2929b1c2a4f21ba532d1' -or
    @($before.ledger).Count -ne 9 -or @($before.pending).Count -ne 1 -or
    $before.pending[0] -ne '0104_admin_team_corrections.sql') {
    throw 'Expected the existing nine-entry ledger and only 0104 pending. Preserve this receipt for review'
}
if ($before.historicalEncoding -notin @('canonical-lf', 'legacy-windows-crlf')) {
    throw 'Unexpected historical ledger encoding'
}

$backupCheckpoint = Read-Host 'Identifier of the current backup/restore checkpoint you actually verified'
node --env-file=.env.backend.local --import tsx neon/scripts/upgrade-populated.ts --apply-populated --receipt $beforeReceipt --backup-checkpoint $backupCheckpoint --confirm-restore-verified
if ($LASTEXITCODE -ne 0) { throw 'Upgrade not confirmed. Inspect the actual ledger before deciding on a retry' }

$afterReceipt = '.local/post-0104-' + $stamp + '.json'
node --env-file=.env.backend.local --import tsx neon/scripts/upgrade-populated.ts --inspect-populated --receipt $afterReceipt
if ($LASTEXITCODE -ne 0) { throw 'Post-upgrade inspection failed. Stop rollout' }
$after = Get-Content -Raw -LiteralPath $afterReceipt | ConvertFrom-Json
if ($after.planDigest -ne $before.planDigest -or @($after.ledger).Count -ne 10 -or @($after.pending).Count -ne 0) {
    throw 'Expected ten ledger entries with no pending work'
}
$priorAfter = @($after.ledger | Where-Object { $_.name -ne '0104_admin_team_corrections.sql' })
if ((ConvertTo-Json -InputObject @($before.ledger) -Depth 4 -Compress) -ne
    (ConvertTo-Json -InputObject $priorAfter -Depth 4 -Compress)) {
    throw 'Existing ledger rows changed. Stop rollout and retain both private receipts'
}
$newEntry = @($after.ledger | Where-Object { $_.name -eq '0104_admin_team_corrections.sql' })
if ($newEntry.Count -ne 1 -or $newEntry[0].checksum -ne 'a931aeafba01be07f43e35fc7c17cae80f11bbd212fbd92f0e5fd8d475c40500') {
    throw 'The new LF migration hash does not match the reviewed source'
}
```

Do not edit or reuse an old receipt. Apply checks its age, source plan, target, actual ledger and pre-upgrade counts inside the same `SERIALIZABLE` transaction and advisory lock `(742019, 1)`, before DDL. Lock wait is bounded to 15 seconds and each statement to 120 seconds. It requires the exact pending set from the fresh receipt and unchanged existing table counts afterward. A fresh post-upgrade receipt permits a repeat with `applied: []`.

`ownerBackupRestoreAcknowledged` records the owner's explicit attestation, not automatic backup verification. A connection/COMMIT failure can have an uncertain outcome; inspect the actual ledger before considering any retry. There is no automatic down migration or restore. Do not drop tables/functions or rewrite checksums as an improvised rollback.

## Immutable source and local proof

| Migration                       | Canonical LF SHA256                                                |
| ------------------------------- | ------------------------------------------------------------------ |
| 0102_credit_stock.sql           | `74bf8549edbecb753424a86e692844e962be02c0faeddda8f0b2dd3ffaacb72e` |
| 0103_project_media_limits.sql   | `3f42da160787977b7655fe74647655bd656f4c55467c2a42b3dd1627859f462c` |
| 0104_admin_team_corrections.sql | `a931aeafba01be07f43e35fc7c17cae80f11bbd212fbd92f0e5fd8d475c40500` |

Historical 0000..0103 SQL, recorded hashes, baseline-manifest history and prior proof receipts remain unchanged. Approval metadata appends only the new feature entry. The separate current proof is saved in `evidence/admin-team-upgrade/`; older nine-entry proofs remain historical evidence.

The local tests use populated disposable PGlite databases with both historical encodings, existing teams/locks/submissions, stock and an assigned credit. They compare all prior rows and all nine old ledger entries, verify only 0104 executes, and exercise stale/invalid state and transactional function-definition rollback. This does not establish native multi-connection PostgreSQL behavior, verify a backup or claim hosted execution. After schema checks succeed, use the matching freshly verified backend artifact and the owner's deployment instructions. No archive hash is updated or deployment performed by this tooling change.
