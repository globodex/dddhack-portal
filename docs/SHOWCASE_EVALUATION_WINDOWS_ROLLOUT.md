# HELD Windows rollout: Showcase and automatic evaluation

**REVIEW ONLY — NOT deployment-ready.** Optional server-only GitHub transport is implemented and mock-tested, but owner credential/provider/schedule setup and hosted verification remain pending; design and scoring decisions remain open. Preserve this candidate as evidence, not a recommendation to enable unattended evaluation. **Do not run until this exact candidate and its package have received explicit publication approval and are on main.** These are owner-run operations; the agent has not run a hosted migration/deployment. A main push may publish the frontend before the backend is ready, so agree the release window first. Required order: obtain this approved source/package → verify source and target → apply pending0112/0113 → verify schema → deploy matching backend → check behavior.

Prerequisites: existing Git, Node with `--env-file` support, installed repository dependencies (the command installs them only if tsx is absent), existing linked/authenticated Neon CLI, Windows PowerShell with built-in .NET ZIP support. Before applying SQL, independently verify a CURRENT backup/restore recovery checkpoint for the intended database. The helper does not create or verify that checkpoint for you. Use a quiet migration window; if database state changes or an outcome is unconfirmed, stop and inspect rather than loop/retry blindly.

Keep `.env.backend.local`, `.neon`, `neon.windows.ts`, deployed secrets and the working APP_ORIGIN/NEON_API_ORIGIN unchanged. No new key, config path or `--env` deployment flag. The intended source is main, **not** the repository's Sites default branch. Do not use an old extracted folder.

Package commit96ee85586cbeceeb51103692884632c947fac04e; runtime sourcee21e35e9bbded388ca9d73d73bbbeef143bd57a0; ZIP `b57ceb8bf9e2a11806e85f3f337af3a915b130ad28f2c98bfc4bc0c534041dc4`; entry `4c5983625f62815215ada6eff1562eb4ac99f01b4982d6bcd74f619800218fb8`; plan `3624c82a7dc7026b5db4179dc021e5d88d33c66bafab35c4916c5a476e04293b`. Commands use one fresh terminal; every variable starts here. Stop on any error. PowerShell syntax was inspected but not executed on native Windows in this Linux executor.

1. **Fresh PowerShell, after approved main publication:** safely update; preserve local edits/configuration.

