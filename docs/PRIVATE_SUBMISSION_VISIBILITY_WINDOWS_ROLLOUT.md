# Held Windows rollout: private submission visibility

**Run only after explicit publication approval and this package commit is on main.** Agent packaging/verification only; no hosted DB read/write, migration, deployment, secret or origin change occurred. Use ONE fresh Windows PowerShell terminal for every block. Existing Git, Node (`--env-file`), linked/authenticated Neon CLI, Windows PowerShell/.NET ZipFile and private `.env.backend.local` are prerequisites. No Node-version check, Get-FileHash, Explorer extraction, new credentials or npm install inside the extracted Linux tree.

Exact package commit: `cf9deaf31c555f4d3e391467d769a974e1dd28b6`; runtime source: `e5d6ee699c40f932aed4ef084e1b203bc7ccbb26`. Selecting the package commit in detached HEAD preserves the local main branch. Later guide/verification-only commits do not change its runtime.

**No new migration:** prior0110/0111 must already be applied. The read-only inspection below requires the complete17-entry plan with no pending migrations. If it finds pending work, STOP and use the earlier guarded migration rollout/recovery process; do not paste migration SQL or bypass the ledger. No apply command is part of this release.

1. **PowerShell, after approved main publication:** select the exact package without reset/force and preserve local configuration.

```powershell
$ErrorActionPreference = 'Stop'
$schemaVerified = $false
$verifiedSource = $null
Set-Location 'D:\Dev\dddhack-portal\dddhack-portal-migration'
$release = 'cf9deaf31c555f4d3e391467d769a974e1dd28b6'
$remote = git remote get-url origin
if ($LASTEXITCODE -ne 0 -or $remote -notin @('https://github.com/Param302/dddhack-portal.git','git@github.com:Param302/dddhack-portal.git')) { throw 'Wrong repository; stop.' }
git diff --quiet
if ($LASTEXITCODE -ne 0) { throw 'Preserve tracked local edits first; do not reset.' }
git diff --cached --quiet
if ($LASTEXITCODE -ne 0) { throw 'Preserve staged edits first.' }
git fetch origin refs/heads/main:refs/remotes/origin/main
if ($LASTEXITCODE -ne 0) { throw 'Fetch failed.' }
git merge-base --is-ancestor $release origin/main
if ($LASTEXITCODE -ne 0) { throw 'This package is not published on main; stop.' }
git switch --detach $release
if ($LASTEXITCODE -ne 0) { throw 'Safe checkout failed; preserve local files.' }
if ((git rev-parse HEAD).Trim() -ne $release) { throw 'Wrong release.' }
if (-not (Test-Path '.\node_modules\tsx')) {
    npm ci
    if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
}
node scripts/verify-migration-checkout.mjs --check
if ($LASTEXITCODE -eq 2) {
    node scripts/verify-migration-checkout.mjs --repair-line-endings
    if ($LASTEXITCODE -ne 0) { throw 'Line-ending repair refused; stop.' }
} elseif ($LASTEXITCODE -ne 0) { throw 'Migration source check failed.' }
```

2. **Same terminal; read-only schema prerequisite.** In Neon Console → Connect → pooling OFF, independently read the intended direct host, database and role. Enter those three nonsecret values below, not a URL/password. Existing process connection variables override the env file; resolve any mismatch privately rather than deriving expected values from the effective URL.

```powershell
$env:MIGRATION_EXPECTED_HOST = Read-Host 'Intended DIRECT host only, from Neon Connect'
$env:MIGRATION_EXPECTED_DATABASE = Read-Host 'Intended database name, from Neon Connect'
$env:MIGRATION_EXPECTED_ROLE = Read-Host 'Intended database role, from Neon Connect'
$receipt = '.local/private-index-check-' + [guid]::NewGuid().ToString('N') + '.json'
node --env-file=.env.backend.local --import tsx neon/scripts/upgrade-populated.ts --inspect-populated --receipt $receipt
if ($LASTEXITCODE -ne 0) { throw 'Read-only inspection failed; do not deploy.' }
$state = Get-Content -Raw $receipt | ConvertFrom-Json
if ($state.planDigest -ne '3c173216603f6a2927903493e29bfbe629dcaddf67cbcd322196f3153f6bffd5' -or @($state.ledger).Count -ne 17 -or @($state.pending).Count -ne 0) { throw 'Prior schema prerequisites not confirmed; stop for guarded migration review.' }
$schemaVerified = $true
```

