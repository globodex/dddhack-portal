# Windows backend archive handoff

Before deploying this reviewed backend, the owner must verify a current backup/restore checkpoint, inspect the exact intended populated target, apply only its actual pending set, and inspect again. The strict twelve-entry plan through `0106_admin_team_unlock.sql` is unchanged. An existing nine-entry ledger needs0104+0105+0106; ten needs0105+0106; eleven needs0106; twelve needs no apply. Require twelve entries and no pending work before rollout. Follow the executable [populated-upgrade guide](NEON_POPULATED_UPGRADE_PLAN.md). Never reset data, rewrite the ledger or bypass the restore prerequisite. No hosted migration or deployment was performed by this work. The ZIP contains no SQL and never migrates at startup.

Keep the working public origin `https://dddhack-portal.vercel.app` and current `APP_ORIGIN`/`NEON_API_ORIGIN` settings unchanged. This handoff does not load or replace their values.

Use the existing checkout already linked to the privately verified correct Neon project and branch, with the existing authenticated CLI. Keep its `.neon` context and `.env.backend.local` in place. `.neon` supplies target context; it is not build metadata and stays outside the Function directory. [Neon context reference](https://neon.com/docs/cli/link).

In PowerShell, from that repository root, first check the existing CLI version and help. The verified interface is CLI 8.11.1; do not substitute an unverified deployment flag.

```powershell
$ErrorActionPreference = 'Stop'
neon --version
if ($LASTEXITCODE -ne 0) { throw 'Existing Neon CLI is unavailable' }
neon functions deploy --help
if ($LASTEXITCODE -ne 0) { throw 'Deployment interface is unavailable' }
$portalApiBuild = .\scripts\prepare-backend-windows.ps1 -ArchivePath .\artifacts\neon\portalapi.zip
$portalApiBuild | Format-List
```

For a ZIP downloaded manually, pass its actual local path instead. The optional `-ArchiveUri` parameter downloads only from an operator-confirmed public HTTPS URL; no download URL is invented or embedded in the handoff. It rejects credential-bearing URLs and verifies the same pinned hash.

The helper copies or downloads the ZIP into a fresh folder, runs `Get-FileHash`, uses `Expand-Archive`, and validates the entry and ARM64 native files. The reviewed ZIP SHA256 is `9f16cda2e48f635251905cfb41669e35a41cf09c986e0507688a272bbd5ad626`. It fails before extraction if bytes differ. A rebuilt release with a different approved digest needs an explicitly reviewed handoff update.

Expected layout:

```text
repository-root/
  .neon                       existing target context, unchanged
  .env.backend.local          existing private file, unchanged
  artifacts/neon/
    portalapi.zip             reviewed input archive
    portalapi-prebuilt-<id>/
      portalapi.zip           verified local copy
      function/              SourceDirectory returned by the helper
        index.mjs
        node_modules/        complete packaged dependencies and ARM64 Sharp
```

This archive was freshly built from API/upgrade source `6da7b10372892cd6d126b7d092cabeeffe9f5e50`. Its approved twelve-entry source-plan digest is `73c64b0acbe9df80f9ca6627c0a1d4a3485c83214a6923918c530c1ab2b5d160`. After the owner completes and verifies the pending-only schema upgrade above, run this separate manual command from the same linked repository root:

```powershell
neon functions deploy portalapi --src $portalApiBuild.SourceDirectory --no-bundle --runtime nodejs24
```

Neon CLI8.11.1 help and the [official Functions reference](https://neon.com/docs/cli/functions) confirm `--src` accepts the extracted entry directory and `--no-bundle` packages it unchanged. There is no supported `neon deploy --prebuilt` option in the verified help. Do not pass the ZIP or its parent evidence folder as `--src`. Do not run `npm install` in the extracted tree; it already contains the reviewed Linux ARM64 dependencies. `receipt.json` and `build-metadata.json` are provenance files, not required CLI build metadata.

The command deliberately omits `--env`: existing deployed Function variables carry over, and the local `.env.backend.local` is neither loaded nor replaced. It does not reconcile `neon.ts` or pull environment files. File-based `neon deploy --env <file>` is a different full-policy workflow; `functions deploy --env` instead takes `KEY=VALUE`. [Environment semantics](https://neon.com/docs/compute/functions/environment-variables), [full-policy deployment reference](https://neon.com/docs/cli/deploy).

The [current archive verification](FINAL_NEON_API_ARCHIVE_VERIFICATION.md) and [local handoff test report](../evidence/registered-status-api-release/windows-handoff-report.json) record the matching release bytes and six passing checks using PowerShell7.6.8 on Linux, including the real reviewed ZIP and a synthetic environment-file sentinel. The HTTPS-download test uses an explicit transport mock. Actual Windows execution, real HTTPS artifact retrieval, hosted schema state, deployed environment values, correct target context and ARM64 runtime execution remain unverified. No environment values are printed or replaced by the preparation helper.

After the owner-run deployment succeeds, retain its returned deployment identifier privately. In an existing authenticated owner browser session, read `/api/health` and `/api/portal?view=%2Fadmin%2Faccess` on the configured public origin. The latter must return the owner-only access projection rather than `NOT_FOUND`; do not share its private account rows. A personally checked-in owner/admin can also read `/api/portal?view=%2Fpersonal%2Fcredits` to exercise the new stock tables without revealing/copying a code. These are read-only verification steps, not permission to change roles or credits. A health200 alone does not prove the new schema or deployment version. If Cloudflare denies a diagnostic client, report that denial separately; do not bypass it or call it an application failure.

Existing published categories may have already-checked-in recipients who were missed by the previous backend. The schema upgrade deliberately does not assign production codes. After publication, an authorized admin can review Available/Waiting in Credits and choose the existing **Assign waiting** action where appropriate. This explicit repair preserves prior allocations; no re-check-in, dummy restock or republish is required. No agent has run this action against hosted data.
