# Analytics and completed-member information: Windows rollout

Verified locally. Publication and deployment are on hold pending fresh user approval.
Use these steps only after approval and publication of this exact reviewed release.

This release changes API/application behavior and adds **no migration**. The SQL
plan remains twelve entries through the prior release's0106. Inspect the intended
populated target first: twelve entries with `pending: []` needs no migration apply;
eleven entries with only0106 pending needs the existing guarded recovery below.

Reviewed bundle source: `72ec164d3056469c239a011984e83ff88f2aacaf`.
ZIP SHA256: `cef0cb28499525c48fbf4825d4a50c988b19337c5b0ff240ed3d0c5719bac6cb`.
The required schema digest is
`73c64b0acbe9df80f9ca6627c0a1d4a3485c83214a6923918c530c1ab2b5d160`.

1. **Use the existing software and checkout.** Open PowerShell on Windows with
   Git, Node24+ with npm, the existing authenticated Neon CLI, and File Explorer.
   The deployment interface was checked with Neon CLI8.11.1; inspect its local help
   below. Use this exact existing folder:
   `D:\Dev\dddhack-portal\dddhack-portal-migration`.
   Keep `.env.backend.local`, `.neon`, `neon.windows.ts`, deployed Function values,
   `APP_ORIGIN`, `NEON_API_ORIGIN` and proxy secrets unchanged. No new key, domain,
   link operation or provider setting is needed. Resolve local tracked edits before
   pulling; preserve them rather than resetting or cleaning the checkout.

2. **Run the single complete PowerShell block below after the release is on main.**
   It initializes every variable used by the workflow. It switches to main and
   pulls fast-forward only, verifies the published receipt/source plan, and performs
   read-only inspection before offering any pending migration action. Enter only
   the independently verified direct host, database and role when asked; never paste
   a URL or password. Existing private connection settings are loaded only by the
   migration CLI. Node `--env-file` preserves already-set environment variables;
   resolve conflicting connection values privately before continuing.

3. **If inspection reports twelve entries and no pending work, apply nothing.**
   The block skips the apply command entirely. This analytics/member-information
   batch does not require a fresh schema migration on that target.

4. **If only prior0106 is pending, use a real recovery checkpoint.** Stop unless
   you have created a current backup/restore checkpoint for this exact populated
   target and independently verified a restored copy. Privately retain its real
   identifier, target and time. Use the provider's existing backup/restore workflow;
   this CLI cannot create a backup or verify a restore. If you have no verified
   checkpoint, press Enter at the recovery question to stop, perform that work, then
   rerun the complete block for a fresh inspection. The confirmation flag records
   your attestation; it does not manufacture a backup. Use an exclusive migration
   window and reconcile post-checkpoint writes before considering recovery. An
   unexpected older ledger, unknown hash or other pending set stops for review;
   follow the [existing populated-upgrade guide](NEON_POPULATED_UPGRADE_PLAN.md)
   instead of replaying historical migrations, resetting data or bypassing checks.

5. **Verify the new ZIP with Node's built-in crypto, then extract with Explorer.**
   The block checks the exact new ZIP digest without a checksum cmdlet or a helper.
   In the Explorer window it opens, right-click `portalapi.zip` → **Extract All…**.
   Set the destination to this exact new folder:
   `D:\Dev\dddhack-portal\dddhack-portal-migration\.local\portalapi-cef0cb284995`.
   Use a fresh folder; never merge into an older extracted Function. When extraction
   finishes, that folder must directly contain `index.mjs` and `node_modules`.
   Do not select a nested `portalapi` folder, the ZIP itself or its parent as source.
   Do not install packages inside it: its native dependencies target Linux ARM64.

6. **Deploy the verified directory from the same existing linked repository root.**
   The block pauses for an explicit `DEPLOY`, then uses the literal extracted path
   and `neon functions deploy portalapi --src ... --no-bundle --runtime nodejs24`.
   It supplies no `--env` and does not load/replace an environment file for deployment.
   Existing deployed Function variables carry over. Keep the existing linked target;
   do not run a full-policy deployment or relink the project to work around an error.

