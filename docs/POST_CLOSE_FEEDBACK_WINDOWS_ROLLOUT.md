# HELD Windows rollout: post-close feedback and stale-client compatibility

**REVIEW ONLY — NOT deployment-ready.** Read `BACKEND_FIRST_FEEDBACK_REVIEW.md` first. Stale owner policy forms are server-blocked by the settings contract; legacy pause/staged reveal actions fail closed; old freeze requires a new preview. These protect the new-backend/old-frontend interval, not an atomic rollout. A coordinated quiet window (or a separately approved enforced maintenance gate) is required. Partially unveiled legacy results and missing qualification UI require owner review; do not bypass them. New participant feedback posts only after submission close; staff timing bypass is retained. Scored feedback is [close, freeze), votes [open, min(close, freeze)). No qualification rules/weights were invented.  Optional server-only GitHub transport is implemented and mock-tested, but owner credential/provider/schedule setup and hosted verification remain pending; design and scoring decisions remain open. Preserve this candidate as evidence, not a recommendation to enable unattended evaluation. **Do not run until the owner explicitly approves this exact backend-first rollout and recovery plan. Main is intentionally NOT required first.** These are owner-run operations; the agent has not run a hosted migration/deployment. A main push may publish the frontend before the backend is ready, so agree the release window first. Required order: obtain this approved review ZIP/Git bundle without a main push → verify source and target → apply pending0112/0113/0114 → verify schema → deploy matching backend → verify read-only behavior → obtain separate frontend main-publication approval. Do not publish the new frontend first.

Prerequisites: existing Git, Node with `--env-file` support, network access to install the pinned repository dependencies in the isolated worktree, existing linked/authenticated Neon CLI, Windows PowerShell with built-in .NET ZIP support. Before applying SQL, independently verify a CURRENT backup/restore recovery checkpoint for the intended database. The helper does not create or verify that checkpoint for you. Use a quiet migration window; if database state changes or an outcome is unconfirmed, stop and inspect rather than loop/retry blindly.

Keep `.env.backend.local`, `.neon`, `neon.windows.ts`, deployed secrets and the working APP_ORIGIN/NEON_API_ORIGIN unchanged. No new key, config path or `--env` deployment flag. The intended source is main, **not** the repository's Sites default branch. Do not use an old extracted folder.

Package commit2b627e8262e34c005ae7fdc717e6cd8396cd6203; runtime source5eff3da382f734ac9e47a8ea68976710b5a13fe7; ZIP `698f74cbcc72cabc9b998b31e85791dc1ccd5952f1df14243ac0430106df5831`; entry `b966eecbad19df0052eaa45e3ae0e7497b7d9da7ee2bab922e114486e01a6a57`; plan `7237ebe292938f17c8e51373b700cc12e4e8ce01f611e329ba76fc140305c92c`. Commands use one fresh terminal; every variable starts here. Stop on any error. PowerShell syntax was inspected but not executed on native Windows in this Linux executor.

1. **After explicit approval for this owner-run rollout:** save the Library review ZIP as `D:\Dev\dddhack-portal\dddhack-portal-migration\.local\ddd-feedback-review.zip`. This uses an incremental Git bundle, NOT a main push. Your existing clone must contain published base `0ab8d31bbfd5d3770f41d3a490fa22b615e91c35`. Local edits/branches are preserved; the source is checked out into a fresh detached worktree.

