# Windows rollout for the populated portal database

These are owner-run instructions for a future approved release. No hosted database was inspected or changed here. The user separately authorized the review-branch push. That does not authorize hosted SQL, backend deployment or publishing main. Wait for the owner's deployment go-ahead and verified backup before those operations.

The hosted branch already contains participants, teams, submissions and credit inventory. **Never use `PORTAL_SYNTHETIC_DATABASE=1`, `--apply-synthetic`, seed/reset commands or schema replacement on it.** Keep `.env.backend.local`, existing credentials, the default branch and linked provider project intact. No migration runs at Function startup.

## Required order

1. After fresh approval, publish/fetch the reviewed feature branch and matching backend ZIP, while leaving main unchanged. Verify the exact source SHA and archive SHA below. The main-only deployment filter prevents a feature-branch push from deploying the frontend.
2. Privately verify the exact direct database host, database and role. Establish an actual backup/restore checkpoint and verify that a separate restored copy is usable.
3. In an exclusive migration window, inspect the hosted ledger with the new read-only command. Require the seven historical entries and only the two pending feature entries listed below.
4. Run the guarded pending-only upgrade, then inspect again. Stop on any mismatch or uncertain outcome.
5. Deploy the reviewed backend ZIP using the separate [Windows backend handoff](DESIGN_RELEASE_WINDOWS_DEPLOY.md), retaining existing deployed environment variables. Confirm backend health and compatibility.
6. Only after backend/schema success and fresh go-ahead, merge/push the frontend. A push to main can trigger Vercel deployment.

The new frontend is not safe to publish ahead of this order. The previous backend lacks owner-access, quick check-in and stock commands, and rejects the new media policy. The new backend needs the stock tables added by 0102. An old schema can make personal credit reads fail.

## Local prerequisites and target verification

Use Node 24 or later and the reviewed dependency lockfile. Start in the repository root in PowerShell. Do not run `npm install` inside the extracted Linux ARM64 backend directory.

```powershell
$ErrorActionPreference = 'Stop'
node --version
if ($LASTEXITCODE -ne 0) { throw 'Node is unavailable' }
git status --short
git rev-parse HEAD
# Compare HEAD privately with the exact release SHA supplied in the handoff.
# If dependencies are absent, run npm ci in THIS repository root.

# This command reads local migration files only. It makes no DB connection.
node --import tsx neon/scripts/upgrade-populated.ts --plan
if ($LASTEXITCODE -ne 0) { throw 'Source plan validation failed' }

# Enter facts from the intended DIRECT connection, not a pooled hostname.
$env:MIGRATION_EXPECTED_HOST = Read-Host 'Exact direct database host'
$env:MIGRATION_EXPECTED_DATABASE = Read-Host 'Exact database name'
$env:MIGRATION_EXPECTED_ROLE = Read-Host 'Exact database role'
if ($env:PORTAL_SYNTHETIC_DATABASE -eq '1') {
    throw 'Stop: this is a populated target, not a synthetic database'
}
New-Item -ItemType Directory -Force .local | Out-Null
```

`DATABASE_URL_UNPOOLED` must already be in the private `.env.backend.local`, or in the local environment with the intended value. Node's `--env-file` does not replace an already-set environment variable. Privately resolve any disagreement before continuing. Never paste the URL, password, backup or private receipt into a ticket, screenshot or commit. The CLI verifies URL host/database/role and the connected `current_database()`/`current_user`; URL identity overrides and pooled hostnames are rejected.

## Windows source-plan line endings

If `--plan` stops with `UPGRADE_SOURCE_PLAN_MISMATCH`, inspect local source before any database operation. A Windows checkout can show `i/lf w/crlf` for the nine SQL files because older commits had no line-ending attributes. JSON manifest CRLF is harmless; do not edit checksums or the ledger.

After pulling the current review branch, these commands repair only a CRLF/LF representation that exactly matches every approved Git HEAD blob. The helper validates all nine files and the Git index first, refuses real edits/BOM/missing or extra migrations, never reads an env file and never connects to a database:

```powershell
node scripts/verify-migration-checkout.mjs --repair-line-endings
if ($LASTEXITCODE -ne 0) { throw 'Source repair stopped; preserve changes for review' }
node --import tsx neon/scripts/upgrade-populated.ts --plan
if ($LASTEXITCODE -ne 0) { throw 'Source plan is still invalid; do not inspect or apply' }
```