3. **Same terminal:** verify ZIP, automatically extract into a fresh GUID directory, then verify ALL93 extracted files, entry and ARM64 native bytes. No old folder is overwritten.

```powershell
@'
const fs=require('node:fs'), crypto=require('node:crypto');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const expected='21dde7d6fea1e7df23b5a0508a93995e7902acbd01561732625906b23ef1c1dc';
const r=JSON.parse(fs.readFileSync('artifacts/neon/receipt.json','utf8'));
if(hash(fs.readFileSync('artifacts/neon/portalapi.zip'))!==expected || r.sha256!==expected || r.runtimeSource!=='e5d6ee699c40f932aed4ef084e1b203bc7ccbb26') throw Error('Wrong ZIP/source receipt; stop');
console.log('Verified approved ZIP');
'@ | node -
if ($LASTEXITCODE -ne 0) { throw 'Archive verification failed.' }
Add-Type -AssemblyName System.IO.Compression.FileSystem
$src = Join-Path (Get-Location).Path ('.local\portalapi-21dde7d6-' + [guid]::NewGuid().ToString('N'))
if (Test-Path -LiteralPath $src) { throw 'Fresh extraction directory already exists.' }
[void][IO.Directory]::CreateDirectory((Split-Path -Parent $src))
[IO.Compression.ZipFile]::ExtractToDirectory((Resolve-Path '.\artifacts\neon\portalapi.zip').Path, $src)
$env:PORTAL_RELEASE_SRC = $src
@'
const fs=require('node:fs'), path=require('node:path'), crypto=require('node:crypto');
const root=process.env.PORTAL_RELEASE_SRC;
if(!root || !path.isAbsolute(root)) throw Error('Missing fresh extraction path');
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex');
if(hash('index.mjs')!=='a97d70c7c2e1e16fe2f8312fbe9781f8ddf5c89db6f64245ef9998e928630dd4') throw Error('Wrong extracted index.mjs');
const native=[
 ['node_modules/@img/sharp-linux-arm64/lib/sharp-linux-arm64-0.35.5.node','6c3c549bd1bae0fe0b34832917a39950abd4db8feea874f8447ed07cded7854b'],
 ['node_modules/@img/sharp-libvips-linux-arm64/lib/libvips-cpp.so.8.18.7','97c2ae9a663cd3de58a34d68820994e49e0e261fddbd4616bd726a72610bbc8f']
];
for(const [name,expected] of native){const b=fs.readFileSync(path.join(root,name));if(hash(name)!==expected || b.subarray(0,4).toString('hex')!=='7f454c46' || b.readUInt16LE(18)!==183) throw Error('Wrong ARM64 dependency: '+name);}
const proof=JSON.parse(fs.readFileSync('artifacts/neon/verification.json','utf8'));
if(proof.archiveSha256!=='21dde7d6fea1e7df23b5a0508a93995e7902acbd01561732625906b23ef1c1dc' || Object.keys(proof.archiveFiles).length!==93) throw Error('Wrong extraction manifest');
for(const [name,expected] of Object.entries(proof.archiveFiles)) if(hash(name)!==expected) throw Error('Extracted file mismatch: '+name);
const walk=p=>fs.readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(p,e.name)):[path.join(p,e.name)]);
if(walk(root).length!==93) throw Error('Unexpected extracted files');
console.log('Verified all 93 extracted files. Deploy source: '+root);
'@ | node -
if ($LASTEXITCODE -ne 0) { throw 'Extraction verification failed; do not deploy.' }
$verifiedSource = $src
```

4. **Same terminal; owner-run deployment.** Keep existing Neon linkage, `.env.backend.local`, `.neon`, `neon.windows.ts`, origins and deployed secrets. First `get` must identify the existing portalapi/function URL used by Vercel. If it is unexpected, stop. Do not switch cloud project/branch or edit env to force a pass.