```powershell
$ErrorActionPreference = 'Stop'
$portalRoot = 'D:\Dev\dddhack-portal\dddhack-portal-migration'
$portalEnv = Join-Path $portalRoot '.env.backend.local'
Set-Location $portalRoot
if (-not (Test-Path $portalEnv)) { throw 'Existing private backend env file is missing; do not create guessed credentials.' }
$remote = git remote get-url origin
if ($LASTEXITCODE -ne 0 -or $remote -notin @('https://github.com/Param302/dddhack-portal.git','git@github.com:Param302/dddhack-portal.git')) { throw 'Unexpected repository; stop.' }
Add-Type -AssemblyName System.IO.Compression.FileSystem
$reviewRoot = Join-Path $portalRoot ('.local\feedback-review-' + [guid]::NewGuid().ToString('N'))
if (Test-Path $reviewRoot) { throw 'Refusing existing review destination.' }
[System.IO.Compression.ZipFile]::ExtractToDirectory((Join-Path $portalRoot '.local\ddd-feedback-review.zip'), $reviewRoot)
$env:PORTAL_REVIEW_ROOT = $reviewRoot
@'
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const b=fs.readFileSync(path.join(process.env.PORTAL_REVIEW_ROOT,'ddd-feedback-source.bundle'));
if(crypto.createHash('sha256').update(b).digest('hex')!=='2452d44021f548123a6fa0bf8021f27e82005221e92b9e4015e0aae76d547519')throw Error('Wrong source bundle');
console.log('Exact source bundle verified');
'@ | node -
if ($LASTEXITCODE -ne 0) { throw 'Source bundle hash check failed.' }
$bundle = Join-Path $reviewRoot 'ddd-feedback-source.bundle'
git bundle verify "$bundle"
if ($LASTEXITCODE -ne 0) { throw 'Bundle prerequisite/check failed; do not reset the repository.' }
git fetch --no-tags "$bundle" HEAD
if ($LASTEXITCODE -ne 0) { throw 'Local bundle import failed.' }
$packageCommit = '2b627e8262e34c005ae7fdc717e6cd8396cd6203'
$imported = git rev-parse FETCH_HEAD
if ($LASTEXITCODE -ne 0 -or $imported -cne $packageCommit) { throw 'Wrong imported source.' }
$migrationRoot = Join-Path $portalRoot ('.local\feedback-source-' + [guid]::NewGuid().ToString('N'))
if (Test-Path $migrationRoot) { throw 'Refusing an existing source worktree.' }
git -c core.autocrlf=false worktree add --detach "$migrationRoot" $packageCommit
if ($LASTEXITCODE -ne 0) { throw 'Isolated checkout failed; preserve existing files.' }
Set-Location $migrationRoot
npm ci
if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
node scripts/verify-migration-checkout.mjs --check
if ($LASTEXITCODE -ne 0) { throw 'Exact migration source check failed; stop.' }
$expectedPlan = '7237ebe292938f17c8e51373b700cc12e4e8ce01f611e329ba76fc140305c92c'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmssfff'
New-Item -ItemType Directory -Force '.local' | Out-Null
$receipt = '.local/feedback-before-' + $stamp + '.json'
$freshReceipt = '.local/feedback-fresh-' + $stamp + '.json'
$afterReceipt = '.local/feedback-after-' + $stamp + '.json'
$plan = (node --import tsx neon/scripts/upgrade-populated.ts --plan | Out-String) | ConvertFrom-Json
if ($LASTEXITCODE -ne 0 -or $plan.planDigest -ne $expectedPlan -or @($plan.migrations).Count -ne 20) { throw 'Wrong migration plan.' }
```

2. **Same PowerShell:** independently read the intended target from **Neon Console → Connect, pooling OFF**. Enter only host, database and role, never a connection URL/password. Node reads the existing private env file. Existing process connection variables take precedence: if a mismatch occurs, resolve it privately; do not copy the effective URL into the expected-target values just to pass the check.

```powershell
$env:MIGRATION_EXPECTED_HOST = Read-Host 'Intended DIRECT host only, from Neon Connect'
$env:MIGRATION_EXPECTED_DATABASE = Read-Host 'Intended database name, from Neon Connect'
$env:MIGRATION_EXPECTED_ROLE = Read-Host 'Intended database role, from Neon Connect'
node --env-file="$portalEnv" --import tsx neon/scripts/upgrade-populated.ts --inspect-populated --receipt $receipt
if ($LASTEXITCODE -ne 0) { throw 'Inspection failed; do not apply or deploy.' }
$state = Get-Content -Raw $receipt | ConvertFrom-Json
if ($state.planDigest -ne $expectedPlan) { throw 'Wrong source plan.' }
```

3. **Same PowerShell:** accepts only the exact pending suffix0112/0113/0114,0113/0114,0114, or no work. Older or unexpected ledger states stop for review. Only acknowledge a genuinely verified current restore checkpoint for this exact target.

```powershell
$pending = @($state.pending)
$allowed = (@($state.ledger).Count -eq 17 -and ($pending -join ',') -eq '0112_continuous_engagement.sql,0113_submission_vote_window.sql,0114_post_submission_feedback.sql') -or (@($state.ledger).Count -eq 18 -and ($pending -join ',') -eq '0113_submission_vote_window.sql,0114_post_submission_feedback.sql') -or (@($state.ledger).Count -eq 19 -and ($pending -join ',') -eq '0114_post_submission_feedback.sql')
if (@($state.ledger).Count -eq 20 -and $pending.Count -eq 0) {
    Write-Host 'Schema already complete; no apply needed.'
} elseif ($allowed) {
    $verified = Read-Host 'Type VERIFIED only after checking a CURRENT real restore checkpoint for this exact target'
    if ($verified -cne 'VERIFIED') { throw 'Stop until recovery is independently verified.' }
    $checkpoint = Read-Host 'Actual verified recovery checkpoint identifier (private)'
    if ([string]::IsNullOrWhiteSpace($checkpoint)) { throw 'A real checkpoint is required.' }
    node --env-file="$portalEnv" --import tsx neon/scripts/upgrade-populated.ts --inspect-populated --receipt $freshReceipt
    if ($LASTEXITCODE -ne 0) { throw 'Fresh inspection failed.' }
    $fresh = Get-Content -Raw $freshReceipt | ConvertFrom-Json
    if ($fresh.planDigest -ne $expectedPlan -or (@($fresh.pending) -join ',') -ne ($pending -join ',') -or @($fresh.ledger).Count -ne @($state.ledger).Count) { throw 'State changed; inspect before further action.' }
    node --env-file="$portalEnv" --import tsx neon/scripts/upgrade-populated.ts --apply-populated --receipt $freshReceipt --backup-checkpoint $checkpoint --confirm-restore-verified
    if ($LASTEXITCODE -ne 0) { throw 'Apply outcome unconfirmed; inspect before any retry.' }
    node --env-file="$portalEnv" --import tsx neon/scripts/upgrade-populated.ts --inspect-populated --receipt $afterReceipt
    if ($LASTEXITCODE -ne 0) { throw 'Post-inspection failed; stop deployment.' }
    $state = Get-Content -Raw $afterReceipt | ConvertFrom-Json
} else { throw 'Unexpected ledger/pending set; stop for review.' }
if ($state.planDigest -ne $expectedPlan -or @($state.ledger).Count -ne 20 -or @($state.pending).Count -ne 0) { throw 'Schema prerequisite not confirmed.' }
```