7. **Verify in the existing authenticated owner browser.** After deployment succeeds,
   privately retain its deployment identifier. On the working public origin
   `https://dddhack-portal.vercel.app`, check `/api/health`, open Admin → Stats,
   and inspect the completed-team member information as an authorized viewer.
   Check expected access restrictions without sharing participant rows or private
   analytics. Health200 alone does not prove schema state or authenticated behavior.
   If deployment/COMMIT outcome is uncertain, inspect actual state before retrying;
   there is no automatic rollback or restore. A Cloudflare diagnostic denial is not
   permission to bypass it.

```powershell
$ErrorActionPreference = 'Stop'
$repoRoot = 'D:\Dev\dddhack-portal\dddhack-portal-migration'
$bundleSource = '72ec164d3056469c239a011984e83ff88f2aacaf'
$expectedZipSHA256 = 'cef0cb28499525c48fbf4825d4a50c988b19337c5b0ff240ed3d0c5719bac6cb'
$expectedIndexSHA256 = '1f4d9a41c6658bb61dff9f381535df0f069a1fb6efd72ff5e06c99dc6203c98b'
$expectedPlanDigest = '73c64b0acbe9df80f9ca6627c0a1d4a3485c83214a6923918c530c1ab2b5d160'
$archivePath = 'D:\Dev\dddhack-portal\dddhack-portal-migration\artifacts\neon\portalapi.zip'
$extractRoot = 'D:\Dev\dddhack-portal\dddhack-portal-migration\.local\portalapi-cef0cb284995'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmssfff'
$beforeReceipt = '.local/analytics-member-before-' + $stamp + '.json'
$applyReceipt = '.local/analytics-member-pre-apply-' + $stamp + '.json'
$afterReceipt = '.local/analytics-member-after-' + $stamp + '.json'
$nodeMajor = 0
$releaseReceipt = $null
$sourcePlan = $null
$before = $null
$fresh = $null
$after = $null
$restoreAnswer = ''
$backupCheckpoint = ''
$extractAnswer = ''
$deployAnswer = ''

# 1. Existing location and software; preserve local/private settings.
Set-Location 'D:\Dev\dddhack-portal\dddhack-portal-migration'
node --version
if ($LASTEXITCODE -ne 0) { throw 'Install/use Node24+ before continuing' }
$nodeMajor = [int](node -p 'process.versions.node.split(".")[0]')
if ($LASTEXITCODE -ne 0 -or $nodeMajor -lt 24) { throw 'Node24+ is required' }
git --version
if ($LASTEXITCODE -ne 0) { throw 'Git is unavailable' }
neon --version
if ($LASTEXITCODE -ne 0) { throw 'Existing authenticated Neon CLI is unavailable' }
neon functions deploy --help
if ($LASTEXITCODE -ne 0) { throw 'Check the existing CLI deployment interface' }

# 2. Pull the published source without discarding tracked edits.
git diff --quiet
if ($LASTEXITCODE -ne 0) { throw 'Preserve/review local tracked edits before pulling' }
git diff --cached --quiet
if ($LASTEXITCODE -ne 0) { throw 'Preserve/review staged edits before pulling' }
git switch main
if ($LASTEXITCODE -ne 0) { throw 'Could not select main; do not reset or clean files' }
git pull --ff-only origin main
if ($LASTEXITCODE -ne 0) { throw 'Fast-forward pull failed; preserve local files' }
git rev-parse HEAD
if ($LASTEXITCODE -ne 0) { throw 'Cannot identify the pulled checkout' }
$releaseReceipt = Get-Content -Raw -LiteralPath '.\artifacts\neon\receipt.json' | ConvertFrom-Json
if ($releaseReceipt.runtimeSource -ne $bundleSource -or $releaseReceipt.sha256 -ne $expectedZipSHA256 -or $releaseReceipt.canonicalPlanDigest -ne $expectedPlanDigest) {
    throw 'This checkout does not contain the reviewed new release archive'
}
if (-not (Test-Path -LiteralPath '.\node_modules\tsx')) {
    npm ci
    if ($LASTEXITCODE -ne 0) { throw 'Reviewed dependencies could not be installed' }
}
node scripts/verify-migration-checkout.mjs --check
if ($LASTEXITCODE -eq 2) {
    node scripts/verify-migration-checkout.mjs --repair-line-endings
    if ($LASTEXITCODE -ne 0) { throw 'SQL line-ending repair stopped; preserve edits' }
} elseif ($LASTEXITCODE -ne 0) { throw 'Source checkout validation failed' }
$sourcePlan = (node --import tsx neon/scripts/upgrade-populated.ts --plan | Out-String) | ConvertFrom-Json
if ($LASTEXITCODE -ne 0 -or $sourcePlan.planDigest -ne $expectedPlanDigest -or @($sourcePlan.migrations).Count -ne 12) {
    throw 'Expected the unchanged reviewed twelve-entry source plan'
}

# 3. Independent private target guards; first database action is read-only inspect.
$env:MIGRATION_EXPECTED_HOST = Read-Host 'Exact intended DIRECT database host only'
$env:MIGRATION_EXPECTED_DATABASE = Read-Host 'Exact intended database name only'
$env:MIGRATION_EXPECTED_ROLE = Read-Host 'Exact intended database role only'
if ($env:PORTAL_SYNTHETIC_DATABASE -eq '1') { throw 'Stop: this is a populated target' }
node --env-file=.env.backend.local --import tsx neon/scripts/upgrade-populated.ts --inspect-populated --receipt $beforeReceipt
if ($LASTEXITCODE -ne 0) { throw 'Read-only inspection failed; do not apply or deploy' }
$before = Get-Content -Raw -LiteralPath $beforeReceipt | ConvertFrom-Json
if ($before.planDigest -ne $expectedPlanDigest -or $before.historicalEncoding -notin @('canonical-lf','legacy-windows-crlf')) {
    throw 'Unexpected source plan or historical encoding; preserve receipt'
}

# 4. Already complete: skip apply. Only old0106 pending: real restore checkpoint first.
if (@($before.ledger).Count -eq 12 -and @($before.pending).Count -eq 0) {
    $after = $before
    Write-Host 'Schema already complete: no migration apply is needed.'
} elseif (@($before.ledger).Count -eq 11 -and @($before.pending).Count -eq 1 -and $before.pending[0] -eq '0106_admin_team_unlock.sql') {
    $restoreAnswer = Read-Host 'Only after independently verifying a CURRENT real restore checkpoint for this target, type VERIFIED; otherwise Enter stops'
    if ($restoreAnswer -cne 'VERIFIED') { throw 'Stop. Establish and verify a real restore checkpoint, then rerun for a fresh inspect' }
    $backupCheckpoint = Read-Host 'Exact identifier of that actual verified checkpoint (kept private)'
    if ([string]::IsNullOrWhiteSpace($backupCheckpoint)) { throw 'A real checkpoint identifier is required' }
    node --env-file=.env.backend.local --import tsx neon/scripts/upgrade-populated.ts --inspect-populated --receipt $applyReceipt
    if ($LASTEXITCODE -ne 0) { throw 'Fresh pre-apply inspection failed; stop' }
    $fresh = Get-Content -Raw -LiteralPath $applyReceipt | ConvertFrom-Json
    if ($fresh.planDigest -ne $expectedPlanDigest -or @($fresh.ledger).Count -ne 11 -or @($fresh.pending).Count -ne 1 -or $fresh.pending[0] -ne '0106_admin_team_unlock.sql') {
        throw 'Pending state changed; preserve receipts and inspect before any decision'
    }
    node --env-file=.env.backend.local --import tsx neon/scripts/upgrade-populated.ts --apply-populated --receipt $applyReceipt --backup-checkpoint $backupCheckpoint --confirm-restore-verified
    if ($LASTEXITCODE -ne 0) { throw 'Apply outcome is unconfirmed. Do not retry blindly; rerun read-only inspect with a fresh receipt' }
    node --env-file=.env.backend.local --import tsx neon/scripts/upgrade-populated.ts --inspect-populated --receipt $afterReceipt
    if ($LASTEXITCODE -ne 0) { throw 'Post-apply inspection failed; stop deployment' }
    $after = Get-Content -Raw -LiteralPath $afterReceipt | ConvertFrom-Json
} else { throw 'Unexpected ledger/pending set. Preserve receipt and use the populated-upgrade guide; do not deploy' }
if ($after.planDigest -ne $expectedPlanDigest -or @($after.ledger).Count -ne 12 -or @($after.pending).Count -ne 0) {
    throw 'Schema prerequisite not confirmed: expected twelve entries and no pending work'
}

# 5. Direct Node checksum verification; no checksum cmdlet or staging helper.
@'
const fs = require('node:fs');
const crypto = require('node:crypto');
const [archive, expected] = process.argv.slice(2);
const actual = crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex');
if (actual !== expected) throw new Error('ZIP SHA256 mismatch: nothing should be extracted or deployed');
console.log('New ZIP SHA256 verified: ' + actual);
'@ | node - $archivePath $expectedZipSHA256
if ($LASTEXITCODE -ne 0) { throw 'New archive checksum verification failed' }
if (Test-Path -LiteralPath $extractRoot) { throw 'Extraction destination already exists. Do not overlay it; preserve/review the prior attempt before using a fresh directory' }
explorer.exe 'D:\Dev\dddhack-portal\dddhack-portal-migration\artifacts\neon'
Write-Host 'Right-click portalapi.zip > Extract All. Destination: D:\Dev\dddhack-portal\dddhack-portal-migration\.local\portalapi-cef0cb284995'
$extractAnswer = Read-Host 'After Explorer extraction is fully complete, type EXTRACTED'
if ($extractAnswer -cne 'EXTRACTED') { throw 'Extraction not confirmed; stop' }

# 6. The deploy source must directly contain the exact entry and packaged dependencies.
@'
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const [root, expected] = process.argv.slice(2);
const index = path.join(root, 'index.mjs');
if (crypto.createHash('sha256').update(fs.readFileSync(index)).digest('hex') !== expected) throw new Error('Wrong extracted index.mjs');
for (const name of ['node_modules/sharp/package.json', 'node_modules/@img/sharp-linux-arm64/lib/sharp-linux-arm64-0.35.5.node', 'node_modules/@img/sharp-libvips-linux-arm64/lib/libvips-cpp.so.8.18.7']) {
  const bytes = fs.readFileSync(path.join(root, name));
  if (name.endsWith('.node') || name.includes('.so.')) {
    if (bytes.subarray(0,4).toString('hex') !== '7f454c46' || bytes.readUInt16LE(18) !== 183) throw new Error('Expected ARM64 native header');
  }
}
console.log('Exact entry/root layout and ARM64 file headers verified; ARM64 code was not executed.');
'@ | node - $extractRoot $expectedIndexSHA256
if ($LASTEXITCODE -ne 0) { throw 'Extracted root layout/bytes are wrong; do not deploy' }

# 7. Separate owner-operated deployment, same existing linked root, existing env preserved.
Set-Location 'D:\Dev\dddhack-portal\dddhack-portal-migration'
$deployAnswer = Read-Host 'Schema and exact extracted bytes are verified. Type DEPLOY to deploy to the existing linked target'
if ($deployAnswer -cne 'DEPLOY') { throw 'Deployment not requested' }
neon functions deploy portalapi --src .\.local\portalapi-cef0cb284995 --no-bundle --runtime nodejs24
if ($LASTEXITCODE -ne 0) { throw 'Deployment outcome not confirmed; inspect actual state before retrying' }
```

Local packaging verified the official ARM64 archive, byte-identical fresh JavaScript,
static native headers and blocked-outbound host routing. Six legacy helper checks
ran under PowerShell7.6.8 on Linux; they are compatibility evidence for those copied
helpers, **not native Windows acceptance** and not a requirement for this guide.
The Node snippets were checked separately. No agent ran the hosted inspection,
migration, deployment or authenticated production verification described above.
