# Held Windows rollout: submission access and admin Add idea

**Do not run until this exact candidate and its package have received explicit publication approval and are on main.** These are owner-run operations; the agent has not run a hosted migration/deployment. A main push may publish the frontend before the backend is ready, so agree the release window first. Required order: obtain this approved source/package → verify source and target → apply pending0110/0111 → verify schema → deploy matching backend → check behavior.

Prerequisites: existing Git, Node with `--env-file` support, installed repository dependencies (the command installs them only if tsx is absent), existing linked/authenticated Neon CLI, Windows PowerShell and File Explorer. Before applying SQL, independently verify a CURRENT backup/restore recovery checkpoint for the intended database. The helper does not create or verify that checkpoint for you. Use a quiet migration window; if database state changes or an outcome is unconfirmed, stop and inspect rather than loop/retry blindly.

Keep `.env.backend.local`, `.neon`, `neon.windows.ts`, deployed secrets and the working APP_ORIGIN/NEON_API_ORIGIN unchanged. No new key, config path or `--env` deployment flag. The intended source is main, **not** the repository's Sites default branch. Do not use an old extracted folder.

Runtime source49de9dd; ZIP `a23ff1aa87e9cd8d9ef13bc2db7eaafec21407932603f0bea52d9188c796136e`; entry `1a4115a59bd6a69c5af52ddcbf9ecb20c3cf4f67eb2d881a17f56f43c7da811a`; plan `3c173216603f6a2927903493e29bfbe629dcaddf67cbcd322196f3153f6bffd5`. Commands use one fresh terminal; every variable starts here. Stop on any error. PowerShell syntax was inspected but not executed on native Windows in this Linux executor.

1. **Fresh PowerShell, after approved main publication:** safely update; preserve local edits/configuration.

```powershell
$ErrorActionPreference = 'Stop'
Set-Location 'D:\Dev\dddhack-portal\dddhack-portal-migration'
$expectedPlan = '3c173216603f6a2927903493e29bfbe629dcaddf67cbcd322196f3153f6bffd5'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmssfff'
$receipt = '.local/submission-before-' + $stamp + '.json'
$freshReceipt = '.local/submission-fresh-' + $stamp + '.json'
$afterReceipt = '.local/submission-after-' + $stamp + '.json'
$remote = git remote get-url origin
if ($LASTEXITCODE -ne 0 -or $remote -notin @('https://github.com/Param302/dddhack-portal.git','git@github.com:Param302/dddhack-portal.git')) { throw 'Unexpected repository; stop.' }
git diff --quiet
if ($LASTEXITCODE -ne 0) { throw 'Preserve tracked local edits first; do not reset.' }
git diff --cached --quiet
if ($LASTEXITCODE -ne 0) { throw 'Preserve staged edits first.' }
git fetch origin main
if ($LASTEXITCODE -ne 0) { throw 'Fetch failed.' }
git switch main
if ($LASTEXITCODE -ne 0) { throw 'Cannot safely switch; preserve local files.' }
git merge --ff-only origin/main
if ($LASTEXITCODE -ne 0) { throw 'Main diverged; do not force or reset.' }
git merge-base --is-ancestor 49de9dd55dcaaa14b881e30fd0eac39eb4c8a23d HEAD
if ($LASTEXITCODE -ne 0) { throw 'Approved runtime source is not present.' }
if (-not (Test-Path '.\node_modules\tsx')) {
    npm ci
    if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
}
node scripts/verify-migration-checkout.mjs --check
if ($LASTEXITCODE -eq 2) {
    node scripts/verify-migration-checkout.mjs --repair-line-endings
    if ($LASTEXITCODE -ne 0) { throw 'Source repair refused; preserve edits.' }
} elseif ($LASTEXITCODE -ne 0) { throw 'Source check failed.' }
$plan = (node --import tsx neon/scripts/upgrade-populated.ts --plan | Out-String) | ConvertFrom-Json
if ($LASTEXITCODE -ne 0 -or $plan.planDigest -ne $expectedPlan -or @($plan.migrations).Count -ne 17) { throw 'Wrong migration plan.' }
```

