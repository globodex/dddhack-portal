# Incremental 0106 upgrade for the populated portal

A fresh inspection decides the exact pending suffix. An eleven-entry target requires only `0106_admin_team_unlock.sql`; an older nine-entry target requires canonical0104+0105+0106. A twelve-entry target needs no apply. Do not infer hosted state from a local checkout or health200.

0106 replaces only the existing lock-delete guard function. It creates no table and changes no rows. An exact admin-unlock token can remove one lock only before results are frozen and before that team has any committed submission version or durable attempt. Removing a lock restores the existing pre-lock behavior for its idea and memberships; capacity, registration, roles and deadlines still apply. The terminal-deletion cascade exception remains scoped and frozen-result protection remains active. Applying this migration does not unlock or delete any team.

Older pending0104 replaces three correction guard functions. Pending0105 adds terminal-deletion markers and backfills the durable attempt ledger. Applying the pending suffix does not delete participants, teams or project payloads and does not allocate credits. Later admin actions are separate explicit application operations.

These are owner-run instructions, not evidence of hosted execution. Keep the existing direct connection, private `.env.backend.local`, target context, deployed environment and roles unchanged. Never use `PORTAL_SYNTHETIC_DATABASE=1`, `--apply-synthetic`, seeds/resets, checksum edits, schema replacement or a bypass on this populated target. No migration runs at Function startup. Use the exact reviewed release checkout and matching separately verified backend archive.

## Verify source, intended target and restore checkpoint

Use Node24+ and the reviewed lockfile. Run `npm ci` at repository root only if dependencies are absent; never install packages inside the extracted Linux ARM64 Function. Before applying, establish a current backup/restore checkpoint for the intended populated database and independently verify a restored copy. Privately retain its identifier, target and timestamp. The tool does not create backups or verify restores; reconcile writes after the checkpoint before recovery.

