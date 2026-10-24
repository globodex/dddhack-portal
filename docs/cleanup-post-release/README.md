# Retained-tip image cleanup

The exact source inventories were re-read after release `bddb869f3209adcb6cc4ea6161014d51f340cd96`. They cover main/review at that same tip, the retained performance audit at `6fcb7d5be117d234ae60a4a4b04af966f9134af8`, and the original Sites branch at `dc92672c0e9a50ebcfe458f2e7c692058a1483b7`. No remote branch is deleted by these file commits. The separate branch-risk review must approve exact names and expected tips before any remote branch deletion.

| Retained tip | Generated image copies removed | Image bytes removed from that tip |
| --- | --- | --- |
| main and review, identical tree | 2,198 |181,474,626 (181.5 MB /173.1 MiB) |
| performance audit |1,482 |129,925,052 (129.9 MB /123.9 MiB) |
| original Sites branch |0 |0; its19 images are runtime assets |

These are working-tree savings for separate tips, not an additive reduction in Git object storage. Main and review share a tree, and branches share many blobs. Ordinary deletion preserves every historical commit and does not guarantee a smaller full clone. No history rewrite, local worktree deletion, provider deployment removal or hosted data change is part of this cleanup.

The parent confirmed native Library delivery of the eight requested current admin Submissions/detail, stock and admin-profile images. Their original file paths are recorded in [image-plan.json](image-plan.json); Library IDs remain with the parent and are not guessed here. Obsolete/unneeded capture and mock images are removed from tips. Every removed byte remains addressable at the recorded immutable source commit.

## Exact files and exceptions

- [Main/review deletion manifest](main-review-images-delete.tsv): exact path, Git blob and byte count for every removed image. [Preserved image manifest](main-review-images-preserve.tsv).
- [Performance deletion manifest](performance-audit-images-delete.tsv) and [preserved image manifest](performance-audit-images-preserve.tsv).
- [Sites inventory](sites-images-preserve.tsv); its deletion manifest is intentionally empty.

All22 current public runtime images stay: approved Delhi/Metro artwork, organizer portraits, Codex/Cerebras logos, social icons and the actual homepage OG JPEG. Seven evidence PNGs also stay because retained executable tools consume them: the native1440×756 source for `scripts/qa-actual-hero-og-encode.mjs`, and six baseline/final pixel-comparison inputs for `evidence/performance-content-boundary/summarize.py`. Keeping required inputs avoids introducing shallow-clone/history-fetch dependencies merely to remove their copies.

Nonimage evidence is preserved, including migration checksum manifests, historical ledger proofs, JSON reports, tests, capture scripts, backend ZIP/receipts, ARM64 dependencies and Windows deployment helpers. No application, server, test or build source is removed. Capture scripts can generate new ignored output when intentionally run; deleting old outputs does not disable their capture behavior.

Markdown/HTML image links are repointed to verified immutable GitHub paths at their pre-cleanup source revision. Plain source paths and hashes inside historical machine-readable reports remain historical records, rather than being rewritten to claim new captures. The [execution report](main-review-execution.json) lists each rewritten link. The existing release handoff remains accessible through its pinned originals and delivered native images.

Local checks passed: main/review24 focused asset, SEO and migration-source tests, standalone typecheck and the default Next16.4.3 Turbopack production build; performance branch11 asset tests, typecheck and a production webpack build. All600 protected main runtime/source/test/artifact paths and all621 original JSON files remain byte-identical. The preserved OG source regenerates the exact current JPEG in memory, and the three preserved performance pixel pairs remain identical. [Validation receipt](validation.json).

The main/review image commit is `86af259dd8706896fabe831d6aab3147567d019b`; the separate performance-tip commit is `beef2956ca7887129198cf7e0ffa0428960a2a6d`. Do not cherry-pick the performance deletion onto main: it belongs on its older retained branch. These are local normal commits, with no push or remote branch deletion. The [postrelease branch review](../REPOSITORY_HYGIENE_AUDIT.md) separately lists20 merged/redundant candidates and14 requiring specific historical-loss approval. The image manifests are not permission to discard uncommitted/local-only work or delete a remote branch.
