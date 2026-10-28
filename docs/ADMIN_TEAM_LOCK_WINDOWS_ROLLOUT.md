# Admin lock, inline members and AND filters: Windows rollout

> Historical release instructions. The current unpublished batch adds0108 and0109. After publication approval, use [Admin operations and owner AI rollout](ADMIN_OPERATIONS_AI_WINDOWS_ROLLOUT.md), with its fifteen-entry plan and matching ZIP. Do not use the older pinned digest/archive below with the current checkout.

**Local review candidate — do not run until this exact release is approved and published.**

Use PowerShell in `D:\Dev\dddhack-portal\dddhack-portal-migration`, plus the existing
Git/Node/Neon CLI and Windows File Explorer. Preserve `.env.backend.local`, `.neon`,
`neon.windows.ts`, working `APP_ORIGIN`, `NEON_API_ORIGIN` and all deployed secrets.
No new credentials, domain changes or `--env` deployment option are required.

This batch adds **0107_admin_team_lock.sql**. The earlier roster-removal0107 was only an unimplemented proposal, not a shipped migration. It is excluded. Future roster work must take a then-unused number; never rename or overwrite this0107 after release. A target already through0106 needs only
0107; a target already through0107 needs no migration. Older/unexpected pending sets
stop for review. All twelve prior SQL hashes and seven historical Windows CRLF
aliases are preserved. The helper performs no automatic backup or restore: pending
apply requires an actual current recovery checkpoint whose restored copy you have
independently verified. Use a quiet migration window; on a changed-state/uncertain
outcome, inspect again rather than blindly repeating apply.

Bundle runtime source: `882bc7c311a4a52f6b7da971f56f6e8cfe09af42`.
ZIP SHA256: `0c3e35e8894fe48b40dfb58b848f1b131a917aca691357fb09a77a461d0864e2`.
Plan digest: `2dc505efb7e5cf25f4e9da1a56e9aa9cb4a816735b222127b9fdfdb5daafa277`.

Recommended order: publish the approved review branch with main unchanged → owner
applies pending0107 and deploys this backend → publish the frontend to main after
owner verification. The commands below use that existing review branch; no provider
operation or publication has been performed by the agent.

Run the numbered steps in order in the same **fresh PowerShell terminal**. Every
variable is initialized here; stop on any error. All commands are provided upfront.

1. **PowerShell — update the approved review branch.** Keep local configuration.
   This step is for after approval/publication, not while this candidate is held.

```powershell
$ErrorActionPreference = 'Stop'
Set-Location 'D:\Dev\dddhack-portal\dddhack-portal-migration'
$zipSHA = '0c3e35e8894fe48b40dfb58b848f1b131a917aca691357fb09a77a461d0864e2'
$indexSHA = '0bf9225529da30ffbd5226fb6022b3509063feb53399a3e08dee03a550849d10'
$planDigest = '2dc505efb7e5cf25f4e9da1a56e9aa9cb4a816735b222127b9fdfdb5daafa277'
$archive = '.\artifacts\neon\portalapi.zip'
$extract = '.\.local\portalapi-0c3e35e8894f'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmssfff'
$receipt = '.local/admin-lock-before-' + $stamp + '.json'
$freshReceipt = '.local/admin-lock-fresh-' + $stamp + '.json'
$afterReceipt = '.local/admin-lock-after-' + $stamp + '.json'

git diff --quiet
if ($LASTEXITCODE -ne 0) { throw 'Preserve local tracked edits before updating' }
git diff --cached --quiet
if ($LASTEXITCODE -ne 0) { throw 'Preserve staged edits before updating' }
git switch feat/portal-experience-rework
if ($LASTEXITCODE -ne 0) { throw 'Cannot switch safely; do not reset or clean' }
git pull --ff-only origin feat/portal-experience-rework
if ($LASTEXITCODE -ne 0) { throw 'Update stopped; preserve local files' }
if (-not (Test-Path '.\node_modules\tsx')) {
    npm ci
    if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed' }
}
node scripts/verify-migration-checkout.mjs --check
if ($LASTEXITCODE -eq 2) {
    node scripts/verify-migration-checkout.mjs --repair-line-endings
    if ($LASTEXITCODE -ne 0) { throw 'Source repair stopped; preserve edits' }
} elseif ($LASTEXITCODE -ne 0) { throw 'Source check failed' }

$plan = (node --import tsx neon/scripts/upgrade-populated.ts --plan | Out-String) | ConvertFrom-Json
if ($LASTEXITCODE -ne 0 -or $plan.planDigest -ne $planDigest -or @($plan.migrations).Count -ne 13) { throw 'Wrong source plan; do not inspect or deploy' }
$bundle = Get-Content -Raw '.\artifacts\neon\receipt.json' | ConvertFrom-Json
if ($bundle.sha256 -ne $zipSHA -or $bundle.canonicalPlanDigest -ne $planDigest) { throw 'Wrong release package' }
```

2. **PowerShell — read-only database inspection.** Enter direct host/database/role from the intended Neon Connect panel with pooling OFF, never a URL or password. Existing process variables override Node's env file; resolve conflicting connection values privately first.

```powershell
$env:MIGRATION_EXPECTED_HOST = Read-Host 'Intended DIRECT host only, not URL'
$env:MIGRATION_EXPECTED_DATABASE = Read-Host 'Intended database name only'
$env:MIGRATION_EXPECTED_ROLE = Read-Host 'Intended database role only'
if ($env:PORTAL_SYNTHETIC_DATABASE -eq '1') { throw 'This is a populated target; stop' }
node --env-file=.env.backend.local --import tsx neon/scripts/upgrade-populated.ts --inspect-populated --receipt $receipt
if ($LASTEXITCODE -ne 0) { throw 'Inspection failed; do not apply or deploy' }
$state = Get-Content -Raw $receipt | ConvertFrom-Json
if ($state.planDigest -ne $planDigest) { throw 'Unexpected source plan' }
```

