# Repository hygiene audit

This is a read-only snapshot from 2026-10-24 at 19:36 UTC of `https://github.com/Param302/dddhack-portal.git`. Direct remote reads showed both `main` and `feat/portal-experience-rework` at `f54306b76c17f5dc5b101354c17142583b3efe09`. The current release advances beyond this snapshot. **Re-read remote tips, timestamps, reachability and active ownership after the release before approving any deletion.**

The audit fetched heads into a separate temporary bare repository. It did not change shared remote-tracking refs, application files, existing branches/worktrees, tags, provider settings or hosted data. This durable handoff contains only this report and the candidate TSV. No deletion or history rewrite was performed or authorized.

## Remote branches

There were 38 remote heads. Retain these four under the requested rule of main, the original development branch and the two newest remaining tip committer timestamps:

| Retain | Tip at observation | Committer timestamp |
| --- | --- | --- |
| `main` | `f54306b76c17f5dc5b101354c17142583b3efe09` |2026-10-24T18:54:41Z |
| `feat/devday-exchange-v1` | `dc92672c0e9a50ebcfe458f2e7c692058a1483b7` |2026-10-24T13:29:50+05:30 |
| `feat/portal-experience-rework` | `f54306b76c17f5dc5b101354c17142583b3efe09` |2026-10-24T18:54:41Z |
| `test/dashboard-performance-source-audit` | `6fcb7d5be117d234ae60a4a4b04af966f9134af8` |2026-10-24T15:38:22Z |

The [34 exact candidate names, full tips, timestamps and risk classifications](REPOSITORY_HYGIENE_BRANCH_CANDIDATES.tsv) are **pending review**, not an approved deletion list. Test/audit branches count as development branches in this snapshot's retention rule.

| Candidate risk | Count | Meaning |
| --- | --- | --- |
| Graph merged |4 |Tip is reachable from both observed main and review. |
| Patch equivalent, not graph merged |16 |Every non-merge patch is equivalent, but the exact branch graph is not merged. |
| Patch unique |14 |One or more non-merge patches need explicit retention/loss review. |

Patch equivalence does not prove that subsequent edits or evidence are safely preserved. The TSV records attached worktree paths, exact local HEADs and dirty-file counts. Three matching local branches differed from their remote tip: `feat/admin-experience`, `test/final-performance-current` and `test/perf-prod-final`. Preserve their local work and uncommitted proofs; do not infer that deleting a remote name authorizes deleting its worktree.

Active successor work at the audit checkpoint was local-only: root integration, unified navigation, public project sharing, results/judging, admin credit values, and the completed admin action refinement. Historical profile/landing/team/admin proof worktrees were explicitly retained pending review. Profile subsequently moved to the isolated homepage OG lane. These owners and branch tips can change during release. No existing worktree is a deletion target in this audit.

## Images, generated files and disk measurements

Measurements below describe the published f543 tree. They are not a claim about browser payload or performance.

| Measurement | Count | Bytes |
| --- | --- | --- |
| Tracked image paths, including duplicate content |1,808 |164,325,143 |
| Unique image blobs in the current tree |1,564 |141,646,120 |
| Evidence image paths |1,788 |158,641,237 |
| Evidence PNG paths, included above |1,786 |157,868,117 |
| Runtime public image paths |20 |5,683,906 |
| All reachable remote blob objects, uncompressed |4,479 |301,204,831 |

The fresh all-head remote Git pack occupied 156,439 KiB, about 160.2 MB. The shared local `.git` directory occupied about 240.5 MB and included local-only work; local `node_modules` occupied 1,281,525,559 bytes. `node_modules`, `.next`, `dist` and `.neon` had zero tracked paths. These are separate measurements. Ordinary file deletion reduces the tip tree but does not purge historical blobs or guarantee a smaller clone. No BFG/history rewrite is proposed.

All nonruntime image paths were under `evidence/`, across 86 groups. Large groups included team studio comparisons, redesign landing, final performance, responsive public QA and project/credit responsive captures. Reference/mock groups included `dashboard-mockup-baseline`, `redesign-references`, `projects-rules-comparisons` and accepted `team-studio-independent/selected-source.png`. `project-media-quality` contains generated synthetic test images/comparisons reproducible by its QA script. These are evidence, not production portraits or credits. This audit inspected source references and file metadata; it did not visually re-review every historical image.

There were no tracked images in `docs/` or `previews/`. The tracked Delhi/email preview HTML/text files are read by preview scripts. Remove them only through a separately reviewed list that accounts for those consumers. Keep `docs/assets/delhi-v3-manifest.json` as approved artwork provenance.

## Files that must survive cleanup

- Keep all runtime public artwork: four organizer portraits; approved NEW DELHI fill, fallback and mask; static Metro; actual Codex/Cerebras logos; social icons including WhatsApp; associated source/license records. Runtime components and image/portrait verification tests consume these assets.
- Keep dot expression/color source and related components, including `app/dot-avatar.tsx` and `lib/avatar-contract.ts`. They are runtime UI, not mock pictures.
- Keep the required actual homepage OpenGraph asset, `public/og/devday-new-delhi-home.jpg`, and its metadata wiring when the new release adds it. It is an explicit exception, although absent from the f543 inventory.
- Keep `evidence/neon-host-archive/historical-ledger-checksums.json`. The actual populated-upgrade CLI, Windows diagnostics/checkout verifier and migration tests read it.
- Keep `evidence/legacy-ledger-independent/derived-historical-hashes.json`, which independent ledger tests read. Preserve historical SQL bytes, auth aliases, baseline manifests and `.gitattributes` LF rules.
- Keep the reviewed `artifacts/neon/portalapi.zip`, receipt/build metadata and supporting `evidence/neon-host-archive/` provenance. Keep Windows preparation/test helpers, archive verifier, deployment/upgrade docs and their synchronized pins.
- Keep other retained script/test inputs until their consumers are deliberately retired. Examples are `evidence/sites-dependency-audit.json` for the legacy artifact gate and `evidence/performance-production/{attribution.json,report.json}` for performance analysis. **Do not blanket-delete `evidence/`.**

## Review and delivery boundary

Deliver the **requested current screenshots** as original native files before deleting their repository copies. Preserve accepted design references and any evidence still needed for review or tests. This does **not** require sending all 1,786 historical PNGs. Obsolete, unneeded images may be removed only through an exact reviewed file list, with runtime/OG/release/test-input exceptions preserved.

The image totals are inventory context, not a deletion instruction. Rebuild the exact candidate list against the successful release, record which current captures were delivered and where, and obtain approval for the specific branch and file deletions. Branch approval must identify the freshly verified names and expected tips. Do not silently broaden it to tags, local worktrees, provider deployments or historical data. Cleanup must not block the design release.
