# Independent check-in and re-invite review

Base: `ba7d03db0aab5a783ed109a1bd2d0f1f0f71be9c`. Branch: `test/quick-checkin-audit`. This bounded review uses six critical cases on disposable in-memory SQLite and PGlite databases. No production source, provider, database or runtime was changed. The configured custom-origin default and required Git identity were verified before testing.

## Confirmed issue: legacy retry uncovers resolved absence

**P2, reproduced in SQLite and PostgreSQL/PGlite.** The new quick check-in correctly preserves a resolved absence. A later legacy `check-in` allocation retry deletes the participant's status override in `lib/service.ts`, exposing the old absence again. The result is contradictory current state: `personStatus.status === 'Absent'` and `personStatus.checkedIn === true`.

Reproduction in independent case 2:

1. Preserve an automatic absence at 07:00 for an approved participant.
2. Apply the supported explicit Going override at 08:00.
3. Quick-check-in succeeds; current personal status is Checked in.
4. Call the existing staff `check-in` action twice as an allocation retry.
5. The raw attendance row and exactly one credit allocation remain, but the displayed personal status becomes Absent. The automatic absence history is preserved.

The failing assertion expects `{status:'Checked in', checkedIn:true}` and receives `{status:'Absent', checkedIn:true}`. This is not a duplicate allocation or a failure in the new conditional Going predicate. It is an interaction with the legacy action's unconditional `DELETE FROM participant_status_overrides`.

Root and the original fix owner were notified before any production edit. The original owner should coordinate the correction. Preserve the legacy action's idempotent allocation retry and explicit manual status workflow; simply restricting legacy retries to never-checked-in Going records would break the stated contract. This lane leaves production files read-only and commits the failing regression proof without skipping or weakening it.

## Six-case results

| Case                                                                                                      | SQLite   | PGlite   | Evidence checked                                                                                         |
| --------------------------------------------------------------------------------------------------------- | -------- | -------- | -------------------------------------------------------------------------------------------------------- |
| 1. Removed participant, approval cancelled after preflight, registration absence added after preflight    | Pass     | Pass     | No attendance, quick-check-in audit or guard residue commits                                             |
| 2. Resolved automatic absence, new quick check-in, legacy allocation retry                                | **Fail** | **Fail** | Status reverts to Absent while checked-in eligibility and one allocation remain                          |
| 3. Admin/owner/volunteer permissions, rejected participant/judge/viewer roles, explicit manual Checked in | Pass     | Pass     | Only staff routes check in; manual attendance stays distinct and cannot be quick-checked twice           |
| 4. Mixed bulk rollback and normalized 250-input deduplication                                             | Pass     | Pass     | Earlier Going override update rolls back; two unique participants and one audit commit after valid retry |
| 5. Re-invite fresh identity, stale old ID, nonleader permissions, lock added before mutation              | Pass     | Pass     | Declined identity/status and existing invitation audit history survive failed reissue                    |
| 6. Team fills its fifth seat before invitation-acceptance transaction                                     | Pass     | Pass     | Acceptance rolls back to pending, team remains at five, target gains no membership or acceptance audit   |

The existing 250-input limit is retained and is not reported as a defect. Existing new-fix suites already cover routine approval/absence rejection, automatic absence races, duplicate quick requests and concurrent re-invites. This file adds targeted independent coverage rather than repeating a broad server audit.

## Execution and limits

Command: `npx tsx --test --test-concurrency=1 tests/quick-checkin-independent-audit.test.ts`.

Result: **12 tests, 10 pass, 2 fail**, both failures representing the single confirmed issue above. [Exact runner output](../evidence/checkin-independent-audit-ba7d03d/run.txt).

An initial SQLite comparison treated a null-prototype database row as a plain-object mismatch. That harness issue was corrected by comparing extracted values; it is not an application finding. The final output contains only the two real case-2 failures.

PGlite validates the production PostgreSQL adapter and trigger semantics with a single serialized connection. Intervening changes are injected immediately before the service's mutation transaction to test stale preflight state and full rollback deterministically. This is not a multi-connection MVCC, load, live Neon or production-login claim. No browser was launched, no app server was started and no positive action touched the shared fixture runtime.
