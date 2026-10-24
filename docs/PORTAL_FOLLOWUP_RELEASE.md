# Portal follow-up release

Validated source: `3e17119a02f5009042e48749255e91bf05481798`. The current backend archive matches all 83 application input hashes. No hosted database migration, provider operation, paid evaluation or backend deployment was performed.

The release includes confirmation-free upvotes and incremental project loading from the previous published checkpoint; CSV email-column detection and Luma prefills; full-height Home stacking, official OpenAI × Cerebras branding, the requested GitHub portrait and current-hero OG; safely enriched Home arrival details; and confirmed single-person/team deletion with atomic cascades and durable attempt counts. Admin failures remain contextual, including rapid confirmation taps on short mobile screens.

## Validation

The initial full sweep reported 730 passed, 12 failed and 7 native PostgreSQL skips. It exposed outdated fixture/UI expectations, a missing legacy Drizzle migration mirror, and one native Node/V8 WebAssembly process assertion. These were retained as failures rather than called a clean run. Final reruns passed 41/41 affected checks, 3/3 verified-content checks and 8/8 settings contracts. The PGlite rerun used the test-only `--no-wasm-code-gc` flag; deployed Node options were not changed. Across the sweep and focused reruns, **746 distinct checks passed**, all previously failing assertions were recovered, and 7 optional native PostgreSQL cases remain unexecuted. This is aggregate evidence, not one clean final full-suite invocation.

The actual production build passed on the validated source. Browser evidence includes 67 Home checks, 11 CSV/onboarding checks, 40 venue API cases plus 4 SSR checks and 10 browser roles, and 15 deletion/touch checks. These use synthetic data and Chromium emulation, not hosted credentials or physical devices. The deletion screenshots exclude failed/superseded frames. All historical SQL remains byte-identical, and every new author and committer uses the requested identity. The [machine-readable receipt](../evidence/portal-followup-release/validation.json) records exact coverage, source and limits.

## Manual backend rollout

The fresh ZIP is `artifacts/neon/portalapi.zip`, SHA256 `ea9b0a2f9f99de33626cdffd7dafbe096eee6f3812ffe7d56cfc5793856d1dcb`. Its 93 files fit the official limits; fresh JavaScript equality, AArch64 headers, outbound-blocked host smoke and six PowerShell staging checks pass. Actual ARM64 and native Windows execution remain unverified.

Follow [the guarded populated upgrade](NEON_POPULATED_UPGRADE_PLAN.md): verify a current backup/restore checkpoint, fresh-inspect the intended target, apply only pending 0104/0105 for a nine-entry ledger or only 0105 for a ten-entry ledger, then verify eleven entries and unchanged old checksums. The new backend actor requires 0105. Do not deploy it against an older schema. No synthetic flag, reset, ledger rewrite or env replacement is part of this procedure.

After those checks, use the existing linked checkout and CLI:

```powershell
$portalApiBuild = .\scripts\prepare-backend-windows.ps1 -ArchivePath .\artifacts\neon\portalapi.zip
neon functions deploy portalapi --src $portalApiBuild.SourceDirectory --no-bundle --runtime nodejs24
```

The [Windows handoff](DESIGN_RELEASE_WINDOWS_DEPLOY.md) preserves the existing `.neon` context and deployed variables. The deployment command deliberately has no `--env` flag. Frontend publication alone does not complete this backend rollout.

## Current visual evidence

- [Home: six desktop/mobile PNGs](https://filebin.net/dddhack-1092f8e93a4a45698f33/dddhack-home-followup-4e09abe-20261024T221113Z.zip)
- [CSV/prefill: eight PNGs](https://filebin.net/dddhack-1092f8e93a4a45698f33/dddhack-csv-prefill-be7da40-20261024T222131Z-63ca0eb3.zip)
- [Venue roles: nine PNGs](https://filebin.net/ddd-venue-d04da9fc956181fd41a1/venue-final-4a9-synthetic.zip)
- [Deletion flows: 22 PNGs](https://filebin.net/ddd-admin-deletion-20261024-0d8929f-b4c91e/admin-deletion-browser-proof-0d8929f-png-only.zip)
- [Published project-scroll/upvote checkpoint: 15 PNGs](https://filebin.net/dddhack-1092f8e93a4a45698f33/dddhack-project-scroll-3fee26d.zip)

Each screenshot-only archive was separately downloaded and hash-verified. Links expire 31 October 2026; exact expiry/source/hash appears in the lane evidence. They contain fake fixture identities and a synthetic room, not the real private venue. Originals remain outside Git. Only required runtime logos, portrait and OG image were committed.

## Explicit remaining boundaries

Restore still means unremoving saved history; whether a previous version should become current requires a decision. Its requested two-button redesign is not implemented. Separate monument entrances are not implemented because the artwork is flattened. The [AI snapshot-approval and automatic queue gaps](AI_EVALUATION_OUTSTANDING.md) remain unfinished, with no hosted model-access claim or new scoring defaults. Terminal cascades remove serving/media metadata but do not erase physical private bucket objects. Minimal auth/audit identity and existing immutable audit/release history remain as documented in the [deletion contract](TERMINAL_RECORD_DELETION.md).