```powershell
$ErrorActionPreference = 'Stop'
Set-Location 'D:\Dev\dddhack-portal\dddhack-portal-migration'
$expectedPlan = '3624c82a7dc7026b5db4179dc021e5d88d33c66bafab35c4916c5a476e04293b'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmssfff'
$receipt = '.local/showcase-before-' + $stamp + '.json'
$freshReceipt = '.local/showcase-fresh-' + $stamp + '.json'
$afterReceipt = '.local/showcase-after-' + $stamp + '.json'
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
git merge-base --is-ancestor 96ee85586cbeceeb51103692884632c947fac04e HEAD
if ($LASTEXITCODE -ne 0) { throw 'Approved package source is not present.' }
$changedAfterPackage = @(git diff --name-only 96ee85586cbeceeb51103692884632c947fac04e HEAD)
if ($LASTEXITCODE -ne 0 -or @($changedAfterPackage | Where-Object { $_ -notlike 'docs/*' }).Count -ne 0) { throw 'Later non-documentation changes exist; obtain their own release instructions.' }
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
if ($LASTEXITCODE -ne 0 -or $plan.planDigest -ne $expectedPlan -or @($plan.migrations).Count -ne 19) { throw 'Wrong migration plan.' }
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

3. **Same PowerShell:** accepts only both new migrations, only0113 if0112 is already applied, or no work. Older or unexpected ledger states stop for review. Only acknowledge a genuinely verified current restore checkpoint for this exact target.

```powershell
$pending = @($state.pending)
$allowed = (@($state.ledger).Count -eq 17 -and ($pending -join ',') -eq '0112_continuous_engagement.sql,0113_submission_vote_window.sql') -or (@($state.ledger).Count -eq 18 -and ($pending -join ',') -eq '0113_submission_vote_window.sql')
if (@($state.ledger).Count -eq 19 -and $pending.Count -eq 0) {
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
if ($state.planDigest -ne $expectedPlan -or @($state.ledger).Count -ne 19 -or @($state.pending).Count -ne 0) { throw 'Schema prerequisite not confirmed.' }
```

Do not paste raw SQL into SQL Editor: it would bypass the required migration-ledger/checksum, target, receipt and transaction bookkeeping.

4. **Same PowerShell:** verify both immutable receipt and ZIP. Then extract automatically into a never-existing GUID folder; keep the same terminal for verification/deploy. No Explorer merge and no npm install inside this Linux package.

```powershell
@'
const fs=require('node:fs'),crypto=require('node:crypto');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const raw=fs.readFileSync('artifacts/neon/receipt.json');
if(hash(raw)!=='483afad02f0f0b55646b8c19be98d138dcaaf628b4971eae7a4323b6844e5fe8') throw Error('Wrong receipt');
const r=JSON.parse(raw);
if(hash(fs.readFileSync('artifacts/neon/portalapi.zip'))!=='b57ceb8bf9e2a11806e85f3f337af3a915b130ad28f2c98bfc4bc0c534041dc4' || r.runtimeSource!=='e21e35e9bbded388ca9d73d73bbbeef143bd57a0' || r.canonicalPlanDigest!=='3624c82a7dc7026b5db4179dc021e5d88d33c66bafab35c4916c5a476e04293b') throw Error('Wrong ZIP/source');
console.log('Correct review archive and receipt');
'@ | node -
if ($LASTEXITCODE -ne 0) { throw 'Archive verification failed.' }
Add-Type -AssemblyName System.IO.Compression.FileSystem
$src = Join-Path (Get-Location) ('.local\portalapi-b57ceb8bf9e2-' + [guid]::NewGuid().ToString('N'))
if (Test-Path $src) { throw 'Refusing existing destination.' }
[System.IO.Compression.ZipFile]::ExtractToDirectory((Join-Path (Get-Location) 'artifacts\neon\portalapi.zip'), $src)
$env:PORTAL_VERIFIED_EXTRACTED_SOURCE = $src
```

5. **Same PowerShell:** verify exact file set, all93 file hashes/lengths and both ARM64 native dependencies in that actual extraction.

```powershell
@'
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=process.env.PORTAL_VERIFIED_EXTRACTED_SOURCE;
if(!root || !fs.statSync(root).isDirectory()) throw Error('Missing fresh extracted directory');
const raw=fs.readFileSync('artifacts/neon/receipt.json');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
if(hash(raw)!=='483afad02f0f0b55646b8c19be98d138dcaaf628b4971eae7a4323b6844e5fe8') throw Error('Wrong receipt');
const r=JSON.parse(raw), found=[];
function walk(dir,rel=''){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const n=rel?rel+'/'+e.name:e.name,p=path.join(dir,e.name);if(e.isSymbolicLink())throw Error('Symlink refused');if(e.isDirectory())walk(p,n);else if(e.isFile())found.push(n);else throw Error('Unsupported entry');}}
walk(root);
const expected=r.fileManifest.map(f=>f.path).sort();
if(expected.length!==93 || JSON.stringify(found.sort())!==JSON.stringify(expected))throw Error('Wrong extracted file set');
for(const f of r.fileManifest){const b=fs.readFileSync(path.join(root,f.path));if(b.length!==f.bytes || hash(b)!==f.sha256)throw Error('Wrong extracted file: '+f.path);}
if(hash(fs.readFileSync(path.join(root,'index.mjs')))!=='4c5983625f62815215ada6eff1562eb4ac99f01b4982d6bcd74f619800218fb8')throw Error('Wrong entry');
for(const f of r.nativeFiles){const b=fs.readFileSync(path.join(root,f.path));if(b.subarray(0,4).toString('hex')!=='7f454c46' || b.readUInt16LE(18)!==183)throw Error('Wrong native architecture');}
console.log('Verified all93 payload files and Linux ARM64 dependencies');
'@ | node -
if ($LASTEXITCODE -ne 0) { throw 'Extraction failed verification; DO NOT deploy.' }
```

6. **Owner-run, ONLY after publication/design approval and owner GitHub/provider/scheduler setup are resolved:** confirm existing linked portalapi is the function Vercel uses, then deploy the same verified directory. These commands preserve omitted deployed variables; they do not configure a token/provider/schedule. Do not add --env or change existing origins/secrets to force success.

```powershell
neon functions get portalapi
if ($LASTEXITCODE -ne 0) { throw 'Cannot identify existing portalapi.' }
if ($src -ne $env:PORTAL_VERIFIED_EXTRACTED_SOURCE -or -not (Test-Path (Join-Path $src 'index.mjs'))) { throw 'Verified source missing; restart verification.' }
neon functions deploy portalapi --src "$src" --no-bundle --runtime nodejs24
if ($LASTEXITCODE -ne 0) { throw 'Deployment outcome failed; inspect metadata.' }
neon functions get portalapi
if ($LASTEXITCODE -ne 0) { throw 'Cannot confirm active deployment metadata.' }
```

Confirm completed active deployment and matching separately approved frontend. Native schedule setup is a separate owner action: POST /api/evaluation/automatic-tick with the configured trigger ID forwarded as PORTAL_EVALUATION_TRIGGER_ID. Do not enable it until provider approval/readiness and public GitHub read capacity are established. No credential is present or configured in this package. Optional PORTAL_GITHUB_PUBLIC_READ_TOKEN is consumed only by the server reader; absent means anonymous fallback. Invalid/expired/forbidden configured credentials remain pending for organizer attention and do not fall back silently. See GITHUB_PUBLIC_EVIDENCE_AUTH_REVIEW.md for private owner setup; this guide does not create/configure credentials.

Read-only checks first: shared dashboard timing across tabs; pre-reveal public payloads contain no scores; canonical ranks only after an intentionally owner-approved reveal; current-version evaluation progress. Do not consume real attempts, run paid evaluations or reveal real results merely to smoke-test. Full hosted login/provider/scheduler/ARM64 execution remains owner-verified. Native Windows commands were syntax-reviewed, not executed in this Linux environment.
