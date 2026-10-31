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
