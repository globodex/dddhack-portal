# Postrelease repository hygiene approval report

Fresh independent read of `https://github.com/Param302/dddhack-portal.git` at 2026-10-24T20:16:05.336268+00:00. Both published `main` and review `feat/portal-experience-rework` are `bddb869f3209adcb6cc4ea6161014d51f340cd96`. A second direct read confirmed the same two tips. This replaces the pre-release f543 snapshot. No remote branch, tag, local worktree or history was deleted; no provider/data action was performed.

## Four retained remote branches

| Branch | Exact tip | Tip committer time |
| --- | --- | --- |
| `feat/portal-experience-rework` | `bddb869f3209adcb6cc4ea6161014d51f340cd96` | 2026-10-24T20:10:46Z |
| `main` | `bddb869f3209adcb6cc4ea6161014d51f340cd96` | 2026-10-24T20:10:46Z |
| `test/dashboard-performance-source-audit` | `6fcb7d5be117d234ae60a4a4b04af966f9134af8` | 2026-10-24T15:38:22Z |
| `feat/devday-exchange-v1` | `dc92672c0e9a50ebcfe458f2e7c692058a1483b7` | 2026-10-24T13:29:50+05:30 |

The retention rule still selects main, the original development branch and the two newest other development/audit tips. There are 38 remote heads and 34 review candidates. The [exact 34-name TSV](REPOSITORY_HYGIENE_BRANCH_CANDIDATES.tsv) pins every candidate SHA, timestamp, reachability, patch risk and local ownership checkpoint. **No deletion is approved by this report. Recheck candidate tips immediately before any separately approved operation.**

## Concise approval groups

**Group A: four graph-merged candidates.** Their exact tips are reachable from both published refs, so deleting only these names loses no committed content/history reachable from main/review. Pending parent approval:

```text
v7/cloud-integration-20261023
release/v6-publish-20261023
fix/visual-correction-integration
fix/operational-owner-setup
```

**Group B: 16 patch-redundant candidates.** Their old commit identities are not graph-merged, but every non-merge patch has an equivalent in main. Removing these names can drop remote pointers to old commit identities; local worktrees remain. Pending parent approval:

```text
test/final-performance-current
test/perf-prod-final
test/perf-prod-baseline
feat/final-neon-archive
test/combined-migration-upgrade-audit
feat/public-seo-legal-drafts
feat/credit-stock-restock
test/credit-stock-independent-audit
feat/going-only-quick-checkin
test/quick-checkin-audit
feat/profile-experience
migration/qa
migration/storage
migration/auth
migration/ui
fix/filtered-participant-export
```

**Group C: 14 unique/uncertain candidates.** Do not delete without specific approval of the named branch and the recorded historical loss. Across this group there are 42 distinct unmatched patch commits. An unmatched patch ID can reflect evolved integration context; it does not by itself mean current production functionality is absent.

| Exact branch name | Unmatched patches | Historical loss or uncertainty |
| --- | --- | --- |
| `feat/projects-rules-experience` | 10 | Older score/vote proof images, manifests and capture scripts; current runtime files also differ. |
| `feat/team-studio-experience` | 3 | Three original TeamStudio layout patches; affected current runtime files have evolved. |
| `feat/admin-experience` | 5 | Five original admin/selection/hydration/access patches; files retained or evolved, exact old patches differ. |
| `test/owner-admin-access-audit` | 5 | Shares the five historical admin patches above; independent final audit itself is integrated. |
| `feat/project-media-inputs` | 1 | Original media patch and old0006 migration path; current canonical0103 is retained. Do not restore old SQL. |
| `feat/credit-inventory-ui` | 2 | Original inventory plan and before screenshots/reports missing from main; current UI has evolved. |
| `feat/landing-refinement` | 2 | Two old expression-placement patches; affected tip file is byte-identical to main. |
| `fix/live-submission-inputs` | 1 | Old intermediate-preview behavior and its verification JSON; current direct publish is different. |
| `feat/team-discovery-experience` | 1 | Original responsive Team card/style patch; affected files have evolved. |
| `feat/signin-email-experience` | 1 | Historical score-proof capture/preparation scripts missing from main. |
| `fix/client-form-hydration-safety` | 2 | Alternative client-only form wrapper, tests/docs and before/after security proof. Current shared guard is different. |
| `migration/neon-db` | 5 | Five original schema/auth/evaluator patches; paths exist with retained or evolved content. |
| `migration/nextjs` | 1 | Original proxy/config cleanup patch; files exist with retained or evolved content. |
| `v7/delhi-wide-preview-20261024` | 8 | Unused Delhi variation HTML/image, capture scripts and Library delivery/provenance receipts missing from main. |

The [unique commit/file manifest](repository-hygiene/REMOTE_UNIQUE_COMMITS_AND_FILES.json) records full commit IDs, subjects, branches, changed paths and exact blob comparison against published main. Each file is marked identical, changed, absent or deleted in that historical commit. This is a loss inventory, not an instruction to restore obsolete helpers or historical migrations. All local worktrees are preserved.

## Current worker integration verified

