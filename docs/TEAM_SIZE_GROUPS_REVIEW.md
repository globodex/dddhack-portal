# Team-size distribution selector (local review)

The Admin Teams Team sizes card now has a native accessible selector for Total, Locked, Approved, Submitted and Not yet submitted. Each selection shows Solo through5people, the cohort's total and a concise definition. Zero counts remain visible. Empty or over-capacity historical teams are reported separately when present so totals reconcile without inventing size buckets.

Definitions preserve the existing whole-collection statistics:

- Total: all active, nonremoved teams.
- Locked: an actual `team_locks` record; a display-only status does not count.
- Approved: a nonempty team whose current members all have approved registration. Approval is independent of attendance and locking, so an approved Absent member remains approved.
- Submitted: at least one committed submission, including hidden history or a positive durable attempt ledger. Multiple versions count one team once.
- Not yet submitted: no committed submission or positive attempt ledger, including teams still forming. This is not restricted to the window-dependent Yet to submit lifecycle label.

Groups can overlap. List search/filters/pagination do not alter these entire-collection metrics. All five distributions are returned by one authorized aggregate query, with no per-person fetch or extra request on selection. Public/participant access remains denied.

Validation: two new SQLite/PostgreSQL calculation tests and23existing stats tests passed. Typecheck passed. Actual browser checks passed at1440×900,768×900,390×844 and320×480: all five selections, zeroes, unchanged summary cards, no extra API requests,44px control and no horizontal overflow. Browser screenshots use synthetic accounts only and remain outside Git at `/workspace/team-size-review/screens/`.

No schema migration is required for this feature. Frontend and backend code changed, so a matching backend package will be needed when this local batch is approved for publication. No hosted changes, push or deployment have occurred. The previously held compatibility fix remains a separate preceding local commit.
