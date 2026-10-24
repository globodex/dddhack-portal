# Going-only attendance and declined invitation repair

Baseline: `244d68febfea4a7ba7ff5966001310db107c7828`. All reproduction and verification used synthetic isolated SQLite databases or the existing PostgreSQL adapter against PGlite. No shared visual fixture, hosted database, provider setting, credential, mail delivery, deployment, or main branch was changed by this lane.

## Confirmed baseline problems

1. Attendance integrity, medium: an admin changed synthetic Alice to Absent through the authorized manual status action, then `participant-bulk {emails:["alice@portal.test"],checkIn:true}` succeeded. Alice acquired a check-in row and became Checked in because the old guard tested approved registration alone. This was a staff-only Going-policy violation. No public permission bypass was demonstrated.
2. Team flow blocker, medium: Alice invited an approved synthetic person with no team, the recipient declined, and Alice invited that same person again. The second invitation failed with `UNIQUE constraint failed: team_actions.team_id, team_actions.user_id, team_actions.kind`. No retry or history cleanup was used to mask the failure.

## Resulting contracts

`quick-check-in {emails:[one]}` is a direct action with no confirmation or required reason. `bulk-check-in {emails:[...]}` requires `confirmation:"CHECK_IN_PARTICIPANTS"`, including a single selected checkbox. Both preserve the existing bulk attendance roles: owner, admin and volunteer. Addresses are normalized and deduplicated. Successful responses contain `message`, `checkedIn`, `emails` and `userIds`.

Only currently Going, approved, signed-in individuals qualify. Unknown accounts return `PARTICIPANT_NOT_SIGNED_IN`422. Unapproved individuals return `PORTAL_GOING_REQUIRED`403. Absent, already Checked in, or changed selections return `CHECKIN_STATE_CHANGED`409. A replay does not return success or add another attendance audit.

Every participant gets a conditional row write that revalidates personal Going, current address/approval, removals, existing attendance and automatic absence timestamps inside the mutation transaction. Existing previous-write guards roll the entire batch back if any selected row has changed. The PostgreSQL adapter uses its existing serializable transaction/retry policy; the SQLite adapter uses its existing immediate transaction. One successful action creates one attendance audit. The previous `participant-bulk` check-in path uses the same helper. Its separate registration-status operation is unchanged.

A newer explicit Going override can supersede an automatic absence. Check-in advances that existing override to Checked in and preserves the absence history. Routine quick check-in does not become a manual status override. The independently authorized `admin-status` and `admin-status-bulk` flows are unchanged. The older staff-only `check-in {userId}` allocation/retry contract is also preserved; its existing idempotent credit-allocation regression passes.

Declined invitations can be reissued through the existing `team-invite` action. The unique active row gets a fresh invitation ID. Its previous ID, declined status and creation time are recorded in the new immutable audit entry. The old ID no longer resolves and cannot accept or decline the replacement. Pending/accepted invitations are not silently reset. Conditional write guards prevent concurrent duplicate invitation/response audits or duplicate membership. Existing leader, approval, membership, freeze, lock and five-person acceptance guards remain in force. No schema migration or history deletion is involved.

## Source commits and verification

- `85c85167f88d91c2b924c9b62a9c94dbefef290f`: new quick/bulk contracts and atomic Going-only attendance.
- `c8c27d6861bb27facf03d66595d4d3e5ca0d6794`: preserve a resolved absence when attendance advances.
- `e9f9ae7b4c12d40428206bcd8a9e63d0be77061d`: fresh re-invitation identities, retained audit history and guarded responses.

All three commits have author and committer `Parampreet Singh <rubercuber.30@gmail.com>`. The feature branch is `feat/going-only-quick-checkin`; its base includes the main-only Vercel Git deployment configuration.

Verification passed:

- 9 focused check-in tests across SQLite and PostgreSQL semantics: confirmation distinction, normalized/deduplicated payload, staff roles, missing account, Registered/Absent/Checked in rejection, preserved manual override, deterministic stale-status/automatic-absence races, all-or-nothing mixed batch and concurrent single attendance/audit.
- 6 focused re-invitation tests across the same engines: reissue/fresh ID, old-ID rejection, audit history, leader/approval/lock/cap guards and concurrent invite/response behavior.
- 27 existing tests covering membership, roster, roles, domain flows, manual status changes, credit ownership/allocation, public projections and HTTP security.
- `npx tsc --noEmit` and `git diff --check`.

PGlite verifies actual PostgreSQL SQL and trigger behavior through the production adapter. Its single connection is not evidence of native multi-connection PostgreSQL MVCC behavior or hosted capacity. The concurrency tests prove one committed mutation/audit under the tested adapters; no live exploitation or production load claim is made. Admin owns the actual rendered quick/bulk control screenshots and frontend interaction checks. Root must rebuild the backend archive after integration; publication and backend redeployment remain manual.