The approved plan digest remains `498280b69647485b4f55c35331a0f8af486983d819ee2dc25fb1840f1e657506`. The read-only `node scripts/verify-migration-checkout.mjs --check` returns2 when line-ending repair is needed. The migration checksum verifier itself is unchanged. The scoped `.gitattributes` keeps future SQL checkouts LF without changing global Git settings. Continue with the backup/restore and guarded inspection steps only after the source plan succeeds.

## Backup and restore checkpoint

An already verified provider restore point or backup branch is acceptable. Record its exact identifier, target and timestamp privately, and verify a separate restored copy before acknowledging it. This tool does not create a provider backup or verify a restore. Do not repoint the live app to the copy.

If using a local PostgreSQL custom-format backup instead, install compatible `pg_dump` and `pg_restore` clients first. The following owner-run command passes the existing password through process environment, never through command arguments. Use the SSL settings already required by the reviewed direct URL; do not weaken them. The dump contains private participant data and credit material, so retain it only in the owner's secured local backup location.

```powershell
pg_dump --version
if ($LASTEXITCODE -ne 0) { throw 'A compatible PostgreSQL client is required' }
$backupStamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupPath = Join-Path (Resolve-Path .local) ('portal-before-' + $backupStamp + '.dump')
if (Test-Path -LiteralPath $backupPath) { throw 'Refusing to overwrite a backup' }
$env:PGHOST = $env:MIGRATION_EXPECTED_HOST
$env:PGDATABASE = $env:MIGRATION_EXPECTED_DATABASE
$env:PGUSER = $env:MIGRATION_EXPECTED_ROLE
$env:PGPORT = Read-Host 'Direct connection port, normally 5432'
$env:PGSSLMODE = Read-Host 'Existing direct URL sslmode'
if ($env:PGSSLMODE -notin @('require', 'verify-ca', 'verify-full')) {
    throw 'Stop and review the existing TLS configuration'
}
# Set PGCHANNELBINDING=require here only if it is required by your existing URL.
$previousPgPassword = $env:PGPASSWORD
$privatePassword = Read-Host 'Existing direct database password' -AsSecureString
try {
    $env:PGPASSWORD = [System.Net.NetworkCredential]::new('', $privatePassword).Password
    pg_dump --format=custom --no-password --file=$backupPath
    if ($LASTEXITCODE -ne 0) { throw 'Backup failed. Do not upgrade' }
    pg_restore --list $backupPath | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Backup archive inspection failed' }
    Get-FileHash -Algorithm SHA256 -LiteralPath $backupPath
} finally {
    $env:PGPASSWORD = $previousPgPassword
    $privatePassword = $null
}
```

`pg_restore --list` checks archive readability; it is not a restore test. Restore into a separate, explicitly verified disposable target using your reviewed provider/PostgreSQL process, then verify the historical ledger and populated records there. Do not run `pg_restore` against the live populated branch. Keep the verified restore identifier and any post-checkpoint writes with the private release record. A backup/restore delay can make rollout longer than an estimate.

## Inspect, apply pending entries, inspect again

Pause concurrent release/admin mutations for this window. The inspection is a read-only repeatable-read transaction. It saves names/checksums and table counts in an exclusive new `.local/*.json` file; it prints no connection URL, participant rows or voucher codes. It requires all seven historical name/checksum pairs, rejects unknown/mismatched entries, and accepts 0102/0103 only in order.

```powershell
$upgradeStamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$beforeReceipt = '.local/pre-upgrade-' + $upgradeStamp + '.json'
node --env-file=.env.backend.local --import tsx neon/scripts/upgrade-populated.ts --inspect-populated --receipt $beforeReceipt
if ($LASTEXITCODE -ne 0) { throw 'Inspection stopped. No upgrade is authorized' }

# Privately review this receipt. For an untouched baseline, pending must be
# 0102_credit_stock.sql and 0103_project_media_limits.sql, in that order.
Get-Content -Raw -LiteralPath $beforeReceipt
$backupCheckpoint = Read-Host 'Identifier of the backup/restore checkpoint you verified'
# Run the next command ONLY after actually verifying that separate restore.
node --env-file=.env.backend.local --import tsx neon/scripts/upgrade-populated.ts --apply-populated --receipt $beforeReceipt --backup-checkpoint $backupCheckpoint --confirm-restore-verified
if ($LASTEXITCODE -ne 0) {
    throw 'Upgrade not confirmed. Inspect the ledger before deciding on any retry'
}

$afterReceipt = '.local/post-upgrade-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.json'
node --env-file=.env.backend.local --import tsx neon/scripts/upgrade-populated.ts --inspect-populated --receipt $afterReceipt
if ($LASTEXITCODE -ne 0) { throw 'Post-upgrade inspection failed. Do not publish' }
Get-Content -Raw -LiteralPath $afterReceipt
# Require nine correct ledger entries and pending: []. Retain both receipts privately.
```

