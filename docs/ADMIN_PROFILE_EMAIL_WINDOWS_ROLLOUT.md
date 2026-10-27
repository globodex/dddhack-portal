# Admin profile email: Windows backend update

This release adds email only to selected profile lookups authorized as admin/owner, and renders it in the shared profile modal. Public cards, public project SSR and nonadmin selected profiles do not receive email. No new SQL migration or environment change is required. The existing schema through 0107 remains the prerequisite; if that earlier rollout is incomplete, use its guarded upgrade guide first. Do not rerun applied SQL.

1. **PowerShell**, in the existing repository. Stop on Git errors or conflicting local edits; preserve local environment/configuration files.

```powershell
Set-Location 'D:\Dev\dddhack-portal\dddhack-portal-migration'
git status --short
git fetch origin
git switch feat/portal-experience-rework
git pull --ff-only origin feat/portal-experience-rework
```

2. **PowerShell**: verify the exact new ZIP (no `Get-FileHash` required).

```powershell
@'
const fs = require('node:fs');
const crypto = require('node:crypto');
const actual = crypto.createHash('sha256').update(fs.readFileSync('artifacts/neon/portalapi.zip')).digest('hex');
if (actual !== '6c94e2ccd8ad3baeccc326c7e87c49e0b0900657012becad36b97505f89d0542') throw new Error('Wrong ZIP: stop');
console.log('Verified ZIP: ' + actual);
'@ | node -
if ($LASTEXITCODE -ne 0) { throw 'Archive verification failed; stop.' }
```

3. **File Explorer**: right-click `artifacts\neon\portalapi.zip` → **Extract All…**, into this NEW folder (do not combine with an older extracted bundle):

```text
D:\Dev\dddhack-portal\dddhack-portal-migration\.local\portalapi-6c94e2ccd8ad
```

4. **PowerShell**, from the repository above, using the existing authenticated/linked Neon CLI context. Verify the literal source directory, then deploy only this function. Do not run `npm install` in the extracted bundle and do not pass `--env`; preserve the working deployed origins and secrets.

```powershell
if (!(Test-Path '.\.local\portalapi-6c94e2ccd8ad\index.mjs') -or !(Test-Path '.\.local\portalapi-6c94e2ccd8ad\node_modules')) { throw 'Wrong extraction folder; stop.' }
neon functions deploy portalapi --src .\.local\portalapi-6c94e2ccd8ad --no-bundle --runtime nodejs24
if ($LASTEXITCODE -ne 0) { throw 'Deployment failed; stop and inspect the error.' }
```

5. Reload the portal. As admin, open a participant's profile with the info button and confirm email appears. As a nonadmin, confirm it does not. The frontend push alone cannot add this field to an older backend response.

Runtime source: `6cb9b2862fb992135491fcadca5795b63a9ed3f9`. ZIP SHA256: `6c94e2ccd8ad3baeccc326c7e87c49e0b0900657012becad36b97505f89d0542`. No agent-run hosted deployment or migration was performed. Host smoke substitutes host Sharp in a separate copy; native ARM64 execution and live rollout are unverified.
