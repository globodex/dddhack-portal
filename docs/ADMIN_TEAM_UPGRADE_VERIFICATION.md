# Incremental admin-team migration verification

Feature source: `ab423c523c1ba597ba0e6f1b5718197bccbda0c8`. Upgrade tooling source: `331fe0e54e8c7d9539799772be5ac288e2163b0a`, with the current-plan regression adaptations in this follow-up commit. No push, hosted inspection, migration or deployment occurred in this lane.

The approved ten-entry digest is `9bcf3f083d47a1b700e467c60f3b9eff57193491bb1e2929b1c2a4f21ba532d1`. New LF migration `0104_admin_team_corrections.sql` has SHA256 `a931aeafba01be07f43e35fc7c17cae80f11bbd212fbd92f0e5fd8d475c40500`. Only that entry is appended to approval metadata. The seven historical entries, old feature hashes, all nine previous SQL blobs, generic migrator, baseline-manifest and backend archive/receipt remain unchanged.

Two targeted runs passed 39 tests, with two native PostgreSQL cases explicitly skipped:

- `current-upgrade-tests.log`: 11 passed. Both populated nine-entry encodings inspect with only0104 pending, apply only its canonical LF SQL, preserve every existing table row and old ledger entry, replace the three functions, and repeat with no pending work. Stale nine-entry receipts stop before connecting. Mixed/unknown/tampered/CRLF-feature state and stale ledger/count races stop before DDL. A real PostgreSQL postcondition failure rolls function replacements, ledger append and triggered data back. The ten-file Windows checkout and strict repair/refusal tests also pass.
- `legacy-regression-tests.log`: 28 passed, two skipped. Existing current-plan LF/CRLF upgrade, receipt, identity, collision and rollback guards remain intact. The earlier nine-entry ordering and media-limit proofs are deliberately scoped to their original migration prefix, with all assertions retained. The optional native PostgreSQL tests have updated current-plan expectations but were disabled for this local lane.

`npx tsc --noEmit`, source-only `--plan`, source checkout `--check`, JavaScript syntax and diff checks pass. Source-plan and checkout results are retained under `evidence/admin-team-upgrade/`. Existing proof logs and receipts were not rewritten. The full synthetic pre/post receipt objects were asserted in memory; the owner must create fresh private receipts for the actual target.

Whole-seven historical CRLF recognition remains limited to the same exact byte-proven hashes. Features0102/0103/0104 receive no aliases. The optional historical-encoding field remains backward compatible for a receipt matching the new plan; old nine-entry plan digests cannot authorize0104. Fresh inspection, exact target, receipt age, pending order, advisory lock, actual ledger and pre/post counts remain required.

The active [Windows handoff](NEON_POPULATED_UPGRADE_PLAN.md) requires the owner's existing nine-entry ledger and only0104 pending, uses new `.local/pre-0104-*` and `.local/post-0104-*` files, and checks all nine old hashes remain unchanged. It contains no seed/reset or historical SQL replay command and changes no provider settings. A matching rebuilt backend artifact is a separate parent-owned release step; no archive hash was updated here.

These results use disposable PGlite and real Git checkout conversion on Linux. They do not establish native multi-connection PostgreSQL behavior, execute PowerShell on Windows, verify an operator's backup, or claim hosted readiness. `pwsh` is unavailable in this executor. The parent owns final integrated build and any separately authorized rollout.
