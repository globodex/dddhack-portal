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

## Second audit — integrated ref `379c568`

This pass used a new `audit/portal-integrated` branch in the auditor's own worktree. It includes root correctness commit `6d92802` and both UI agent commits. No other worktree was reset or modified. The original snapshot findings above remain historical evidence rather than unresolved assertions about this ref.

### Resolved original findings

- Leader personal attendance is now required by `requireSubmissionAccess`, revised and legacy project commands, and database insert/update guards in migration `0016_personal_checkin.sql`. Any teammate's attendance still permits the separate read/history path.
- Own-team upvote now checks the individual voter in API and database; other-project votes remain available without check-in or a global quota/window. Project rows provide authoritative `canUpvote` and `upvoted`.
- Public media now returns `private, no-store`; current project/submission tombstones are checked by public JSON, image and public-score projections. Removal preserves attempts/history, without publishing a previous version.
- New requests by deactivated users lose Viewer engagement/participation capabilities and private roster routes; ordinary reimports cannot restore them. Sole unlocked own-team removal and both-date versioned window publication have focused tests.

### P1 — Mapped profile category cannot be saved; imported values overwrite later edits

Locations at `379c568`: `lib/experience.ts:166–190` (profile prefill projection), `lib/experience.ts:1305–1315` (description validation), `app/profile-flow.tsx:25–49` (typed links take priority).

Reproduction: preview/commit a synthetic explicitly mapped CSV containing a new email, `bestDescription='Imported category'`, and Website `https://imported.example`. Sign in as that new identity. The profile projection shows the imported category and the UI supplies it as a selectable option. Completing the profile with that exact value fails `PROFILE_DESCRIPTION_CHOICES_PENDING`: only the stored profile-details value or the still-empty official list is accepted. An administrator's trusted imported value is neither.

Then complete with an empty description and Website `https://edited.example`. The database social URL is edited correctly, but the next profile projection always attaches imported `socialLinks`, and `profileInitialLinks()` chooses the old `https://imported.example`. The supposedly cleared description is also restored by `details?.best_description || prefill.bestDescription`. A later ordinary save can therefore resurrect stale imports and removed social URLs. No existing row was changed by import itself; the incorrect overwrite happens through later projection/UI save.

Preserve exact trusted imported values for initial review/save, without inventing categories, and stop applying import prefills after first successful completion. Treat intentional blanks as edits. Root acknowledged and is correcting this; a newer ref is required to verify the fix.

### P1 — In-flight profile command can finish after participant deactivation commits

Locations at `379c568`: `lib/service.ts:309–316` captures `actor`, awaits `throttle`, then checks the stale mode; `lib/roster.ts:11–19` trusts a supplied actor's stale deactivated field; complete-profile SQL has no transaction-time active-actor guard.

Deterministic reproduction: instantiate synthetic Carol's service; override only that instance's `throttle()` to complete `service('admin').command('participant-deactivate', {userId:'fake_carol',reason:'Concurrent synthetic removal',confirmation:'REMOVE_PARTICIPANT'})`; then resume Carol's `complete-profile` with a valid body. The resulting tombstone is active, response is `Profile saved. Your workspace is ready.`, and the changed bio persists after removal. Overriding this hook only creates the real asynchronous ordering between initial actor read and domain write; production source was not changed.

Fresh requests correctly fail. This finding concerns an already-in-flight stale authorization snapshot. Enforce current active actor within the same atomic mutation transaction; recheck roster tombstones independently of a supplied actor object. Root acknowledged and is adding a central transaction-time guard. Verify the rejection rolls back the entire domain batch and creates no successful mutation audit.

### P2 — Approved registrations without an account never reconcile to Absent

Locations: `lib/absence.ts:9–14` only scans `users`; `lib/experience.ts:352–379` defaults rows without a user ID to Registered.

Reproduction: create only a synthetic approved registration for `never@portal.test`, advance after the absence cutoff, and request `/admin/participants`. Its response remains `{approval:'approved',status:'Registered',id:null}`. It was never eligible for check-in and no automatic-absence record is possible until first sign-in. This also mislabels its Going status before cutoff. If the user's Going/Absent requirement includes approved people who never create an account, reconcile by verified registration email without manufacturing user identities. Reported to root for explicit scope resolution.

### Additional correctness concerns passed to root

