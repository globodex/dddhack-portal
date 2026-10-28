# Admin operations and owner AI: Windows rollout (review candidate)

**Not published or deployed. Do not run these steps until this batch is approved and published.** The owner runs the database upgrade and Neon deployment; the agent has not connected to hosted data.

Prerequisites: existing Windows PowerShell repository, Node/npm dependencies, authenticated/linked Neon CLI, the correct direct `DATABASE_URL_UNPOOLED` in the existing private `.env.backend.local`, and a genuinely verified recovery checkpoint before any pending migration. Keep the working origins, proxy secret, API key, Google, SMTP and credit configuration unchanged. No new credential is required. Process environment variables override `--env-file`; a target mismatch must be investigated, never bypassed.

This combined batch adds0108 (scoped admin testing/corrections) and0109 (owner model selection and prospective usage). A database already through0107 should have only those two pending. If inspection shows none pending, skip apply. If an older migration is pending, check the earlier rollout before continuing. Never paste raw DDL or edit ledger checksums.

## 1. PowerShell — update the approved checkout

Stop if Git reports conflicts or local edits that would be overwritten. Preserve `.env.backend.local` and `neon.windows.ts`.

```powershell
Set-Location 'D:\Dev\dddhack-portal\dddhack-portal-migration'
git status --short
git fetch origin
if ($LASTEXITCODE -ne 0) { throw 'Fetch failed; stop.' }
git switch feat/portal-experience-rework
if ($LASTEXITCODE -ne 0) { throw 'Switch failed; preserve local files and stop.' }
git pull --ff-only origin feat/portal-experience-rework
if ($LASTEXITCODE -ne 0) { throw 'Pull failed; stop.' }
npm ci
if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed; stop.' }
node scripts/verify-migration-checkout.mjs --check
if ($LASTEXITCODE -ne 0) { throw 'SQL checkout check failed; stop.' }
node --import tsx neon/scripts/upgrade-populated.ts --plan
if ($LASTEXITCODE -ne 0) { throw 'Source plan failed; stop.' }
```

Expected plan: fifteen entries, digest `129ae4bc6c20a817b883d68229ee51a73a41998140b9bead2f4309a1c1b7b227`. All published SQL through0107 and the seven recognized historical Windows ledger aliases are preserved.

## 2. Neon Console — confirm target and recovery

Open the intended project's **Connect** dialog with pooling **off**. Independently note its host, database and role. Do not copy a URL or password into chat. Before applying anything, create a recovery copy/backup of the current populated target and verify recovery in a separate disposable destination, including existing participants, memberships and submissions. Record its real identifier. A branch label, an old backup or a successful inspect alone does not prove restoration.

## 3. PowerShell — fresh read-only inspection

```powershell
$env:MIGRATION_EXPECTED_HOST = (Read-Host 'Direct host from the intended Neon target').Trim()
$env:MIGRATION_EXPECTED_DATABASE = (Read-Host 'Database from the intended target').Trim()
$env:MIGRATION_EXPECTED_ROLE = (Read-Host 'Role from the intended target').Trim()
$receipt = '.local\admin-ops-inspect-' + [guid]::NewGuid().ToString('N') + '.json'
node --env-file=.env.backend.local --import tsx neon/scripts/upgrade-populated.ts --inspect-populated --receipt $receipt
if ($LASTEXITCODE -ne 0) { throw 'Inspection failed; do not apply.' }
```

Read the printed `pending` list. An existing populated13-entry target should show0108 and0109. These commands do not change database data. Keep this terminal open so the freshly defined receipt and independent target values are available in the next step.

## 4. PowerShell — apply only if pending, then inspect again

Skip the apply command when `pending` is empty. Run the following only after the real recovery verification in step2. Minimize writes/sign-ins to the target between inspection and apply. If it reports `UPGRADE_DATABASE_CHANGED_SINCE_INSPECTION`, stop and arrange a quiet window; do not bypass the guard or loop blindly.

