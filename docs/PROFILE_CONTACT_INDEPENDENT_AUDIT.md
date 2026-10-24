# Profile contact and organization-ID privacy audit

Audited source: `f1b8f39ed383bc20f80b1295b3aa0bf056ee1cdc`.
Compared with exact backend baseline
`86862c722233bbd6776f1e2672d78b41fa808a52` using separate source worktrees
and new disposable SQLite/PGlite fixtures. No existing fixture database or real
participant data was opened.

Six actual HTTP regression cases pass across SQLite and the production
PostgreSQL adapter backed by PGlite. All successful/denied JSON reads checked
private/no-store and identity Vary headers. No cross-user contact or organization
ID exposure was found in the tested boundaries.

| Reader / surface | Saved organization ID | Phone / WhatsApp | Saved gender |
| --- | --- | --- | --- |
| Owner/admin, selected registered participant | Allowed, only valid `org-…` form | Allowed | Existing approved enum |
| Current eligible teammate, selected participant | Omitted | Allowed | Existing approved enum |
| Participant's own selected dialog | Omitted | Same current-team rule | Existing approved enum |
| Cross-team participant, judge, volunteer, pending participant, authenticated Viewer | Omitted | Omitted | Existing approved enum |
| Anonymous selected lookup | 401, no private payload | 401, no private payload | No selected payload |
| Own `/profile` or `/dashboard/profile` editor | Own value only | Own value only | Own editor values |
| Completed non-admin workspace, `profile` object after this fix | Omitted | Omitted | Unchanged |
| Incomplete embedded onboarding or admin's own workspace profile | Own value retained | Own value retained | Unchanged |
| Workspace member rows | Omitted | Current team contacts only | Unchanged |
| Directory cards, public team member lists and participant CSV | Omitted | Omitted | No new directory-card field |

The focused directory path obtains its viewer from the freshly authenticated
server actor. Query parameters and spoofed identity headers do not select that
actor or its role. Organization IDs never appear on teammate member rows.
Participant exports keep their existing fourteen-column positive projection.

The read-source inventory identifies only three value projections from
`profile_details`: the actor's own editor/profile, the selected-person helper,
and current-team workspace contacts. Other joins use avatar fields. The tests
exercise thirty other public/staff/read routes for cross-team participant,
Viewer and admin, plus private workspace/editor aliases and an actual CSV
export. A guarded/unpublished route is checked for absence of private fields;
this does not claim that every route is open or returns 200.

## Confirmed data-minimization correction

Before this patch, a completed non-admin's Dashboard transported its full own
editor profile, including `phone` and `openai_org_id`. This behavior also exists
in baseline `86862c7`. It is excess self data outside the editor, not a
cross-user leak. The new strict workspace test fails against the original f1
response, as preserved in `before-workspace-minimization.log`.

The narrow runtime patch omits only those two fields from the completed
non-admin workspace's `profile` object. The early incomplete-profile response,
explicit editor, admin/owner response and current-member phone projection remain
intact. It adds no query, schema change, request, mutation, role or permission.
The existing approved public saved-gender behavior is unchanged.

## Fresh changes and the removed-team concern

Actual owner/admin commands revoke admin access, remove a member and deactivate
a participant. The next request loses the corresponding contact scope. A
legacy registration-only member becomes a Viewer immediately when its sole
registration is removed, even though its old membership row remains. A remaining
Luma row deliberately retains registration eligibility. The real database rejects
Luma deletion with `ROSTER_ADD_ONLY`; tests preserve that guard instead of
inventing a deletable roster. Removed targets and unregistered targets cannot
enter selected directory results.

SQL-like person IDs, `teamId`, `userId`, claimed role/owner/viewer parameters and
spoofed identity headers do not broaden the response. Fresh responses are
private/no-store; this audit does not claim that already delivered browser data
can be retroactively withdrawn.

`selectedPerson.sameTeam` does not explicitly check a soft-removed team. No
normal-flow exposure was reproduced: the only team-removal API rejects a
multi-member team, requires a sole leader and atomically removes that membership
and declines pending invitations. Both databases prove that contract. Creating
a removed multi-member team by direct SQL would invent an unsupported state,
so this audit does not classify it as a confirmed leak or change that query.

## Baseline and rollout

Separate actual HTTP captures contain 42 rows per source, covering both engines.
Baseline `86862c7` has no selected-dialog organization ID, phone or gender detail
additions; its own editor and teammate workspace contacts already work. Source
f1 adds the authorized selected details and approved gender enum. The completed
workspace self-data minimization is the additional runtime change in this lane.

If the deployed backend remains at `86862c7`, changing frontend code alone cannot
produce these new selected fields. The integration owner must refresh the API
archive after this source patch, and the owner must manually redeploy it. This
projection patch adds no migration. Existing pending migration requirements are
determined by the owner's reviewed ledger/upgrade process, not by this audit.
No hosted version, ledger, settings or credentials were inspected or changed.

Run:

```sh
npx tsx --test --test-concurrency=1 tests/profile-contact-independent.test.ts
npx tsc --noEmit
```

[Verification](../evidence/profile-contact-independent/verification.json),
[tests](../evidence/profile-contact-independent/tests.log),
[baseline matrix](../evidence/profile-contact-independent/baseline-868-http-matrix.json),
[original f1 matrix](../evidence/profile-contact-independent/before-f1-http-matrix.json),
[pre-fix failure](../evidence/profile-contact-independent/before-workspace-minimization.log)
and [typecheck](../evidence/profile-contact-independent/typecheck.log) preserve
the proof. Initial harness logs record corrections to append-only/NOT NULL
fixture assumptions, not product defects; no storage guard was bypassed.

PGlite verifies actual SQL/trigger/transaction behavior, not native concurrent
PostgreSQL connections. This audit used no real profile, hosted DB, provider,
browser cache experiment, deployment or push.