Checked 55 source/proof commits across 16 final worker/tool/archive groups. Results: 48 stable patch equivalents; five exact per-file added/removed-line matches whose surrounding import/layout context differs; one final navigation proof with all changed blobs identical; one local-only before-audit/spec commit. Every reviewed **final** head is retained in published main by patch or file-tree evidence.

| Group | Final local commit | Published retention proof |
| --- | --- | --- |
| Team correction backend | `c5b5ee5709e5de475b4cd61abe66d86ae493c4ad` | Patch → `e0a447a329159fb894738d03d0fb84b3bb48629d` |
| Guarded team upgrade tooling | `fa1e3f38b3cee7d63bbd7de87f908b08a1b2516c` | Patch → `fd67bba6b555538f46999bf32eb934e3389a27d3` |
| Submission controls and history | `cfc427dde6127b18047defdcfbc82b415f7ece14` | Patch → `8f507867140a0d01f4caf0191714871d5d4b183e` |
| Discovery/project cards | `1dc3aa7d9f17cc54b5bb7367c17ce09c123d9399` | Patch → `ef1eb9e227c0c2e441dc68ba2288b57e6a91470d` |
| Admin row/team corrections | `795a1a93b6b32b01f380d0fba875f916e2a0d154` | Patch → `532c2a4dc07accabfb2492df0d57627e32c24d0f` |
| Unified navigation | `5fe39f7aae488ff192510c44f5aa30ea6a491907` | Changed blobs identical |
| Actual hero OG | `4419d40a125ecd5a773c053c81ef764e5817c51d` | Patch → `13d596f8e61ef6252fd76339deabe0887f73a40e` |
| Public project sharing | `ea6796101221e962cf811b4e171bf35245f8d002` | Patch → `6f1800ebd0b20a0c0204022061d2c7618309c92d` |
| Profile completeness | `a01fe9d028d91f0d3111e6eaebced69fefc1bff8` | Patch → `355699af04ad814b4ebe88661bb5a4008f06a6b9` |
| Results and historical review | `e6463ac604722d506c1f529409b9ab7d847553ea` | Patch → `42a8a1351151503affca3336b56070e80307da61` |
| Admin direct credit values | `d84d4c9dc4493c18fa7e4b7615c2353f0cbd9e54` | Patch → `662aa69c52d38c1cbb9b5f8cb5c121bba0c42b3b` |
| Independent provider AI | `39d401616682ef4d590239dc1f5df15d41d12d30` | Patch → `43ef9dc0ca14bba0cd1b8964aba584ccd597cc60` |
| Independent direct credit review | `48fed02dd5cfb472ba8a5119864da5a9450796c3` | Patch → `6c85ecd264707e97338e74bef4b501fe4de0da62` |
| Final combined UI review | `9776be481ea1a33cb3b796f4aab1a03b9c0e91c6` | Patch → `2e68d60b9a80862dbc60d28802c05e66f0630d13` |
| Final backend archive | `65237de0e8e2cc6e78cdbaa1fc14d3b85511cb58` | Patch → `61f5866b90d346d27e79aab5411c5327f8b7ed58` |
| Previous durable hygiene audit | `ae698ae31226c7009b006405c0fb58c251e6c397` | Patch → `9f8e011e6b081691cb10d6a2bc6bc8e334326e5d` |

The [worker proof manifest](repository-hygiene/WORKER_INTEGRATION.json) contains all 55 checks and changed-file blobs. [Range-diff evidence](repository-hygiene/CONTEXT_ONLY_INTEGRATIONS.txt) resolves five context-only mismatches: admin actions, navigation, public sharing, Results and the credit CSS import. No source change was needed.

## Local-only material explicitly retained

- Navigation before-audit/spec commit `3c67986709bf281ae9617c8ba3c7a4335c7d4be0` is not integrated: original before screenshots, design spec and capture runner remain in local `feat/unified-navigation`. It changes no runtime files and is not one of the remote deletion candidates.
- Historical local branches also retain older admin patch identities, mobile stack proof, submission/confirmation integration variants, Home-boundary performance evidence and an unselected performance experiment. The [local-only manifest](repository-hygiene/LOCAL_ONLY_RETAINED.json) lists exact commits/paths and separates resolved context differences from unmatched history. These local branches/worktrees are not cleanup targets.
- Newly active `/workspace/ddd-repository-cleanup` (`chore/retained-tip-cleanup`) and the separate `chore/performance-evidence-cleanup` branch/worktree were created after the snapshot. They remain local and must be preserved until the owner publishes or closes them. This audit branch is also local-only.

## Separate image cleanup boundary

Root owns the exact image deletion manifest; this report makes no image deletions. The parent confirmed eight requested current native PNG deliveries. There is no requirement to deliver every obsolete historical PNG. Preserve current review/test evidence, all runtime public assets and actual homepage OG, checksum JSONs consumed by upgrade/tests, approved backend ZIP/receipts, Windows helpers/pins, historical SQL and LF rules. Do not blanket-delete evidence folders. No UI, scoring or backend source changed in this audit.