```powershell
if ($schemaVerified -ne $true) { throw 'Complete the schema prerequisite check in step2 first.' }
if ([string]::IsNullOrWhiteSpace($src) -or $src -cne $verifiedSource -or -not (Test-Path -LiteralPath (Join-Path $src 'index.mjs'))) { throw 'Use the verified fresh source from step3 in this same terminal.' }
neon functions get portalapi
if ($LASTEXITCODE -ne 0) { throw 'Cannot identify the existing function; stop.' }
if ((Read-Host 'Type DEPLOY only if that is the existing backend used by Vercel') -cne 'DEPLOY') { throw 'Deployment cancelled.' }
neon functions deploy portalapi --src "$src" --no-bundle --runtime nodejs24
if ($LASTEXITCODE -ne 0) { throw 'Deployment failed or outcome unconfirmed; inspect before retry.' }
neon functions get portalapi
if ($LASTEXITCODE -ne 0) { throw 'Could not confirm deployment metadata.' }
```

Confirm the active deployment is completed, then refresh the separately approved frontend. Check the existing submissions/history; **do not resubmit real projects for diagnosis**. Legacy unindexed rows appear privately as read-only recovery history; indexed analytics still exclude them explicitly. Any index repair needs separate owner approval. Public eligibility policy remains unchanged.

Optional **READ ONLY**, Neon SQL Editor connected to the same intended backend database: run `docs/PRIVATE_SUBMISSION_READ_ONLY_CHECK.sql` (copied below). It returns aggregate counts, no participant/profile/project payloads. This was tested on synthetic local SQLite/PGlite only, never production. It changes nothing and does not repair anything.

```sql
-- Owner-run READ ONLY against the actual portal database; no email/payload/secret output.
-- Versions are committed records, not drafts. Removed/terminal teams and removed versions are excluded.
WITH visible_versions AS (
  SELECT v.id,v.team_id
  FROM submission_versions v JOIN teams t ON t.id=v.team_id
  WHERE NOT EXISTS(SELECT 1 FROM record_removals r WHERE r.kind='team' AND r.target_id=t.id AND r.active=1)
    AND NOT EXISTS(SELECT 1 FROM terminal_record_deletions d WHERE d.kind='team' AND d.target_id=t.id)
    AND NOT EXISTS(SELECT 1 FROM record_removals r WHERE r.kind='submission' AND r.target_id=v.id AND r.active=1)
)
SELECT count(*) AS committed_versions,
       count(DISTINCT v.team_id) AS teams_with_committed_versions,
       COALESCE(sum(CASE WHEN p.id IS NULL THEN 1 ELSE 0 END),0) AS versions_without_project_record,
       count(DISTINCT CASE WHEN p.id IS NULL THEN v.team_id END) AS teams_without_project_record
FROM visible_versions v LEFT JOIN projects p ON p.team_id=v.team_id;

-- Distinguishes drafts, committed pointers and a dangling pointer without returning project contents.
SELECT count(*) AS project_records,
       count(published_version_id) AS records_with_published_pointer,
       COALESCE(sum(CASE WHEN published_version_id IS NOT NULL AND NOT EXISTS(
         SELECT 1 FROM submission_versions v WHERE v.id=p.published_version_id AND v.team_id=p.team_id
       ) THEN 1 ELSE 0 END),0) AS invalid_published_pointers
FROM projects p;
```

Validation limits: application1039 tests /1032pass /0fail /7optional native PostgreSQL skips; final typecheck/Webpack build and synthetic desktop/mobile checks passed. Independent bundle proof verifies100 source inputs. Host smoke uses unchanged JavaScript with an explicit host-native Sharp substitution and no DB/provider/SMTP credentials; fetch/TCP/TLS/HTTP are blocked, with zero attempted outbound calls. Actual Linux ARM64 loading/system libraries, native Windows PowerShell/.NET execution and hosted end-to-end behavior remain owner-verified. The guide's embedded Node checks were executed locally against the real ZIP/extracted files; this does not claim native Windows acceptance. No push/deploy/migration has been performed by the agent.
