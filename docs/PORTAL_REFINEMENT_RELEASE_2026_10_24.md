# Portal refinement release

This batch keeps the accepted Team Studio direction and brings discovery, public projects, submission history and admin review into the same visual system. It preserves the authentication migration, server permissions, scoring weights and three-submission limit. This document records local verification; a Git push or frontend deployment does not deploy the Neon backend.

## Implemented

- Shared logo, saved expression avatar, then black hamburger on every role and route. The full-screen menu has visible icons and red logout. Native sign-in navigation no longer races menu-history cleanup.
- Compact People and Teams identities, real member dialogs, public project cards, truthful empty/search states, stable eligible project routes, icon-only Share and one reusable sharing dialog. Homepage uses both requested hashtags and an actual hero screenshot for its social image.
- Full-width accuracy row, green Submit, concise attempt confirmation, centered success with authoritative submission count, conditional public actions, compact committed-version accordions and the requested Project toolbar. Private feedback remains below the history. Team display retains one colored initials badge.
- Admin Submissions and version-specific project review show persisted question/answer pairs, ecosystem/Cerebras answers and compact GitHub/deployment link rows. One eligibility section and a1–10 private score replace the redundant presentation. Removed rubric/assignment editors do not delete records or alter final computation.
- Going-only primary row Check in sits before the kebab, with no row confirmation; bulk retains confirmation. Team kebabs sit after their disclosure arrow. Registered-member addition and rename use scoped admin corrections even on locked teams, preserving existing limits and leader/history invariants.
- Authorized admins see voucher values directly on each paginated stock page, with Copy. Personal credits remain separately restricted. No real codes entered the evidence. The final stock status/search controls have equal48px desktop geometry and intentional stacked mobile spacing.
- Selected profile dialogs show actual saved facts within their visibility contract. The saved gender chip is public to the existing signed-in profile audience. OpenAI organization IDs are admin-only; phone/WhatsApp remain current-team/admin-only. Profession/organization and private bio/socials retain their existing consent boundaries. Directory list rows gain no private details.
- Strict numeric AI integration and mocked provider tests are implemented without activating a provider, fabricating scores or revealing results. Owner decisions that remain are listed separately in [AI/results decisions](AI_RESULTS_DECISIONS.md).

## Verification and exact scope

The production Next16.4.3 Turbopack build passed at `41de32bcb8f20818938bdabbcdb359ef712c9c6f`; the runtime/config source is unchanged by the following test, documentation and evidence commits. Standalone typecheck passed. The full sweep recorded681 cases:665 passed,9 failed,7 skipped. Seven outdated expectations were corrected to reflect authorized contracts; their parent failure and one Node24.19 WebAssembly test-process assertion account for the remaining failure records. The seven affected files were rerun:40 cases passed, zero failed. Accepted combined coverage is **674 passing,7 skipped**. This is not represented as a single clean invocation. The isolated migration rerun passed all six cases without a production change. [Raw logs and receipt](../evidence/refinement-release/validation.json) preserve the original failure evidence and replacement results.

The final combined actual Next browser proof covers desktop1440, mobile390 and targeted320×480. Its selected native images were viewed. The role-specific profile proof adds48 current public-gender checks. Existing native navigation, submission, admin action and direct-code proofs are retained with their own source revisions. No blanket all-page/all-device claim is made. The final fixture has no configured provider or frozen results, so current AI/final reveal screenshots are explicitly absent. Native multi-connection PostgreSQL tests, physical devices, actual Windows/ARM64 execution, hosted model access, paid evaluation and complete real Google login remain unverified. No new speed claim is made; the earlier matched production measurements remain separately source-bound.

## Current screenshots

Original PNGs and per-frame source/hash manifests are preserved. Final combined captures use synthetic records only; the rehearsal label is deliberate evidence context.

