# Team analytics: Windows backend update

This follow-up adds no SQL migration. The backend still requires the previous release's fifteen-entry schema through0109. If0108/0109 have not been confirmed applied, stop and complete the guarded migration inspection/apply/post-inspection steps in sections2–4 of `ADMIN_OPERATIONS_AI_WINDOWS_ROLLOUT.md` first. Do not use that older guide's ZIP/extraction/deployment commands for this release. No migration runs automatically.

Use Windows PowerShell in your existing repository with the working Neon CLI login/project context. Preserve `.env.backend.local`, `neon.windows.ts`, APP_ORIGIN, NEON_API_ORIGIN and all deployed secrets. No `--env` flag or new credentials are required. No backup-creation or Node-version steps are part of this deployment-only guide. Commands were checked against source/package/CLI; native Windows execution was not available.

## 1. Update main and verify the exact ZIP

Stop if Git reports unexpected local code changes/conflicts; preserve them instead of resetting.

```powershell
$ErrorActionPreference = 'Stop'
Set-Location 'D:\Dev\dddhack-portal\dddhack-portal-migration'
git status --short
git fetch origin
if ($LASTEXITCODE -ne 0) { throw 'Fetch failed.' }
git switch main
if ($LASTEXITCODE -ne 0) { throw 'Switch failed; preserve local files.' }
git pull --ff-only origin main
if ($LASTEXITCODE -ne 0) { throw 'Pull failed; stop.' }

@'
const fs = require('node:fs'), crypto = require('node:crypto');
const digest = crypto.createHash('sha256').update(fs.readFileSync('artifacts/neon/portalapi.zip')).digest('hex');
if (digest !== 'e2fe6ef514c45cd6f52175b25ce10a4f569fbe08bb648181c7059e07cd97200d') throw Error('Wrong ZIP; stop');
console.log('Correct backend ZIP verified');
'@ | node -
if ($LASTEXITCODE -ne 0) { throw 'ZIP verification failed.' }
```

## 2. File Explorer — extract into a NEW folder

Right-click `artifacts\neon\portalapi.zip` → **Extract All**. Use this new, empty destination. Do not merge into an old folder or run npm installation inside the extracted bundle.

```text
D:\Dev\dddhack-portal\dddhack-portal-migration\.local\portalapi-e2fe6ef514c4
```

That folder must directly contain `index.mjs` and `node_modules`, not another nested `portalapi` directory.

## 3. Same PowerShell — verify the extracted source, then deploy

```powershell
@'
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const root = '.local/portalapi-e2fe6ef514c4';
const receipt = JSON.parse(fs.readFileSync('artifacts/neon/receipt.json', 'utf8'));
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
if (hash(path.join(root, 'index.mjs')) !== '45f6f7ba72839fa2015c4bf14b5412c778e424817182abcdd472c807dc397f67') throw Error('Wrong extracted index; stop');
for (const item of receipt.nativeFiles) {
  const file = path.join(root, item.path), bytes = fs.readFileSync(file);
  if (hash(file) !== item.sha256 || bytes.readUInt16LE(18) !== 183) throw Error('Wrong native dependency; stop');
}
if (!fs.statSync(path.join(root, 'node_modules')).isDirectory()) throw Error('Missing node_modules');
console.log('Extracted backend verified');
'@ | node -
if ($LASTEXITCODE -ne 0) { throw 'Extraction verification failed; do not deploy.' }

neon functions deploy portalapi --src .\.local\portalapi-e2fe6ef514c4 --no-bundle --runtime nodejs24
if ($LASTEXITCODE -ne 0) { throw 'Deployment failed; inspect its result.' }
neon functions get portalapi
if ($LASTEXITCODE -ne 0) { throw 'Could not check deployment.' }
```

Confirm the active deployment says completed, then reload the portal. Check the Team size1–5 filter, Approved counts and small participant totals beneath team cards. Yet to submit and Submitted remain separate lifecycle filters; fully approved locked teams in either later stage still count in the Approved analytics cohort. No paid evaluation is needed to verify this rollout.

## Exact package receipt

- Runtime source: `aede2eb7c595b2ddd0708bbd3337ab9e97dac21e`.
- ZIP SHA256: `e2fe6ef514c45cd6f52175b25ce10a4f569fbe08bb648181c7059e07cd97200d`,9,042,403 bytes.
- Index SHA256: `45f6f7ba72839fa2015c4bf14b5412c778e424817182abcdd472c807dc397f67`.
-93 entries; only index.mjs changed from the previous archive; all92 dependency/native files are identical.98 application inputs match the committed runtime source; fresh JavaScript bundle matches byte-for-byte. Env{} and zero warnings.
- Trusted health200/untrusted403/unconfigured portal503 with zero outbound attempts in a separate host smoke copy. Linux ARM64 native execution and owner-run hosted rollout remain unverified by the agent.
- No migration/schema changes in this follow-up; previous canonical plan digest remains `129ae4bc6c20a817b883d68229ee51a73a41998140b9bead2f4309a1c1b7b227`.
