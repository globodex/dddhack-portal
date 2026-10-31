# Submission access and missing team ideas — local review

This candidate is local only. No push, hosted migration, backend deployment or live participant operation has been performed.

## Behavior

Active admin/owner team leaders who are current members of their own active team can read, save and submit their project without submission-window, profile-completion or check-in prerequisites. Nonleader admins cannot submit for another team. Three committed attempts, stale-revision checks, removal restrictions and frozen results still apply. The same policy controls media authorization, API commands, database check-in guards and the editor.

Other participants receive no private draft, committed-history payload or form before the actual configured submission opening. The Project tab and direct submission routes show a welcoming availability card. Opening is inclusive and closing exclusive. Opening/closing refresh authorization from the server; background-tab polling is paused. Settings changes are rechecked within 15 seconds while visible. No browser clock grants access. Loading errors hide protected content until a fresh successful response.

Admin Teams cards without an idea have an Add idea disclosure, title/description form and confirmation. The server checks admin authority and the explicit target team. A conditional insert and transaction guard permit one creation only; stale/concurrent attempts return a conflict rather than overwriting. Existing idea editing remains a separate action. Membership and lock state do not change. Frozen results and removed teams reject creation.

## Deployment implications

A future owner-operated release needs matching frontend and backend code, plus append-only migrations `0110_admin_submission_access.sql` and `0111_admin_missing_team_idea.sql`. The first replaces scoped draft/commit check-in guards; the second permits a row-bound admin capability to create a missing idea even when its team/deadline is locked. Ordinary participant guards remain intact.

The approved 17-entry source plan digest is `3c173216603f6a2927903493e29bfbe629dcaddf67cbcd322196f3153f6bffd5`. Historical SQL through 0109 and the seven recognized Windows CRLF aliases are unchanged. Use a fresh guarded populated inspection and apply only the pending suffix; do not execute individual SQL files without ledger bookkeeping. No backup-helper bypass changes are included. The previous published backend archive is intentionally unchanged and does not contain this candidate.

## Evidence

Synthetic browser originals, scripts, logs and JSON reports are outside Git at `/workspace/submission-access-browser/`. They exercise the actual Next UI with a loopback-only synthetic service and disabled external fetch. No production login or provider call was used. Library delivery remains unavailable after earlier HTTP 401 responses; no alternate upload was attempted.

PostgreSQL semantic tests use PGlite's serialized connection. Concurrent-command tests prove conditional insert/conflict behavior there, not independent native PostgreSQL MVCC connections. Optional native PostgreSQL coverage is reported separately by the test suite.

## Final validation — 31 October 2026

Implementation source commit: `bbb2a97ea126f9463f915917d13637a14ebf65bf` (based on published `a7eb22be81e11104f37da3bec835f730479b24f0`). The subsequent validation-record commit changes documentation only.

- Final full aggregate: **1,033 cases; 1,026 passed, 0 failed, 7 skipped**, exit 0, approximately 431 seconds. Command: `node --no-wasm-code-gc --import tsx --test --test-concurrency=4 tests/*.test.ts`. Log: `/workspace/submission-access-final-aggregate.log`.
- The seven optional native PostgreSQL cases are unconfigured/skipped. SQLite, real local D1 and PGlite PostgreSQL semantic cases passed. No hosted database was used.
- `npm run typecheck`: passed, exit 0. Log: `/workspace/submission-access-typecheck-final-candidate.log`.
- `npm run build -- --webpack`: passed, exit 0, including TypeScript/static generation. Log: `/workspace/submission-access-build-verified.log`. Default Turbopack could not resolve the shared external `node_modules` symlink in this isolated worktree; no production config was altered to work around that environment limitation.
- No lint script or ESLint/Biome configuration is present; lint was not run.
- Offline migration CLI `--plan` and checkout `--check` both passed at the 17-entry digest above, with `databaseConnected: false`. Logs: `/workspace/submission-access-review-plan.json` and `/workspace/submission-access-checkout-verified.json`.
- The initial aggregate exposed 13 failures. Scoped fixes covered new SQLite/Drizzle statement boundaries, current migration suffix/journal assertions, existing analytics cache/lifecycle fixtures, an unpinned profile-test clock, and explicit opened-window UI fixtures. All affected suites passed reruns before the clean final aggregate. No historical migration was edited.

Actual browser QA used 1440×1000 and 390×844 viewports: active admin without completed profile/check-in typed, saved a draft and reached commit confirmation; the desktop commit succeeded. Participants saw no form before opening on dashboard/direct routes. Live opening, postponed settings, failed-read protection/retry and horizontal overflow passed. Admin Add idea form/confirmation passed at both sizes; the saved exact-team idea was verified after refresh, with the creation action gone. Earlier mobile harness timeouts were resolved by reopening Update project after the desktop commit and asserting saved-card state rather than an incorrect toast expectation.

There are 13 synthetic PNG originals outside Git. Manifest: `/workspace/submission-access-browser/screenshots-manifest.json`. Useful previews:

- `screens/admin-typing-1440.png` and `screens/admin-typing-390.png`
- `screens/participant-before-1440.png` and `screens/participant-before-390.png`
- `screens/admin-add-idea-1440.png` and `screens/admin-add-idea-390.png`
- `screens/admin-add-idea-confirm-390.png`
- `screens/admin-added-idea-1440.png` and `screens/admin-added-idea-390.png`

Browser reports: `/workspace/submission-access-browser/report.json`, `idea-report.json`, and `idea-saved.log`. The first idea browser script's mobile toast matcher timed out after HTTP 200; the separate saved-card check verified the persisted values at both widths. That timeout is retained in its log, not presented as a passing assertion. Screenshots were visually inspected. No Library IDs are available because of the earlier HTTP 401 delivery restriction; it was not retried or bypassed.

The original checkout's four unrelated participant-caption diagnostic changes are preserved and excluded. No image, archive, hosted setting, migration-helper CLI or no-backup change is included. The existing published backend ZIP remains unchanged; a matching new package is still required for any later approved rollout of this candidate.