3. **PowerShell — apply only if0107 is pending.** This skips apply when already complete. Only type VERIFIED after independently checking a real current recovery checkpoint for this exact target. Otherwise press Enter to stop. A fresh inspection is immediately followed by guarded apply.

```powershell
if (@($state.ledger).Count -eq 13 -and @($state.pending).Count -eq 0) {
    Write-Host 'Schema already complete. No apply needed.'
} elseif (@($state.ledger).Count -eq 12 -and @($state.pending).Count -eq 1 -and $state.pending[0] -eq '0107_admin_team_lock.sql') {
    $verified = Read-Host 'Only after verifying a CURRENT real restore checkpoint for this target, type VERIFIED; otherwise Enter stops'
    if ($verified -cne 'VERIFIED') { throw 'Establish and verify a real checkpoint first' }
    $checkpoint = Read-Host 'Actual verified recovery checkpoint identifier (private)'
    if ([string]::IsNullOrWhiteSpace($checkpoint)) { throw 'A real checkpoint is required' }
    node --env-file=.env.backend.local --import tsx neon/scripts/upgrade-populated.ts --inspect-populated --receipt $freshReceipt
    if ($LASTEXITCODE -ne 0) { throw 'Fresh inspection failed' }
    $fresh = Get-Content -Raw $freshReceipt | ConvertFrom-Json
    if ($fresh.planDigest -ne $planDigest -or @($fresh.ledger).Count -ne 12 -or @($fresh.pending).Count -ne 1 -or $fresh.pending[0] -ne '0107_admin_team_lock.sql') { throw 'State changed; inspect before any further action' }
    node --env-file=.env.backend.local --import tsx neon/scripts/upgrade-populated.ts --apply-populated --receipt $freshReceipt --backup-checkpoint $checkpoint --confirm-restore-verified
    if ($LASTEXITCODE -ne 0) { throw 'Apply outcome unconfirmed; inspect before retrying' }
    node --env-file=.env.backend.local --import tsx neon/scripts/upgrade-populated.ts --inspect-populated --receipt $afterReceipt
    if ($LASTEXITCODE -ne 0) { throw 'Post-inspection failed; stop deployment' }
    $state = Get-Content -Raw $afterReceipt | ConvertFrom-Json
} else { throw 'Unexpected ledger/pending set; preserve receipt and review' }
if ($state.planDigest -ne $planDigest -or @($state.ledger).Count -ne 13 -or @($state.pending).Count -ne 0) { throw 'Schema prerequisite not confirmed' }
```

4. **PowerShell + File Explorer — verify and extract.** Right-click portalapi.zip → Extract All…, using exactly the new destination printed below. Do not merge into an older folder or install packages inside the extracted Linux ARM64 bundle.

```powershell
@'
const fs = require('node:fs'), crypto = require('node:crypto');
const [archive, expected] = process.argv.slice(2);
if (crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex') !== expected) throw Error('ZIP checksum mismatch');
console.log('Exact new ZIP verified.');
'@ | node - $archive $zipSHA
if ($LASTEXITCODE -ne 0) { throw 'Archive verification failed' }
if (Test-Path $extract) { throw 'Extraction folder already exists; do not overlay an older attempt' }
explorer.exe 'D:\Dev\dddhack-portal\dddhack-portal-migration\artifacts\neon'
Write-Host 'Extract portalapi.zip to D:\Dev\dddhack-portal\dddhack-portal-migration\.local\portalapi-0c3e35e8894f'
if ((Read-Host 'When extraction is complete, type EXTRACTED') -cne 'EXTRACTED') { throw 'Extraction not confirmed' }
```

5. **PowerShell — verify the extracted root and deploy the one Function.** The source folder must directly contain index.mjs and node_modules. Type DEPLOY only when ready; the command preserves the existing linked target and deployed variables, with no --env option.

```powershell
@'
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const [root, expected] = process.argv.slice(2);
if (crypto.createHash('sha256').update(fs.readFileSync(path.join(root, 'index.mjs'))).digest('hex') !== expected) throw Error('Wrong index.mjs');
for (const name of ['node_modules/sharp/package.json','node_modules/@img/sharp-linux-arm64/lib/sharp-linux-arm64-0.35.5.node','node_modules/@img/sharp-libvips-linux-arm64/lib/libvips-cpp.so.8.18.7']) {
  if (!fs.statSync(path.join(root, name)).isFile()) throw Error('Wrong source root layout');
}
console.log('Entry bytes and packaged source root verified.');
'@ | node - $extract $indexSHA
if ($LASTEXITCODE -ne 0) { throw 'Extraction verification failed' }
if ((Read-Host 'Type DEPLOY to update the existing linked portalapi Function') -cne 'DEPLOY') { throw 'Deployment not requested' }
neon functions deploy portalapi --src .\.local\portalapi-0c3e35e8894f --no-bundle --runtime nodejs24
if ($LASTEXITCODE -ne 0) { throw 'Deployment outcome unconfirmed; inspect before retrying' }
```



After owner deployment, verify sign-in, admin filtering/export, inline member privacy,
and admin Lock → separate Approve → Unlock using an intended test team. Do not use
real teams as destructive test fixtures. Health200 alone is not authenticated/schema
proof. The agent has not connected to, migrated or deployed the hosted database.
Native Windows execution and execution of the unmodified ARM64 package remain
unverified; local byte checks and blocked-outbound host smoke are documented.