| Screen | Desktop | Mobile |
| --- | --- | --- |
| Admin Submissions | [1440](https://github.com/Param302/dddhack-portal/blob/bddb869f3209adcb6cc4ea6161014d51f340cd96/evidence/final-combined-ui/admin-submissions-desktop1440.png) | [390](https://github.com/Param302/dddhack-portal/blob/bddb869f3209adcb6cc4ea6161014d51f340cd96/evidence/final-combined-ui/admin-submissions-mobile390.png) |
| Admin project detail | [1440](https://github.com/Param302/dddhack-portal/blob/bddb869f3209adcb6cc4ea6161014d51f340cd96/evidence/final-combined-ui/admin-project-detail-desktop1440.png) | [390](https://github.com/Param302/dddhack-portal/blob/bddb869f3209adcb6cc4ea6161014d51f340cd96/evidence/final-combined-ui/admin-project-detail-mobile390.png) |
| People, compact | [1440](https://github.com/Param302/dddhack-portal/blob/bddb869f3209adcb6cc4ea6161014d51f340cd96/evidence/final-combined-ui/people-compact-1440x900.png) | [390](https://github.com/Param302/dddhack-portal/blob/bddb869f3209adcb6cc4ea6161014d51f340cd96/evidence/final-combined-ui/people-compact-390x844.png) |
| Teams | [1440](https://github.com/Param302/dddhack-portal/blob/bddb869f3209adcb6cc4ea6161014d51f340cd96/evidence/final-combined-ui/teams-desktop1440.png) | [390](https://github.com/Param302/dddhack-portal/blob/bddb869f3209adcb6cc4ea6161014d51f340cd96/evidence/final-combined-ui/teams-mobile390.png) |
| Public project detail | [1440](https://github.com/Param302/dddhack-portal/blob/bddb869f3209adcb6cc4ea6161014d51f340cd96/evidence/final-combined-ui/project-detail-desktop1440.png) | [390](https://github.com/Param302/dddhack-portal/blob/bddb869f3209adcb6cc4ea6161014d51f340cd96/evidence/final-combined-ui/project-detail-mobile390.png) |
| Share dialog | [1440](https://github.com/Param302/dddhack-portal/blob/bddb869f3209adcb6cc4ea6161014d51f340cd96/evidence/final-combined-ui/project-share-desktop1440.png) | [390](https://github.com/Param302/dddhack-portal/blob/bddb869f3209adcb6cc4ea6161014d51f340cd96/evidence/final-combined-ui/project-share-mobile390.png) |
| Profile, admin | [1440](https://github.com/Param302/dddhack-portal/blob/bddb869f3209adcb6cc4ea6161014d51f340cd96/evidence/discover-profile-completeness/public-gender/admin-bob-1440x900.png) | [390](https://github.com/Param302/dddhack-portal/blob/bddb869f3209adcb6cc4ea6161014d51f340cd96/evidence/discover-profile-completeness/public-gender/admin-bob-390x844.png) |
| Admin stock, aligned | [1440](https://github.com/Param302/dddhack-portal/blob/bddb869f3209adcb6cc4ea6161014d51f340cd96/evidence/final-combined-ui/stock-aligned-1440x900.png) | [390](https://github.com/Param302/dddhack-portal/blob/bddb869f3209adcb6cc4ea6161014d51f340cd96/evidence/final-combined-ui/stock-aligned-390x844.png) |

[Project toolbar](https://github.com/Param302/dddhack-portal/blob/bddb869f3209adcb6cc4ea6161014d51f340cd96/evidence/final-combined-ui/dashboard-project-toolbar-desktop1440.png), [mobile committed history](https://github.com/Param302/dddhack-portal/blob/bddb869f3209adcb6cc4ea6161014d51f340cd96/evidence/final-combined-ui/dashboard-project-history-mobile390.png), [Viewer profile](https://github.com/Param302/dddhack-portal/blob/bddb869f3209adcb6cc4ea6161014d51f340cd96/evidence/discover-profile-completeness/public-gender/stranger-bob-390x844.png), [current combined manifest](../evidence/final-combined-ui/final-manifest.json) and [profile proof](../evidence/discover-profile-completeness/README.md) provide further states. Stock-filter alignment follow-up is recorded separately in the combined evidence. Earlier superseded captures and stopped harness diagnostics are labeled in their README; they are not final accepted screens.

## Owner-run backend update

The final archive is [artifacts/neon/portalapi.zip](../artifacts/neon/portalapi.zip), SHA256 `ccf462c825655b78671dec4cecac78be5da5b77430f982f2275516246cab8b93`, built from API source `80a37a2e0930631617ed01ff47a629f7847b30ca`. All81 API source-input hashes match the final tree. Official bundling, graph/byte checks, two ARM64 ELF headers, host smoke and six PowerShell checks passed. [Archive verification](FINAL_NEON_API_ARCHIVE_VERIFICATION.md).

For the owner's reported nine-entry database, obtain a current verified restore checkpoint and use the [guarded incremental guide](NEON_POPULATED_UPGRADE_PLAN.md): fresh read-only inspect, **only0104 pending**, backup-confirmed apply, fresh post-inspect showing ten entries and none pending. Preserve the original seven legacy CRLF hashes and existing0102/0103 hashes. The guide also supports an independently verified older seven-entry target without resetting or replaying history.

Then, from the existing linked repository root in PowerShell, use the [Windows handoff](DESIGN_RELEASE_WINDOWS_DEPLOY.md):

```powershell
$portalApiBuild = .\scripts\prepare-backend-windows.ps1 -ArchivePath .\artifacts\neon\portalapi.zip
neon functions deploy portalapi --src $portalApiBuild.SourceDirectory --no-bundle --runtime nodejs24
```

Preserve `.env.backend.local`, the existing linked `.neon` target and the owner's `neon.windows.ts`. The targeted deployment deliberately omits `--env`; do not install packages inside the extracted ARM64 directory. Schema0104 plus this backend are required for new admin team corrections; direct admin code values, complete selected-profile facts and numeric AI readiness require the new backend. Until that manual deployment completes, publishing the frontend alone does not make those additions operational. Existing basic participant flows and permissions are retained. No agent ran a hosted migration, assigned production codes, deployed the backend or changed credentials.

Repository cleanup remains [audit-only](REPOSITORY_HYGIENE_AUDIT.md). The exact34 provisional branch candidates and loss risks are available for review; no branches, runtime assets or historical proofs were deleted.