- `PortalService.compute()` at `379c568:1860+` includes latest versions of removed projects/submissions when calculating active scores and vote normalization; public-score filtering only hides them later. Whether to exclude them from future active computation must follow the user's removal/scoring intent while preserving frozen snapshots. Root is separately revising engagement scoring; no private-score exposure is claimed here.
- Legacy action `idea` still accepts a separate core up to 2,000 characters while revised canonical ideas use title plus description up to 500. The database description cap prevents a long description, but not divergent private core data. Align or reject the alias to maintain the single canonical model.
- The isolated v4 public candidate still requires its own final source-boundary verification; no inference of latest backend compliance follows from these integrated fixes.

Validation for this exact integrated ref: `npm run typecheck` passed; `node --import tsx --test --test-isolation=none tests/*.test.ts` with approved local loopback passed **94/94**, including D1 transactions/migrations. The additional import and in-flight-removal reproductions above also succeeded and expose coverage gaps despite that green suite. No live/network browser operation, real record, venue value, secret or paid provider was involved. Awaiting the root's correction ref for final verification; this pass does not certify changes made after `379c568`.

## Correction verification — ref `7919187`

Used a fresh auditor branch, `audit/portal-corrections`. The original second-pass adversarial reproductions now fail safely:

- The exact imported category saves successfully on first completion. Edited social URLs replace imported values. Subsequent explicit blank category and empty social list remain blank on reload and through `profileInitialLinks()`.
- Deactivation committed during the original throttle interleaving rejects `PARTICIPANT_REMOVED` and does not persist the profile mutation. A stronger regression pauses immediately before `mutate`; the transaction-time active-actor assertion rejects and rolls back the domain batch. The temporary assertion guard is removed on success and rolled back on failure.
- Approved never-login registrations are reconciled by email without manufacturing a user. Their Absent state survives later first sign-in; Registered and ever-attended people retain the covered exclusions.
- Legacy `idea` dispatch uses the canonical save implementation. Public images remain no-store. Removed latest records are excluded from score normalization once their review-readiness check is passed.

The latest explicitly communicated venue rule supersedes the original all-member rule: an approved person with Going/Checked in status may see the private venue, as may existing owner/scoped operations admins. Source/test review found no widening to Viewer/discovery/public projections. No actual venue value was read or emitted. Engagement pause is versioned and enforced by API/database guards, with server row capabilities reflected in UI; reopening does not reset votes or frozen scores. Hidden final-stage projections remain filtered by `publicScores`.

Focused verification: `node --import tsx --test --test-isolation=none tests/latest-permissions.test.ts tests/admin-portal-integration.test.ts tests/score-release.test.ts tests/experience.test.ts` passed **37/37**. This includes the new prefill, transaction race, email-absence, engagement-control, venue-privacy and hidden-score regressions. Root is independently running full suite/typecheck/build for this ref; the auditor does not claim those runs here.

No new P0/P1 privacy or capability finding was identified in this correction pass. One P2 readiness bug remains: `PortalService.compute()` checks `REVIEW_INCOMPLETE` at `lib/service.ts:1878` before checking the project/version tombstone at line 1895. Reproduction: commit a synthetic project without a review, soft-remove its project, then call owner `compute()`; it still throws `REVIEW_INCOMPLETE` instead of excluding that removed record. Move removal filtering before review-readiness validation. This affects scoring availability, not private-data exposure or immutable history. Reported to root for correction.

This verdict is bounded to `7919187`, the focused checks and source paths reviewed. There were no live probes, deployments, credentials, paid providers, real imports/removals or browser operations.

## Final targeted verification — ref `247ddf2`

Verified correction `f102140`: project/latest-submission tombstone filtering now runs at the start of the compute loop, before review lookup or coverage validation. The prior unreviewed-removal reproduction is covered by the focused test `unreviewed removed projects do not block active scoring coverage and cannot be edited, while history remains`, which passed **1/1** using the direct Node/tsx test loader. Removed projects report `canCommit=false`, reject writes with `RECORD_REMOVED`, and retain the committed version.

The last reported P2 is closed. There are no unresolved findings from this bounded integrated audit. The isolated v4-only candidate's previously documented authorization mismatch remains a separate source-boundary observation; it is not a finding against the integrated implementation. Root owns final full-suite, production build/artifact and smoke evidence. No live operations were performed.

## Bounded follow-up — operational owner setup/export ref `811890d`