Do not paste raw SQL into SQL Editor: it would bypass the required migration-ledger/checksum, target, receipt and transaction bookkeeping.

4. **Same PowerShell:** verify both immutable receipt and ZIP. Then extract automatically into a never-existing GUID folder; keep the same terminal for verification/deploy. No Explorer merge and no npm install inside this Linux package.

```powershell
@'
const fs=require('node:fs'),crypto=require('node:crypto');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const raw=fs.readFileSync('artifacts/neon/receipt.json');
if(hash(raw)!=='d881e5fe0210be25c66deab6df006282e9452ea00c78a69e12c530cfcc18ba03') throw Error('Wrong receipt');
const r=JSON.parse(raw);
if(hash(fs.readFileSync('artifacts/neon/portalapi.zip'))!=='698f74cbcc72cabc9b998b31e85791dc1ccd5952f1df14243ac0430106df5831' || r.runtimeSource!=='5eff3da382f734ac9e47a8ea68976710b5a13fe7' || r.canonicalPlanDigest!=='7237ebe292938f17c8e51373b700cc12e4e8ce01f611e329ba76fc140305c92c') throw Error('Wrong ZIP/source');
console.log('Correct review archive and receipt');
'@ | node -
if ($LASTEXITCODE -ne 0) { throw 'Archive verification failed.' }
Add-Type -AssemblyName System.IO.Compression.FileSystem
$src = Join-Path (Get-Location) ('.local\portalapi-698f74cbcc72-' + [guid]::NewGuid().ToString('N'))
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
if(hash(raw)!=='d881e5fe0210be25c66deab6df006282e9452ea00c78a69e12c530cfcc18ba03') throw Error('Wrong receipt');
const r=JSON.parse(raw), found=[];
function walk(dir,rel=''){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const n=rel?rel+'/'+e.name:e.name,p=path.join(dir,e.name);if(e.isSymbolicLink())throw Error('Symlink refused');if(e.isDirectory())walk(p,n);else if(e.isFile())found.push(n);else throw Error('Unsupported entry');}}
walk(root);
const expected=r.fileManifest.map(f=>f.path).sort();
if(expected.length!==93 || JSON.stringify(found.sort())!==JSON.stringify(expected))throw Error('Wrong extracted file set');
for(const f of r.fileManifest){const b=fs.readFileSync(path.join(root,f.path));if(b.length!==f.bytes || hash(b)!==f.sha256)throw Error('Wrong extracted file: '+f.path);}
if(hash(fs.readFileSync(path.join(root,'index.mjs')))!=='b966eecbad19df0052eaa45e3ae0e7497b7d9da7ee2bab922e114486e01a6a57')throw Error('Wrong entry');
for(const f of r.nativeFiles){const b=fs.readFileSync(path.join(root,f.path));if(b.subarray(0,4).toString('hex')!=='7f454c46' || b.readUInt16LE(18)!==183)throw Error('Wrong native architecture');}
console.log('Verified all93 payload files and Linux ARM64 dependencies');
'@ | node -
if ($LASTEXITCODE -ne 0) { throw 'Extraction failed verification; DO NOT deploy.' }
```

6. **Owner-run, ONLY after publication/design approval and owner GitHub/provider/scheduler setup are resolved:** confirm existing linked portalapi is the function Vercel uses, then deploy the same verified directory. These commands preserve omitted deployed variables; they do not configure a token/provider/schedule. Do not add --env or change existing origins/secrets to force success.

```powershell
Set-Location $portalRoot
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

After backend verification, stop and request the separately approved frontend main publication. This guide never pushes a branch or edits deployed secrets/settings. Unrestricted old Settings/Results compatibility is not claimed; stale unsafe writes fail closed. Hosted behavior, native Windows and ARM64 execution are still owner-verified.
