# Retained performance-audit branch image cleanup

Base: `6fcb7d5be117d234ae60a4a4b04af966f9134af8` (`test/dashboard-performance-source-audit`). This is a normal local deletion commit on a fresh `chore/performance-evidence-cleanup` worktree. No remote branch, existing worktree, main branch or Git history was deleted or rewritten; no push was performed by this lane.

The owner confirmed delivery of the requested current screenshots before authorizing this exact cleanup. The reviewed `performance-audit-images-delete.tsv` manifest has SHA-256 `27cd4fd1f7961e7acb79051c70649741af84b287bc9a726aa272f2c531f9fa2c`. The cleanup helper checked a clean exact base and every listed image's Git blob, byte size and regular-file status before changing files.

- Removed exactly **1,482 historical evidence images**, totaling **129,925,052 bytes** (123.91 MiB) from this branch tip.
- Repointed **349 Markdown/HTML links in 30 documents** to immutable copies at `https://github.com/Param302/dddhack-portal/blob/6fcb7d5be117d234ae60a4a4b04af966f9134af8/…`. Inline image destinations use the same immutable blob with `?raw=true`.
- Preserved all **19 runtime public images**, all **365 JSON files**, all source/configuration/tests, package manifests, historical migration/checksum inputs, backend ZIPs and Windows helpers byte-for-byte.
- Before this new README, all **1,200 other tracked files** were present: 1,170 retained their exact Git blob bytes and the remaining 30 were only the documentation link updates above. No runtime or nonimage file was removed.

This reduces checked-out branch-tip image bytes. It does **not** remove old Git objects or guarantee a smaller historical clone. The immutable base still contains the original evidence. There is no history rewrite or provider/storage cleanup.

## Verification

An independent byte comparison against the base found no unexpected file change or deletion, including every runtime image, JSON manifest and release artifact. No existing image test input matched the approved evidence deletion list.

Focused runtime-asset tests: **11 passed**, covering approved Delhi PNG/WebP pixel parity and loading/decoding, original organizer portraits/markup and portrait geometry. Standalone `tsc --noEmit` and `next build --webpack` both passed with exit 0; the build also completed its own TypeScript phase and page generation. No full regression suite was repeated for this documentation/image-only change.

Local validation reports/logs are `/tmp/ddd-performance-evidence-cleanup-application.json`, `/tmp/ddd-performance-cleanup-byte-preservation.json`, `/tmp/ddd-performance-cleanup-asset-tests.log`, `/tmp/ddd-performance-cleanup-typecheck.log` and `/tmp/ddd-performance-cleanup-build.log`. The exact deleted paths remain reviewable in this commit's diff; the independently copied reviewed manifest is `/tmp/ddd-performance-audit-images-delete-reviewed.tsv`.
