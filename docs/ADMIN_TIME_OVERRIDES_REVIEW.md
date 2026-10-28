# Local admin testing, team corrections and dashboard arrival review

Unpublished review batch. No hosted database, function deployment, settings, credentials or participant data were changed.

## Implemented behavior

- Team Sizes offers Total, Locked, Approved, Submitted and Not yet submitted distributions over the entire active authorized collection. Categories overlap and do not follow list filters. Approved means all current members have approved registrations; attendance does not revoke approval. Submitted means at least one committed attempt, including preserved hidden history. Not yet submitted is its complement, including forming teams.
- Dashboard personal attendance appears once above the team content. The arrival card uses only the existing authenticated server projection. Private venue remains limited to approved Going/Checked-in participants and admins/owner; Registered, Absent, Viewer and anonymous audiences do not receive it. Team approval alone grants nothing.
- A current, active admin/owner who is the actual member-leader of their own team can view the submission form and save/commit outside a correctly configured submission window. This exception changes time gating only. Profile completion, check-in, media validation, eligibility, frozen results and the three-attempt cap remain in force. The UI labels the exception explicitly rather than claiming that the window is open.
- The same admin leader can remove their own test project outside the window with confirmation. This uses recoverable project removal: committed history and attempts remain unchanged. It is not a permanent deletion or an attempt reset. Existing explicit admin restore is required to edit a removed project again.
- Admin unlock no longer uses participant deadlines. Submitted/consumed-attempt and frozen-result barriers remain. Unlocking after the deadline does not reopen participant editing. Admin lock, add-member and status corrections retain their existing independent admin checks.
- Admin member removal has a dedicated endpoint and confirmation, including for locked teams after cutoff. It removes only a nonleader membership. The participant account, roster, idea, lock and history are preserved. Leaders require an explicit leadership transfer first.
- Post-event absence reconciliation now uses conditional idempotent audit inserts supported by PostgreSQL instead of SQLite-only `changes()` expressions. No attendance policy or cutoff changed.

## Schema and deployment implications

Append-only `0108_admin_testing_and_team_corrections.sql` updates two trigger functions for exact, transaction-bound admin capabilities. No tables or stored participant data are changed. All published SQL through0107 and the seven historical Windows checksum aliases stay unchanged. SQLite/D1 and Drizzle mirrors are included.

The guarded upgrade accepts the exact canonical fourteen-entry source plan and existing LF or proven historical CRLF prefixes. A fresh populated inspection and truthful verified-recovery checkpoint remain required. Never paste raw DDL while bypassing the migration ledger.

The complete batch requires the frontend, matching backend code, and0108. Team-size analytics requires backend code but no separate migration; the arrival layout is frontend-only and reuses existing privacy filtering. Nothing in this branch deploys automatically: publication is held.

## Evidence locations

Screenshots are synthetic and outside Git:

- `/workspace/team-size-review/screens/`: all five selections at1440px and390px; browser assertions also cover768px and320px.
- `/workspace/dashboard-top-review/screens/`: Going, Checked-in, Registered, Absent and admin dashboard variants at1440px and390px; assertions also cover320×480, Viewer, and logout/account switching.
- `/workspace/admin-time-review/screens/`: actual admin/ordinary participant submission comparison (final browser report records completion).

No screenshot files or real private venue details are included in Git. Native Library delivery is blocked by the previously denied prepared-upload helper authentication route (HTTP401 at tools/list); no retry, alternate upload or public hosting is authorized in this batch.

Final test/build/package receipts will be recorded after completion. PGlite validates real PostgreSQL SQL/trigger behavior with one connection; it is not evidence of native multi-connection concurrency.