Reviewed the isolated `fix/operational-owner-setup` follow-up on a fresh auditor branch. No new findings were identified in the requested setup, participant-export or verified-content paths.

- Setup preview/save both require existing owner authority and strict literal-true privacy/rules acknowledgements. The preview digest binds server owner ID, current policy/version, operation and normalized audit reason. Save recomputes it, requires the exact confirmation token and preserves current enabled scopes, weights and unresolved judging confirmations. Fresh initialization remains inactive; enabling either scope is a separate owner action. Existing registration/team/profile behavior remains independent.
- Version-conditional persistence, transactional write assertions and policy-history/audit writes form one atomic batch. A synthetic two-save interleaving produced one success, one rejection, exactly one history entry and one version increment; active/scopes/weights were unchanged, and no write guard remained.
- Participant CSV uses the explicit operational column allowlist, constrained filter/pagination values, shared table ordering/filter semantics and formula-safe cells. It does not serialize nested management rows, phones, credit values or private profile fields. Service list and export API entry points require current owner/admin authority; the API rechecks staff authorization after projection/filter work and returns no-store responses.
- Verified profile categories use a fixed list with server validation; the new public organizer assets/content introduce no private data or capability path within the reviewed diff.

Focused tests passed **14/14**: `tests/owner-operational-setup.test.ts`, `tests/participant-export.test.ts`, and `tests/verified-content.test.ts` via the direct Node/tsx loader. Root owns the separate full-suite/build/smoke run. This verdict covers the requested local follow-up ref only; no live/native publication, credential, real-record or private-venue-value operation was performed.

## Visual-correction security pass — dirty integration based on `68f5d5d`

Reviewed the requested uncommitted server/UI contracts in `.worktrees/visual-integration`, without modifying them. Ordinary missing/null/blank reasons normalize to a server annotation while authenticated actor/action/entity/time remain in the atomic audit path. Profile actions alone skip the confirmation dialog. The owner-only Add Admins command accepts an exact normalized email plus confirmation, requires an existing account, hardcodes admin, and rejects other role/user-ID claims. Import count/email fields are presentation metadata stripped before strict server parsing. Private-settings UI removal retains server disclosure guards.

Two confirmed adversarial findings were reported and then independently verified fixed in that dirty tree:

- **P1 grant/removal race:** a target removed after Add Admins preflight could previously receive an admin role and read participant records. The grant now conditionally checks current target activity within its transaction, followed by a write assertion before cleanup/audit. Repeating the deterministic interleaving rejects, leaves zero role rows and zero successful grant-audit rows, and denies the removed account's staff read. Deactivated actors also lose effective staff role/owner capabilities; `staff()` denies them explicitly.
- **P2 participant-hash persistence/retry mismatch:** revised submissions previously blanked the hash only after draft serialization/request hashing, while new legacy submissions still required/stored one. Both input schemas now normalize ignored participant hashes before hashing or serialization. Independent checks observed blank draft/version hashes, one committed version across a changed-hash retry, and a blank new legacy version hash. Existing nonblank legacy evidence still requires its original matching hash.

`tests/visual-correction-contracts.test.ts` passed **7/7** with the direct Node/tsx loader after the fixes. No remaining P0/P1/P2 finding arose from this bounded pass. The reviewed tree was dirty and later changes require their own boundary verification; root owns final suite/build/smoke evidence. No browser/headless, live grant, real record, private venue value, provider or credential operation was performed.

## Retired submission-field regression tests — base `50c574e`

Created isolated branch `test/retired-submission-fields` and added only `tests/retired-submission-fields.test.ts`. Its six revised/legacy cases exercise omitted contributions on an existing three-member team, malformed retired values ignored before persistence and concurrent retry identity, free revised draft saves, unchanged leader/personal-attendance/window/accuracy-attestation/raster-media guards, and exactly three immutable committed versions. Ignored values cannot consume additional retry attempts, leak into stored drafts/versions, or bypass the attempt ceiling.

Validation used a temporary patch containing the root's two current contribution-retirement library edits, confined to the isolated test worktree: **6/6 passed**, formatting completed, and `npm run typecheck` passed. The temporary library patch was then removed. The two omitted-contribution cases were rerun against the unchanged `50c574e` baseline and both failed at the old contribution requirement, confirming meaningful regression coverage. Therefore the new tests intentionally require integration with the root's retirement implementation. No library/app changes are included in the test commit, and no production action occurred.
