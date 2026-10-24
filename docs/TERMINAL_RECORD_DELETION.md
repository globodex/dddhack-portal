# Irreversible participant and team deletion

Source: `892a59097bb6baf75c9f254a14d58eef83ef2531` plus media ownership correction `14860dda6203f79780cf43be885ce67c58af6fba` and confirmed-scope/import-race guard `5722b599e3aa6aa55de93ff4fbad0b4c9575daf8`, based on `3fee26d8c5a352c9ef829929ee64f2576c4b3a22`. This lane changes backend deletion behavior only. The parent owns UI confirmation copy, the reviewed upgrade plan and release archive. No hosted data, storage objects or provider settings were changed during implementation.

## Explicit API contracts

- `admin-delete-participant`: `{userId, expectedLeaderTeamIds, confirmation: "DELETE_PARTICIPANT"}`.
- `admin-delete-team`: `{teamId, confirmation: "DELETE_TEAM"}`.

Both are strict single-target contracts. Participant deletion requires the exact confirmed leader-team ID set, including archived teams, with a 100-ID transport bound. The server compares that set before mutation and again guards it within the transaction, so a crown transfer cannot silently broaden the confirmed cascade. More than 100 led teams must be handled individually; no list is truncated. Arrays, extra targets, extra reason fields and other confirmation tokens are rejected. Owner/admin authorization is read afresh, then checked again in the mutation transaction. Participant deletion protects the current actor, configured owner and every current staff role. Staff accounts must go through the existing owner-only access management workflow; participant deletion cannot demote them.

Deleting a team atomically removes its memberships, idea and revisions, every immutable submission payload and receipt, project/draft, votes/comments/feedback, private reviews, eligibility/repository evidence, AI jobs/runs, assignments, team metadata and associated media-upload/approved-source metadata. The people and their personal credits remain. Deleting a participant who leads a team performs the same cascade for teams they lead, including legacy removed teams, then removes that participant's portal profile/contact/roster, membership, personal engagement and personal credit mappings. Other members remain participants and become teamless. A nonleader deletion preserves the team, leader, lock, idea, all unrelated project content and other people.

Assigned codes removed with a participant are retired: their allocation and inventory rows disappear, while immutable fingerprint/assignment history remains and forbids reimport/reassignment. No voucher value, email, phone or private payload is copied into the new deletion audit entry. Its detail contains only deletion/count/attempt-preservation flags. Existing owner-only audit rows remain indefinitely and unchanged.

## Permanent boundary and attempt preservation

New additive migrations are `neon/migrations/0105_terminal_record_deletion.sql` and SQLite `db/migrations/0026_terminal_record_deletion.sql`. Published 0000–0104 and prior SQLite SQL bytes/checksums remain unchanged. **The new schema must be applied through the reviewed owner upgrade process before deploying the new backend**, because actor authorization reads the terminal table. This implementation did not apply a hosted migration.

The migration seeds `submission_attempt_ledger` from each team's actual maximum committed attempt. Subsequent inserts advance it monotonically; update/delete guards prevent resetting it. It stores only opaque team ID and count, without payload or participant information. `terminal_record_deletions` stores only kind, opaque target ID and deletion time. Terminal markers cannot be changed/deleted, deleted team IDs cannot be reused, and terminal records cannot be restored. Removing all payload history does not reset the three-submission cap.

The minimal user identity and existing auth references remain for authentication and indefinite audit foreign keys; the portal display name becomes `Deleted participant`. Actor upsert statements skip terminal identities, and the existing actor read rejects them before absence/profile reconstruction. This uses the existing batch/read rather than adding another lookup round trip. A previously valid session cannot recreate the erased portal profile or regain access. This is portal-record deletion, not a claim that authentication identity or historic audit PII has been erased.

A reimport after preview or a deletion interleaved during `commit-import` cannot recreate the terminal registration, roster or profile. The actual registrations INSERT checks removals/terminal state in the transaction while preserving unrelated existing and new participants. Root owns the private admin projection filter that excludes retained terminal auth stubs from participant/Viewer rows.

Legacy `participant-deactivate` / `participant-restore`, sole-member `delete-own-team` / `restore-removed-team`, and project/version soft removal/restore remain separate and unchanged for nonterminal records. Legacy project restore still unremoves selected flags; it does not promote a prior version or reset attempts.

## Guard scope and retained history

Immutable deletion exceptions require the exact transaction-scoped team/person guard and no frozen result snapshot. Ordinary submission, lock, receipt and evidence deletion remains blocked. Fresh target-role/leadership and actor checks protect against a concurrent promotion, crown transfer or role revocation. Failures roll back the complete deletion, guard state, terminal marker and audit. Concurrent repeats persist one successful deletion and one audit.

Frozen results remain immutable: both new terminal commands reject with `RESULTS_FROZEN`. Existing global score-release history is also retained; it contains opaque project/version/team IDs and numeric scores, without submission payloads. Public score projection checks live project/version eligibility and cannot show a removed project. No snapshot or scoring rule is rewritten by this feature.

Team media metadata is removed by team ownership, not by the historical uploading actor. A former leader's upload belonging to a surviving team's draft remains intact. The full PostgreSQL upgrade test covers that distinction as well as deletion of the target team's approved source snapshot and consumed upload receipt.

## Verification and limits

The 26 focused SQLite/PGlite tests cover locked three-attempt cascades, leader/nonleader boundaries, released members, old-row/ledger/auth/audit preservation during populated upgrade, failed-DDL rollback, immutable attempt retention, strict authorization/confirmation, personal code retirement, injected mid-transaction failure, concurrent replay, stale permissions/crown changes, stale profile writes and late provider completion. The full PostgreSQL plan includes the separate auth/approved-evaluation migrations. These are fresh synthetic databases only.

Typecheck passed. Existing relevant regressions are recorded alongside the focused transcript. One initial stock-test process hit a native Node/V8 WebAssembly JIT assertion, rather than a product assertion; its exact output is retained and the stock file passed 12/12 when retried alone. Across the selected existing files, 47 unique regression cases passed; the original multi-file run is not presented as a clean run. PGlite verifies PostgreSQL SQL/trigger behavior with a serial single-connection pool; it does not prove native multi-connection MVCC behavior. No native PostgreSQL or hosted runtime is claimed here.

Physical private storage bytes are **not deleted** by the database transaction. The serving/upload metadata is removed, but bucket objects need a separately authorized cleanup path with verified ownership and permissions. No storage worker or provider delete was added or executed. Root owns the final rendered UI proof and current screenshots; this backend lane makes no page-readiness claim.

[Source/schema fingerprint](../evidence/terminal-deletion/source-and-schema.json) and test transcripts in `evidence/terminal-deletion/` preserve the exact checks and limitations.
