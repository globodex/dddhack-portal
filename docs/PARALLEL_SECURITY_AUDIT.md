# Parallel security and correctness audit

Audit date: 23 October 2026. Initial target: `70029ce0bfdeafcd2f81543030a804a1dbeb755d` on `audit/portal-parallel`. Read-only source review; only this report is authored by the auditor. The target is explicitly WIP. Findings below apply to this snapshot, not an integrated release that has not yet been supplied.

No live records, credentials, allocations, deployments, role changes, provider calls, or browser automation were used. Reproductions used disposable in-memory SQLite and existing synthetic fixtures. Actual secret values are excluded.

## Confirmed findings

### P1 — Unchecked-in leader can mutate and commit a project

Locations: `lib/experience.ts:1409–1414`, `lib/team-access.ts:55–74`, database guards in `db/migrations/0009_status_repository_evidence.sql:67–75`; legacy `submit` also needs the latest rule applied.

Boundary: a leader's own individual attendance must authorize project mutation. Team attendance may authorize visibility/read access but cannot authorize the leader's write.

Reproduction: use `tests/helpers.ts` `setup()` and `activate(db)`; `attend(db,'fake_carol')`; set the synthetic clock to `2026-11-01T03:00:00.000Z`; submit a valid strict project payload as `service('bob')` with revision zero and contributions for Bob, Carol and Dave. Bob is the leader of `fake_team3` and has no check-in. `submit-project` succeeds and persists attempt one. The same server guard currently controls `save-project`.

Observed: `uncheckedLeaderCommitted: true`. Only Carol was attended. This is a known pending latest-contract override, not a newly introduced regression. Require the current actor to be the current leader and personally checked in on every project mutation; retain the separate any-member read/visibility rule. Add coverage for revised and legacy submission actions and the database boundary under concurrent status changes.

### P1 — Own-project upvote accepts an individually unchecked-in member

Locations: `lib/experience.ts:1611–1640`, caller gates at `lib/service.ts:272–275`; `project_upvotes` has no attendance/own-team trigger in this snapshot.

Boundary: registered/activated participants may vote on other projects without attendance, but an own-team voter must personally be checked in.

Reproduction: continue the synthetic case above, mark its committed version eligible using a local fixture SQL write, then call `service('bob').command('upvote-project',{projectId})`. Response is `Upvote recorded.` and `project_upvotes` count becomes one, although Bob never checked in. No paid evaluation or real eligibility action was invoked.

Require the individual check-in only when the current voter belongs to the target project's team. Keep idempotency, one vote per user/project across versions, and free ongoing voting for other eligible participants. The integrated API must also return authoritative `canUpvote`/`upvoted` fields; this snapshot does not supply them. This is another pending contract requirement.

### P2 — Public image cache delays removal visibility

Location: `lib/public-project-image.ts:26` returns `Cache-Control: public, max-age=300`.

Boundary: the eligibility/current-version check runs on a cache miss. A cached logo/banner can continue to be served for five minutes after the underlying project becomes ineligible or is later soft-removed. The API JSON and sitemap are already no-store. This does not expose private drafts or numeric scores, and a previously public image is not a newly leaked private asset.

For immediate removal semantics, disable shared/browser caching for these guarded image responses (or provide a proven purge mechanism). Include media, SEO and every public projection in soft-removal tests. Soft-removal implementation is pending at the initial target, so this is a concrete cache behavior to address during that work.

## Isolated public-home candidate

Read target: `/home/param302/Dev/DDEHack-portal/.worktrees/public-home`, baseline `3b5c7251b43afdbab9abd1b6fc40468dde85e70d` plus the public agent's current uncommitted UI/content changes. Its backend deliberately remains v4. Recheck the final diff after that agent commits.

### P1 compatibility gap — v4 does not implement read-only Viewer authorization

Locations in that worktree: `lib/service.ts:214–225`, `lib/experience.ts:843–892` (`complete-profile`), `lib/experience.ts:894–917` (`create-workspace-team`), `lib/experience.ts:1221–1267` (public engagement).