The apply command rechecks source, actual identity, ledger, pending names and existing table counts inside the same `SERIALIZABLE` transaction and advisory lock `(742019, 1)`, before any DDL. Its 24-hour receipt must match the current state. Changed counts/ledger or an unexpected target stop the transaction. Lock wait is bounded to 15 seconds and each statement to 120 seconds. Postchecks require unchanged existing table counts, the complete ledger, and matching new category/history backfill counts. The two migrations make no credit assignments and do not import data.

The success field `ownerBackupRestoreAcknowledged` records the owner's explicit attestation; it does not claim the tool tested the backup. Counts are preservation checks, not proof that every row value remained equal. Independent populated-fixture tests also compare actual records. No real SQL/detail, URL, code or checkpoint text is printed on errors.

A repeat after a completed upgrade requires a fresh inspection receipt and returns `applied: []`. Do not blindly repeat a failed/connection-lost apply: a COMMIT failure can have an uncertain outcome. Inspect the actual ledger first.

## Fixed source plan and collision handling

Historical `0000`..`0004`, `0100_auth.sql` and `0101_approved_evaluation.sql` retain their published SQL bytes and checksums. Only these new feature entries may be missing:

| Migration | SHA256 | Purpose |
| --- | --- | --- |
| `0102_credit_stock.sql` | `74bf8549edbecb753424a86e692844e962be02c0faeddda8f0b2dd3ffaacb72e` | Add category keys, immutable stock history and import invariants |
| `0103_project_media_limits.sql` | `3f42da160787977b7655fe74647655bd656f4c55467c2a42b3dd1627859f462c` | Widen source/canonical image byte and saved-dimension checks |

The initial Windows deployment used CRLF SQL files. The runner recognizes either the complete seven-entry canonical LF historical set or the complete, independently derived Windows CRLF set, and reports `historicalEncoding`. Each legacy hash is pinned and re-derived from the exact approved canonical SQL. Mixed, missing, unknown or edited historical sets stop. Feature migrations 0102/0103 always require their canonical LF hashes.

This compatibility does **not** update or replace any existing ledger row, replay a historical migration, edit source SQL or change the canonical plan digest. The strict generic migrator receives the matching historical byte representation only to skip the already-recorded seven entries, while the original canonical source plan, actual ledger, target, receipt, counts and locks are still checked. A read-only inspection must succeed first; use a fresh `.local/pre-upgrade-<timestamp>.json` filename if an earlier failed inspection reserved an empty file.

The exact nine-entry plan digest is `498280b69647485b4f55c35331a0f8af486983d819ee2dc25fb1840f1e657506`. Source expectations are in `evidence/neon-host-archive/historical-ledger-checksums.json`; they are not a claimed hosted observation.

0102 deliberately fails atomically on legacy normalized-category or global-fingerprint collisions. Preserve the checkpoint and review those records privately. Do not automatically merge, delete, relabel, recycle codes, edit the ledger or rewrite applied SQL. Missing historical entries, unknown ledger names or 0103 without 0102 must stop for review.

On any failure, leave the frontend unpublished. There is no automatic down migration or restore. An owner-reviewed restore can discard post-checkpoint changes, so reconcile those changes before choosing a recovery action. Retain the previous backend artifact and environment settings; do not improvise a schema rollback by dropping tables or triggers.

## Backend artifact and limits of verification

The reviewed ZIP is `artifacts/neon/portalapi.zip`, SHA256 `bbd047173fb4e895bd8148d24674548f05dfaea58e184ca57bcc0e183ca60382`, 9,014,656 bytes and 93 files. The SQL sources are separate from that ZIP. Use the [Windows extraction/deploy handoff](DESIGN_RELEASE_WINDOWS_DEPLOY.md) after successful database checks.

The existing six-case [populated upgrade proof](COMBINED_MIGRATION_UPGRADE_INDEPENDENT_REVIEW.md) exercises a populated local seven-entry baseline, exact two-entry append, repeat, preserved auth/profile/team/project/submission/evaluation/inventory/allocation/media records, and atomic collision rollback. The dedicated CLI's independent tests are recorded separately with final release checks. These use disposable single-connection PGlite; native multi-connection PostgreSQL behavior, an actual Windows-hosted upgrade and the hosted ledger remain unverified. No provider setting, hosted migration, role, credit allocation or production record was changed by this work.
