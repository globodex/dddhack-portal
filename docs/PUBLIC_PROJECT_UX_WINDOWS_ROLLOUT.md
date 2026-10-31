# Held Windows rollout: public project UX

**Run only after explicit publication approval and this package commit is on main.** Agent packaging/verification only; no hosted DB read/write, migration, deployment, secret or origin change occurred. Use ONE fresh Windows PowerShell terminal for every block. Existing Git, Node (`--env-file`), linked/authenticated Neon CLI, Windows PowerShell/.NET ZipFile and private `.env.backend.local` are prerequisites. No Node-version check, Get-FileHash, Explorer extraction, new credentials or npm install inside the extracted Linux tree.

Exact package commit: `bd1c68c57da6c7464f9e290bd8d049dc8d17e19d`; runtime source: `7e6d02d8b658e1738c007ac53dcd6175907ff2c9`. Selecting the package commit in detached HEAD preserves the local main branch. Later guide/verification-only commits do not change its runtime.

**No new migration:** prior0110/0111 must already be applied. The read-only inspection below requires the complete17-entry plan with no pending migrations. If it finds pending work, STOP and use the earlier guarded migration rollout/recovery process; do not paste migration SQL or bypass the ledger. No apply command is part of this release.

1. **PowerShell, after approved main publication:** select the exact package without reset/force and preserve local configuration.

```powershell
$ErrorActionPreference = 'Stop'
$schemaVerified = $false
$verifiedSource = $null
Set-Location 'D:\Dev\dddhack-portal\dddhack-portal-migration'
$release = 'bd1c68c57da6c7464f9e290bd8d049dc8d17e19d'
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
$receipt = '.local/public-ux-check-' + [guid]::NewGuid().ToString('N') + '.json'
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
const expected='2ef518541ab8d6b17f2da7d2e755ffd72ee944e0ebf167e35c06bafff94ff790';
const r=JSON.parse(fs.readFileSync('artifacts/neon/receipt.json','utf8'));
if(hash(fs.readFileSync('artifacts/neon/portalapi.zip'))!==expected || r.sha256!==expected || r.runtimeSource!=='7e6d02d8b658e1738c007ac53dcd6175907ff2c9') throw Error('Wrong ZIP/source receipt; stop');
console.log('Verified approved ZIP');
'@ | node -
if ($LASTEXITCODE -ne 0) { throw 'Archive verification failed.' }
Add-Type -AssemblyName System.IO.Compression.FileSystem
$src = Join-Path (Get-Location).Path ('.local\portalapi-2ef51854-' + [guid]::NewGuid().ToString('N'))
if (Test-Path -LiteralPath $src) { throw 'Fresh extraction directory already exists.' }
[void][IO.Directory]::CreateDirectory((Split-Path -Parent $src))
[IO.Compression.ZipFile]::ExtractToDirectory((Resolve-Path '.\artifacts\neon\portalapi.zip').Path, $src)
$env:PORTAL_RELEASE_SRC = $src
@'
const fs=require('node:fs'), path=require('node:path'), crypto=require('node:crypto');
const root=process.env.PORTAL_RELEASE_SRC;
if(!root || !path.isAbsolute(root)) throw Error('Missing fresh extraction path');
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex');
if(hash('index.mjs')!=='5abf7de0d50d16b88f9d2dcef991cd6423b4a6cde16145d8256ef95911d6424d') throw Error('Wrong extracted index.mjs');
const native=[
 ['node_modules/@img/sharp-linux-arm64/lib/sharp-linux-arm64-0.35.5.node','6c3c549bd1bae0fe0b34832917a39950abd4db8feea874f8447ed07cded7854b'],
 ['node_modules/@img/sharp-libvips-linux-arm64/lib/libvips-cpp.so.8.18.7','97c2ae9a663cd3de58a34d68820994e49e0e261fddbd4616bd726a72610bbc8f']
];
for(const [name,expected] of native){const b=fs.readFileSync(path.join(root,name));if(hash(name)!==expected || b.subarray(0,4).toString('hex')!=='7f454c46' || b.readUInt16LE(18)!==183) throw Error('Wrong ARM64 dependency: '+name);}
const proof=JSON.parse(fs.readFileSync('artifacts/neon/verification.json','utf8'));
if(proof.archiveSha256!=='2ef518541ab8d6b17f2da7d2e755ffd72ee944e0ebf167e35c06bafff94ff790' || Object.keys(proof.archiveFiles).length!==93) throw Error('Wrong extraction manifest');
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

Confirm the active deployment is completed, then refresh the separately approved frontend. Verify project member details, direct comments and sharing using authorized data. No real comments or social posts are required for deployment verification. Public eligibility, voting, AI and reveal policy remain unchanged. No automatic resubmission or data repair occurs.

Validation limits: aggregate1,044 tests:1,036 passes, zero assertion failures, one cancelled D1 timeout, seven optional skips. The same D1 test passed independently in23.1s with timeout unchanged. This is not a clean aggregate. Targeted66, share/API rerun5, final focused11 passed; final typecheck/Webpack build and synthetic desktop/mobile checks passed. Independent bundle proof verifies100 exact-source inputs. Host smoke uses unchanged JavaScript with explicit host-native Sharp substitution, no DB/provider/SMTP credentials, blocked fetch/TCP/TLS/HTTP, and zero attempted outbound calls. Actual Linux ARM64 native execution, native Windows PowerShell/.NET execution and hosted end-to-end behavior remain unverified. Embedded Node verification checks were run against the actual ZIP/extracted tree, including rejection checks. No push/deploy/migration performed by the agent.