```powershell
$inspection = Get-Content -LiteralPath $receipt -Raw | ConvertFrom-Json
if (@($inspection.pending).Count -gt 0) {
    $checkpoint = (Read-Host 'Identifier of the recovery checkpoint you restored and verified').Trim()
    if (!$checkpoint) { throw 'A real recovery identifier is required.' }
    if ((Read-Host 'Type RESTORE VERIFIED only if restoration was genuinely verified') -cne 'RESTORE VERIFIED') { throw 'Recovery not confirmed; stop.' }
    node --env-file=.env.backend.local --import tsx neon/scripts/upgrade-populated.ts --apply-populated --receipt $receipt --backup-checkpoint $checkpoint --confirm-restore-verified
    if ($LASTEXITCODE -ne 0) { throw 'Upgrade outcome not confirmed; inspect the ledger before any retry.' }
}
$postReceipt = '.local\admin-ops-post-' + [guid]::NewGuid().ToString('N') + '.json'
node --env-file=.env.backend.local --import tsx neon/scripts/upgrade-populated.ts --inspect-populated --receipt $postReceipt
if ($LASTEXITCODE -ne 0) { throw 'Post-inspection failed; stop.' }
```

Require fifteen ledger entries and `pending: []` before deploying this backend. The guarded helper preserves historical rows/checksums and applies only the pending suffix inside the existing transaction/locking protections.

## 5. PowerShell, then File Explorer — verify and extract the exact ZIP

No `Get-FileHash` or fragile `node -e` quoting is used.

```powershell
@'
const fs = require('node:fs');
const crypto = require('node:crypto');
const hash = crypto.createHash('sha256').update(fs.readFileSync('artifacts/neon/portalapi.zip')).digest('hex');
if (hash !== 'a63f43009afc8df75f7d29783ed8e44759740aaf4ea4d003034bed59bf4834a0') throw Error('Wrong ZIP; stop');
console.log('Verified exact ZIP');
'@ | node -
if ($LASTEXITCODE -ne 0) { throw 'Archive verification failed.' }
```

In **File Explorer**, right-click `artifacts\neon\portalapi.zip` → **Extract All** into this **new**, empty folder. Do not merge with an earlier extracted bundle or run npm installation inside it.

```text
D:\Dev\dddhack-portal\dddhack-portal-migration\.local\portalapi-a63f43009afc
```

Verify the actual extracted index and all packaged native files before using that source path:

```powershell
@'
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const root = '.local/portalapi-a63f43009afc';
const receipt = JSON.parse(fs.readFileSync('artifacts/neon/receipt.json', 'utf8'));
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
if (hash(path.join(root, 'index.mjs')) !== '7225eaa89620c2670f0f1be3406fb9a914b9bb868c6120b901ab92c1742dabf5') throw Error('Wrong extracted index; stop');
for (const item of receipt.nativeFiles) {
  const file = path.join(root, item.path), bytes = fs.readFileSync(file);
  if (hash(file) !== item.sha256 || bytes.readUInt16LE(18) !== 183) throw Error('Wrong native file; stop');
}
if (!fs.statSync(path.join(root, 'node_modules')).isDirectory()) throw Error('Missing node_modules');
console.log('Verified extracted source and ARM64 native file hashes');
'@ | node -
if ($LASTEXITCODE -ne 0) { throw 'Extracted source verification failed.' }
```

## 6. PowerShell — owner-run targeted deployment

Use the existing authenticated/linked Neon CLI context. This literal source folder contains both `index.mjs` and `node_modules`. Do not pass `--env`, replace the working config, change origins, or use stale `$portalApiBuild` variables.

```powershell
neon functions deploy portalapi --src .\.local\portalapi-a63f43009afc --no-bundle --runtime nodejs24
if ($LASTEXITCODE -ne 0) { throw 'Deployment failed; inspect its result.' }
neon functions get portalapi
```

Confirm its active deployment completed. Reload the frontend after its separately approved publication. Verify the five Team Sizes choices, top personal/eligible venue, and admin corrections with synthetic test teams. Admin leaders' time override retains check-in/profile, frozen-result and three-attempt safeguards; removing their test project does not reset attempts. Owner → Settings → Results shows model/usage; another admin must not receive its model settings or model-bearing evaluation metadata. Do not run a paid evaluation merely to verify deployment.

Owner usage is prospective returned portal telemetry, not historical billing. Unknown token fields and charged cost stay unavailable. Saving a model ID does not verify API access. Native ARM64 execution, hosted upgrade/deployment and live model access are not agent-verified.

Runtime source: `63075adf6e309877803af1d66fa0d4273b29be88`. The package receipt binds all98 application inputs to this exact committed snapshot; later documentation/receipt commits need not alter runtime bytes. Shell commands were checked against the repository CLI and package contents; no native Windows execution was available in this Linux environment.