2. **Same PowerShell:** independently read the intended target from **Neon Console → Connect, pooling OFF**. Enter only host, database and role, never a connection URL/password. Node reads the existing private env file. Existing process connection variables take precedence: if a mismatch occurs, resolve it privately; do not copy the effective URL into the expected-target values just to pass the check.

```powershell
$env:MIGRATION_EXPECTED_HOST = Read-Host 'Intended DIRECT host only, from Neon Connect'
$env:MIGRATION_EXPECTED_DATABASE = Read-Host 'Intended database name, from Neon Connect'
$env:MIGRATION_EXPECTED_ROLE = Read-Host 'Intended database role, from Neon Connect'
node --env-file=.env.backend.local --import tsx neon/scripts/upgrade-populated.ts --inspect-populated --receipt $receipt
if ($LASTEXITCODE -ne 0) { throw 'Inspection failed; do not apply or deploy.' }
$state = Get-Content -Raw $receipt | ConvertFrom-Json
if ($state.planDigest -ne $expectedPlan) { throw 'Wrong source plan.' }
```

3. **Same PowerShell:** accepts only both new migrations, only0111 if0110 is already applied, or no work. It never reapplies0109/older migrations. Only acknowledge a genuinely verified current restore checkpoint for this exact target.

```powershell
$pending = @($state.pending)
$allowed = (@($state.ledger).Count -eq 15 -and ($pending -join ',') -eq '0110_admin_submission_access.sql,0111_admin_missing_team_idea.sql') -or (@($state.ledger).Count -eq 16 -and ($pending -join ',') -eq '0111_admin_missing_team_idea.sql')
if (@($state.ledger).Count -eq 17 -and $pending.Count -eq 0) {
    Write-Host 'Schema already complete; no apply needed.'
} elseif ($allowed) {
    $verified = Read-Host 'Type VERIFIED only after checking a CURRENT real restore checkpoint for this exact target'
    if ($verified -cne 'VERIFIED') { throw 'Stop until recovery is independently verified.' }
    $checkpoint = Read-Host 'Actual verified recovery checkpoint identifier (private)'
    if ([string]::IsNullOrWhiteSpace($checkpoint)) { throw 'A real checkpoint is required.' }
    node --env-file=.env.backend.local --import tsx neon/scripts/upgrade-populated.ts --inspect-populated --receipt $freshReceipt
    if ($LASTEXITCODE -ne 0) { throw 'Fresh inspection failed.' }
    $fresh = Get-Content -Raw $freshReceipt | ConvertFrom-Json
    if ($fresh.planDigest -ne $expectedPlan -or (@($fresh.pending) -join ',') -ne ($pending -join ',') -or @($fresh.ledger).Count -ne @($state.ledger).Count) { throw 'State changed; inspect before further action.' }
    node --env-file=.env.backend.local --import tsx neon/scripts/upgrade-populated.ts --apply-populated --receipt $freshReceipt --backup-checkpoint $checkpoint --confirm-restore-verified
    if ($LASTEXITCODE -ne 0) { throw 'Apply outcome unconfirmed; inspect before any retry.' }
    node --env-file=.env.backend.local --import tsx neon/scripts/upgrade-populated.ts --inspect-populated --receipt $afterReceipt
    if ($LASTEXITCODE -ne 0) { throw 'Post-inspection failed; stop deployment.' }
    $state = Get-Content -Raw $afterReceipt | ConvertFrom-Json
} else { throw 'Unexpected ledger/pending set; stop for review.' }
if ($state.planDigest -ne $expectedPlan -or @($state.ledger).Count -ne 17 -or @($state.pending).Count -ne 0) { throw 'Schema prerequisite not confirmed.' }
```

Do not paste raw SQL into SQL Editor: it would bypass the required migration-ledger/checksum, target, receipt and transaction bookkeeping.

4. **Same PowerShell:** verify the exact ZIP before extracting. No Get-FileHash or fragile native `node -e` quoting.