```powershell
$ErrorActionPreference = 'Stop'
node --version
if ($LASTEXITCODE -ne 0) { throw 'Node is unavailable' }
git status --short
git rev-parse HEAD
# Compare HEAD with the exact reviewed release SHA supplied in the handoff.

# Source/Git only. No database connection.
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

The source plan must contain **twelve entries**, digest `73c64b0acbe9df80f9ca6627c0a1d4a3485c83214a6923918c530c1ab2b5d160`. The checkout helper validates every Git HEAD blob and index entry before repairing exact CRLF/LF representations. It refuses real edits, BOMs, unexpected SQL and changed approved hashes. It does not edit the index, load env files or contact a database. SQL remains LF in the reviewed checkout.

Use the existing `DATABASE_URL_UNPOOLED`. Node `--env-file` does not override already-set variables; resolve conflicts privately. Never print/share the URL, password, backup identifier or private receipts. The CLI checks the exact expected direct URL host/database/role and connected `current_database()`/`current_user`, rejects pooled hosts and target overrides, and preserves TLS requirements. No new credential, role or provider setting is needed.

All seven canonical historical hashes and their exact whole-history Windows CRLF aliases remain unchanged. Features0102–0106 require canonical LF; features never receive CRLF ledger aliases. Previous nine-/ten-/eleven-entry-plan receipts are historical records, including digests `498280b69647485b4f55c35331a0f8af486983d819ee2dc25fb1840f1e657506` and `9bcf3f083d47a1b700e467c60f3b9eff57193491bb1e2929b1c2a4f21ba532d1`. The prior eleven-entry digest is `e3b7a348e2c9e3f4f066a78fbd02274a0e111155b3af527f99bdc545bbe32691`. They cannot authorize this plan. Save fresh receipts under new filenames.

## Inspect, apply only the exact pending set, inspect again

Use an exclusive migration window without concurrent release/admin changes. Inspection is read-only repeatable-read and reserves a new `.local/*.json` file exclusively. Receipts contain hashes/counts, not participant rows, credit values or connection URLs. A receipt is accepted for at most24hours and is rechecked against the actual target/state inside the apply transaction.

```powershell
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$beforeReceipt = '.local/pre-0106-' + $stamp + '.json'
node --env-file=.env.backend.local --import tsx neon/scripts/upgrade-populated.ts --inspect-populated --receipt $beforeReceipt
if ($LASTEXITCODE -ne 0) { throw 'Inspection stopped. Do not apply' }
$before = Get-Content -Raw -LiteralPath $beforeReceipt | ConvertFrom-Json
if ($before.planDigest -ne '73c64b0acbe9df80f9ca6627c0a1d4a3485c83214a6923918c530c1ab2b5d160') {
    throw 'Expected the reviewed twelve-entry source plan'
}
switch (@($before.ledger).Count) {
    9 { $expectedPending = @('0104_admin_team_corrections.sql', '0105_terminal_record_deletion.sql', '0106_admin_team_unlock.sql') }
    10 { $expectedPending = @('0105_terminal_record_deletion.sql', '0106_admin_team_unlock.sql') }
    11 { $expectedPending = @('0106_admin_team_unlock.sql') }
    12 { $expectedPending = @() }
    default { throw 'Expected the independently verified nine- through twelve-entry target. Preserve receipt for review' }
}
if ((ConvertTo-Json -InputObject @($before.pending) -Compress) -ne
    (ConvertTo-Json -InputObject $expectedPending -Compress)) {
    throw 'Unexpected pending set. Do not apply'
}
if ($before.historicalEncoding -notin @('canonical-lf', 'legacy-windows-crlf')) {
    throw 'Unexpected historical ledger encoding'
}

if ($expectedPending.Count -gt 0) {
    $backupCheckpoint = Read-Host 'Identifier of the current backup/restore checkpoint you actually verified'
    node --env-file=.env.backend.local --import tsx neon/scripts/upgrade-populated.ts --apply-populated --receipt $beforeReceipt --backup-checkpoint $backupCheckpoint --confirm-restore-verified
    if ($LASTEXITCODE -ne 0) { throw 'Upgrade not confirmed. Inspect actual ledger before deciding on a retry' }
}

$afterReceipt = '.local/post-0106-' + $stamp + '.json'
node --env-file=.env.backend.local --import tsx neon/scripts/upgrade-populated.ts --inspect-populated --receipt $afterReceipt
if ($LASTEXITCODE -ne 0) { throw 'Post-upgrade inspection failed. Stop rollout' }
$after = Get-Content -Raw -LiteralPath $afterReceipt | ConvertFrom-Json
if ($after.planDigest -ne $before.planDigest -or @($after.ledger).Count -ne 12 -or @($after.pending).Count -ne 0) {
    throw 'Expected twelve ledger entries with no pending work'
}
$priorNames = @($before.ledger | ForEach-Object { $_.name })
$priorAfter = @($after.ledger | Where-Object { $_.name -in $priorNames })
if ((ConvertTo-Json -InputObject @($before.ledger) -Depth 4 -Compress) -ne
    (ConvertTo-Json -InputObject $priorAfter -Depth 4 -Compress)) {
    throw 'Existing ledger names/checksums changed. Stop rollout and retain both private receipts'
}
$requiredFeatures = @{
    '0104_admin_team_corrections.sql' = 'a931aeafba01be07f43e35fc7c17cae80f11bbd212fbd92f0e5fd8d475c40500'
    '0105_terminal_record_deletion.sql' = '088b96a239915cd518765b5ef260c73feee913d8e0b181234110f7591676ccde'
    '0106_admin_team_unlock.sql' = 'dd437230bcbc5d9ffc65b63464992976b7b0ddcd1fd64a675f76f113623c17aa'
}
foreach ($name in $requiredFeatures.Keys) {
    $entry = @($after.ledger | Where-Object { $_.name -eq $name })
    if ($entry.Count -ne 1 -or $entry[0].checksum -ne $requiredFeatures[$name]) {
        throw 'A required feature LF hash does not match the reviewed source'
    }
}
```

Apply uses the same SERIALIZABLE transaction and advisory lock `(742019,1)` for target/receipt/state validation, pending DDL, ledger append and postconditions. Lock wait is bounded to15seconds, each statement to120seconds. Existing table counts must remain unchanged. A new0105 attempt ledger must exactly match each team's prior maximum committed attempt; terminal-deletion markers must be empty. Failure rolls the transaction back. A fresh post-upgrade receipt supports a repeat returning `applied: []`.

`ownerBackupRestoreAcknowledged` is the owner's attestation, not automatic backup verification. A connection/COMMIT failure can leave an uncertain outcome: inspect the actual ledger before a retry. There is no automatic down migration or restore. Do not drop tables/functions or rewrite checksums as an improvised rollback. Existing ledger timestamps remain unchanged by migration SQL; local tests compare them, while the receipt comparison verifies names/checksums only.

## Deliberately selected older target

An unexpected seven-entry receipt does not authorize applying to another branch/database. Independently confirm that target and a fresh verified restore checkpoint first. The CLI retains exact prefix compatibility without replaying or rewriting applied SQL:

| Existing ledger | Exact pending set | Result |
| --- | --- | --- |
| Seven historical entries, all LF or all exact recognized CRLF | 0102,0103,0104,0105,0106 | Twelve entries |
| Same history plus canonical0102 | 0103,0104,0105,0106 | Twelve entries |
| Same history plus canonical0102/0103 | 0104,0105,0106 | Twelve entries |
| Same history plus canonical0102/0103/0104 | 0105,0106 | Twelve entries |
| Same history plus canonical0102/0103/0104/0105 | 0106 | Twelve entries |
| All twelve reviewed entries | None | No apply needed |

For an intentionally selected seven-entry target, use a fresh receipt and replace only the nine-through-twelve-entry pending assertion above with this exact assertion; retain all source/target/backup/apply/post-inspect guards:

```powershell
$expectedPending = @('0102_credit_stock.sql', '0103_project_media_limits.sql', '0104_admin_team_corrections.sql', '0105_terminal_record_deletion.sql', '0106_admin_team_unlock.sql')
if ($before.planDigest -ne '73c64b0acbe9df80f9ca6627c0a1d4a3485c83214a6923918c530c1ab2b5d160' -or
    @($before.ledger).Count -ne 7 -or
    (ConvertTo-Json -InputObject @($before.pending) -Compress) -ne
    (ConvertTo-Json -InputObject $expectedPending -Compress)) {
    throw 'Expected the independently verified seven-entry target and exact0102/0103/0104/0105/0106 pending'
}
if ($before.historicalEncoding -notin @('canonical-lf', 'legacy-windows-crlf')) {
    throw 'Unexpected historical ledger encoding'
}
```

## Immutable source and local verification

| Migration | Canonical LF SHA256 |
| --- | --- |
| 0102_credit_stock.sql | `74bf8549edbecb753424a86e692844e962be02c0faeddda8f0b2dd3ffaacb72e` |
| 0103_project_media_limits.sql | `3f42da160787977b7655fe74647655bd656f4c55467c2a42b3dd1627859f462c` |
| 0104_admin_team_corrections.sql | `a931aeafba01be07f43e35fc7c17cae80f11bbd212fbd92f0e5fd8d475c40500` |
| 0105_terminal_record_deletion.sql | `088b96a239915cd518765b5ef260c73feee913d8e0b181234110f7591676ccde` |
| 0106_admin_team_unlock.sql | `dd437230bcbc5d9ffc65b63464992976b7b0ddcd1fd64a675f76f113623c17aa` |

Historical SQL, existing approval entries, exact seven CRLF aliases and previous proof records remain unchanged. Approval metadata only appends0106 to the eleven previously reviewed entries. [0106 verification](ADMIN_TEAM_UNLOCK_MIGRATION.md) records the current local proof; [0105 verification](TERMINAL_DELETION_UPGRADE_VERIFICATION.md) remains historical evidence. PGlite proves local PostgreSQL trigger/transaction semantics, not native multi-connection concurrency, a verified restore or hosted state. After schema verification, follow the separate owner-run Windows archive/deployment handoff with the matching release artifact. This tooling change updates no archive digest and performs no deployment.
