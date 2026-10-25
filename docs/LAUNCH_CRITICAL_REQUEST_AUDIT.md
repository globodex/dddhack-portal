# Team request integrity audit

Audit baseline: `59ddf2b9146117bc76e561c402c62a9e93392afd`. All identities, requests and database contents in this proof are synthetic. No hosted database, provider or publication action was performed.

Two P2 issues were reproduced through the actual HTTP handler:

1. A leader accepted a request, removed that member, and the former member requested the same team. The HTTP response was successful but the stored request remained accepted, leaving no actionable request. The fix creates a fresh request ID when retrying a resolved request and retains the previous ID/status/time in the new audit entry. Pending retries keep their ID and create no additional audit. The old ID cannot accept the new request.
2. Concurrent decline and accept requests both returned success, while only the decline took effect and the accept wrote a false audit. The conditional response update now has a transaction write assertion. A losing response rolls back and returns `REQUEST_ALREADY_RESOLVED` after reading the current request. Concurrent repeated acceptance creates one membership and one audit.

Only the `request-team` and `respond-team` blocks in `lib/experience.ts` changed. Existing profile, participant-role, registration, team lock, leader and deadline checks remain in place. A request to a full team is permitted and reserves no seat; acceptance is still rejected by the existing five-member constraint. A rejected participant cannot be accepted and the failed operation leaves the request pending.

The initial baseline exposes leader removal, rather than a standalone voluntary leave command. This proof does not claim that an unimplemented leave flow was exercised. Admin unlock is owned and verified separately.

SQLite verification: six focused cases pass, including new/declined/accepted request retries, stale IDs, concurrent request sends, competing response decisions, repeated acceptance, full-team acceptance rollback, rejected registration and the membership deadline. Concurrent retry recovery also preserves the owner's existing participant-role permission, using the same fresh role/registration rules rather than excluding its staff mode.

Eighteen related SQLite regression cases also pass. They cover revised/legacy three-attempt ceilings and receipt retries, required leader attendance, current committed public content, version-bound eligibility, one upvote per person/project, private review separation, Viewer write refusal and fresh admin-added registration, current-role checks before voucher reads, 25-row admin stock pagination, personal self/attendance projection, removed-self denial, and explicit Home arrival projection/status/role revocation. These are existing safeguards, not additional fixes. The audit found no further reproducible defect in those checks and did not infer rules for open product questions about role audiences, Absent behavior, result decisions or restored-version semantics.

TypeScript typecheck passes. Raw failing and passing output is preserved under `evidence/launch-critical-independent/`. Native PostgreSQL concurrency has not been executed by this lane. PGlite runs were deliberately not started because the coordinated database slot remains reserved for the migration/admin-unlock lane; final integrated PostgreSQL validation remains with the parent. The newly authorized self-leave and admin-unlock flows are not part of this baseline and require their owner's integrated checks.