```powershell
@'
const fs = require('node:fs'), crypto = require('node:crypto');
const expected = 'a23ff1aa87e9cd8d9ef13bc2db7eaafec21407932603f0bea52d9188c796136e';
const actual = crypto.createHash('sha256').update(fs.readFileSync('artifacts/neon/portalapi.zip')).digest('hex');
const receipt = JSON.parse(fs.readFileSync('artifacts/neon/receipt.json','utf8'));
if (actual !== expected || receipt.sha256 !== expected || receipt.runtimeSource !== '49de9dd55dcaaa14b881e30fd0eac39eb4c8a23d' || receipt.canonicalPlanDigest !== '3c173216603f6a2927903493e29bfbe629dcaddf67cbcd322196f3153f6bffd5') throw Error('Wrong archive/source receipt; stop');
console.log('Correct approved candidate ZIP');
'@ | node -
if ($LASTEXITCODE -ne 0) { throw 'Archive verification failed.' }
if (Test-Path '.\.local\portalapi-a23ff1aa87e9') { throw 'Extraction folder already exists; do not merge or deploy it without a new verified extraction.' }
```

5. **File Explorer:** right-click `artifacts\neon\portalapi.zip` → **Extract All**, setting this exact NEW destination (index.mjs and node_modules must be directly inside it):

`D:\Dev\dddhack-portal\dddhack-portal-migration\.local\portalapi-a23ff1aa87e9`

Do not run npm install inside the extracted Linux ARM64 package. Return to the same PowerShell and verify the extracted bytes:

```powershell
@'
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const root = '.local/portalapi-a23ff1aa87e9';
const hash = p => crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex');
if (hash('index.mjs') !== '1a4115a59bd6a69c5af52ddcbf9ecb20c3cf4f67eb2d881a17f56f43c7da811a') throw Error('Wrong extracted index.mjs');
const native = [
 ['node_modules/@img/sharp-linux-arm64/lib/sharp-linux-arm64-0.35.5.node','6c3c549bd1bae0fe0b34832917a39950abd4db8feea874f8447ed07cded7854b'],
 ['node_modules/@img/sharp-libvips-linux-arm64/lib/libvips-cpp.so.8.18.7','97c2ae9a663cd3de58a34d68820994e49e0e261fddbd4616bd726a72610bbc8f']
];
for (const [name,expected] of native) {
 const bytes = fs.readFileSync(path.join(root,name));
 if (hash(name) !== expected || bytes.subarray(0,4).toString('hex') !== '7f454c46' || bytes.readUInt16LE(18) !== 183) throw Error('Wrong ARM64 native file: '+name);
}
if (JSON.parse(fs.readFileSync(path.join(root,'node_modules/sharp/package.json'),'utf8')).version !== '0.35.5') throw Error('Wrong Sharp version');
console.log('Correct extracted entry and ARM64 native dependencies');
'@ | node -
if ($LASTEXITCODE -ne 0) { throw 'Extraction verification failed; do not deploy.' }
```

6. **Same PowerShell, owner-run:** use the existing linked Neon context. First ensure `get portalapi` identifies the existing function used by Vercel. Do not change the config/env/origins or choose another project/branch to make an error disappear.

```powershell
neon functions get portalapi
if ($LASTEXITCODE -ne 0) { throw 'Cannot identify existing portalapi; stop.' }
neon functions deploy portalapi --src .\.local\portalapi-a23ff1aa87e9 --no-bundle --runtime nodejs24
if ($LASTEXITCODE -ne 0) { throw 'Deployment failed; inspect its result.' }
neon functions get portalapi
if ($LASTEXITCODE -ne 0) { throw 'Could not confirm deployment metadata.' }
```

Confirm the active deployment completed. Reload the separately approved frontend. With synthetic test teams check: active admin leader can type/save/submit despite timing/profile/check-in; ordinary participant before opening sees the waiting card; missing-idea admin Add idea creates once and refuses stale overwrite. Do not consume real teams' attempts for testing. Three attempts, active membership/leadership, removed projects and frozen results still apply. Native ARM64 execution and live rollout remain owner-verified, not proven by this x86 host smoke.