There is no roster/Viewer capability gate before command dispatch. Team creation explicitly accepts an absent registration. Using only the v4 candidate's own in-memory synthetic setup, the unlisted `stranger` fixture successfully calls `complete-profile` and then `create-workspace-team`, returning `Profile saved. Your workspace is ready.` and `Team created. Approval readiness is tracked separately.` Neither needs the event to be active; team formation requires the server time to remain before membership freeze. Upvote/comment additionally require a published eligible target but contain no roster gate. The v4 actor has no Viewer capability model.

The homepage work does not introduce this backend behavior. A frontend-only rollout preserves an already-existing authorization mismatch with the newly required policy. The candidate cannot be represented as compliant with the latest Viewer rule without server enforcement and tests. Hiding controls in UI is insufficient. Safe public discovery and projects must remain readable, while authenticated unlisted users must fail every event mutation. This is an exact compatibility finding, not a demand to invent a new deployment gate or copy all WIP backend code into the public release.

## Planned functionality requiring the integrated audit

The initial checkpoint does not implement the full new import mapping/paste/single-email flow, participant deactivation/restore, project/submission soft-removal/restore, sole unlocked own-team deletion, preview/publish of both submission opening/closing, or automatic Absent reconciliation. These are acknowledged WIP gaps; no claim is made that a missing endpoint is an exploitable endpoint.

The second audit must specifically cover stale-session revocation, add-only imports that cannot restore a deactivated account, owner/leader dependency protections, permanent three-attempt accounting through removal/restore, no stale published-version fallback, immutable history/votes/comments, owner-only versioned window publication, fixed repository cutoff, and lazy idempotent Absent behavior. Confirm API/UI integration instead of accepting a UI-only control.

## Boundaries checked without a new finding

- Snapshot Viewer commands fail before dispatch; private profile/dashboard/history reads require current roster membership. Discovery participants/teams omit private ideas, phones, sex, email and organization IDs, with public-consent handling for participant bio/socials. Same identity rechecks roster on each service operation.
- Current-team phone projection rechecks membership; existing tests cover leave/transfer revocation and exclusion from discovery/admin/public projections. Phones normalize to international `+digits`, and WhatsApp links contain digits only.
- Idea participant writes require current leader, unlocked team and pre-lock server time. Admin override is confirmed, audited and its temporary database guard is inserted/removed in the same atomic batch. No reusable guard remains after a successful override or rollback.
- Existing credit reveal binds current identity, verified current email, allocation recipient and individual attendance. Credit responses and errors are no-store, ordinary exports exclude ciphertext/value, and safe Markdown uses an escaped subset. Only synthetic local encryption fixtures were involved in automated tests; no real reveal occurred.
- Hidden final-stage entries flow through `publicScores`; ordinary ordering stays in community order before countdown completion. Participant feedback excludes numeric rating/evaluation reports. Current public-project and image queries require an eligible committed current version.
- Repository evidence binds the committed SHA/version; both dates compare strictly after `2026-11-01T02:30:00Z`, unknown metadata is `needs_review`, evidence is immutable and assigned-judge restoration is scoped. Evaluation defaults fail honestly with no fake provider success.
- Existing trusted Dispatch identity, staff/owner checks, CSRF origin/content-type checks, bounded request bodies, CSV formula protection, protected export gates, immutable versions and atomic attempt guards remain covered by tests. Private venue retains the all-members-approved filter.

These checks are bounded by the inspected snapshot and synthetic tests, not a proof that every possible path is secure.

## Validation evidence

- `npm run typecheck`: passed.
- `node --import tsx --test --test-isolation=none tests/*.test.ts`: 66 passed; two D1 tests initially hit sandbox loopback `EPERM` rather than assertion failures.
- Reran those D1/Worker tests with approved local loopback access: `node --import tsx --test --test-isolation=none tests/d1.test.ts tests/sites-runtime.test.ts`: 8/8 passed, including both initially blocked cases. All 68 unique tests therefore passed across these runs.
- `npm test` uses the `tsx` CLI, whose IPC pipe is unavailable in the sandbox. The direct Node loader ran the same test sources without that pipe; no dependencies were installed.
- Two successful in-memory adversarial reproductions demonstrate gaps absent from the current green suite: unchecked-in leader commit and unchecked-in own-project vote. The public candidate reproduction demonstrates unlisted profile/team mutation.
- No build/artifact or browser acceptance claim is made by this report. The root integrates and validates the final candidate separately. Awaiting an integrated ref for the required fresh second audit.
