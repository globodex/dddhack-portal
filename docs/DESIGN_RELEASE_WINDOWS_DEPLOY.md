# Windows backend archive handoff

The following stages the reviewed Function ZIP locally. Deployment is a separate owner-operated step. Complete the approved populated-database backup/checkpoint, target/ledger inspection, pending-only upgrade for `0102_credit_stock.sql` and `0103_project_media_limits.sql`, and post-upgrade inspection before publishing this backend or the dependent frontend. Follow the executable [populated-upgrade handoff](NEON_POPULATED_UPGRADE_PLAN.md) for those commands and its private target guards. A backup checkpoint is an owner's restore verification, not a tool-verified claim. No hosted migration or deployment was performed by this work.

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

The helper copies or downloads the ZIP into a fresh folder, runs `Get-FileHash`, uses `Expand-Archive`, and validates the entry and ARM64 native files. The reviewed ZIP SHA256 is `bbd047173fb4e895bd8148d24674548f05dfaea58e184ca57bcc0e183ca60382`. It fails before extraction if bytes differ. A rebuilt release with a different approved digest needs an explicitly reviewed handoff update.

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

After the owner has completed the release prerequisites, run this separate manual command from the same linked repository root:

```powershell
neon functions deploy portalapi --src $portalApiBuild.SourceDirectory --no-bundle --runtime nodejs24
```

Neon CLI8.11.1 help and the [official Functions reference](https://neon.com/docs/cli/functions) confirm `--src` accepts the extracted entry directory and `--no-bundle` packages it unchanged. There is no supported `neon deploy --prebuilt` option in the verified help. Do not pass the ZIP or its parent evidence folder as `--src`. Do not run `npm install` in the extracted tree; it already contains the reviewed Linux ARM64 dependencies. `receipt.json` and `build-metadata.json` are provenance files, not required CLI build metadata.

The command deliberately omits `--env`: existing deployed Function variables carry over, and the local `.env.backend.local` is neither loaded nor replaced. It does not reconcile `neon.ts` or pull environment files. File-based `neon deploy --env <file>` is a different full-policy workflow; `functions deploy --env` instead takes `KEY=VALUE`. [Environment semantics](https://neon.com/docs/compute/functions/environment-variables), [full-policy deployment reference](https://neon.com/docs/cli/deploy).

The [local handoff test report](../evidence/neon-host-archive/windows-handoff-report.json) records six passing checks using PowerShell7.6.8 on Linux, including the real reviewed ZIP and a synthetic environment-file sentinel. The HTTPS-download test uses an explicit transport mock. Actual Windows execution, real HTTPS artifact retrieval, hosted schema state, deployed environment values, correct target context and ARM64 runtime execution remain unverified. No environment values are printed or replaced by the preparation helper.

After the owner-run deployment succeeds, retain its returned deployment identifier privately. In an existing authenticated owner browser session, read `/api/health` and `/api/portal?view=%2Fadmin%2Faccess` on the configured public origin. The latter must return the owner-only access projection rather than `NOT_FOUND`; do not share its private account rows. A personally checked-in owner/admin can also read `/api/portal?view=%2Fpersonal%2Fcredits` to exercise the new stock tables without revealing/copying a code. These are read-only verification steps, not permission to change roles or credits. A health200 alone does not prove the new schema or deployment version. If Cloudflare denies a diagnostic client, report that denial separately; do not bypass it or call it an application failure.

Existing published categories may have already-checked-in recipients who were missed by the previous backend. The schema upgrade deliberately does not assign production codes. After publication, an authorized admin can review Available/Waiting in Credits and choose the existing **Assign waiting** action where appropriate. This explicit repair preserves prior allocations; no re-check-in, dummy restock or republish is required. No agent has run this action against hosted data.
