# Revised portal implementation checkpoint — not a release

This work follows the latest owner direction. It supersedes the older continuous-voting / staged AI / top-five reveal design. The older package beginning `4b7cf264` is preserved in its original worktree and is **not** a package for this revision. Nothing here has been pushed or deployed.

## Current implemented slice

- Public navigation says Showcase; existing URLs and the current navigation frame stay intact. Admin navigation includes Showcase and Submissions remains admin-only.
- A single server-aligned submission-window card lives in the shared dashboard shell, before all Team/Credits/Project panels. Final-hour countdown does not remount on tab changes; existing server refresh retains authority for form eligibility.
- Showcase cards have banner, logo, name, pitch, masked score, left upvote/comment actions, share and primary View Project. No listing accordion or score breakdown. Real score values are not rendered before combined release.
- Latest submitted project is an open detail card. Previous versions are secondary history; three-attempt protection remains.
- New judge inputs explicitly use 0–100; immutable historical marks retain canonical 0–10 storage and are displayed on the 100-point scale. Existing clients retain their declared/default historical scale.
- Historical AI-only releases are filtered from public/team score projections. Only owner-authorized combined release remains accepted; all current eligible released projects appear, without a top-five withholding stage. Existing internal snapshot requirement remains until the combined owner interaction is completed.
- Voting service checks the participant opening-inclusive/closing-exclusive window and supports idempotent desired-state toggles. This is PARTIAL until remaining legacy/database guards and coherent UI refresh are verified.
- Known pre-event repository/first-commit timestamps reject eligibility; missing/unreachable evidence stays pending. Exactly 1 November 2026 08:00 IST is not before the event. This is not an automatic repository collector yet.

## Verified evidence for this slice

15 focused tests passed, no failures/skips. Typecheck passed. Browser component integration checks at 1440 and 390 pixels cover persistent dashboard card across all tabs, closing boundary and refreshed schedule; plain Showcase cards, masked/released totals and no horizontal overflow. The captures render actual React components with synthetic fixtures and actual application styles; they are not a hosted end-to-end evaluation or complete application route proof. All captures are outside Git under `/workspace/showcase-evaluation-review/screens`.

Output Library upload is still blocked by the previously observed HTTP 401. It has not been retried or bypassed; local captures are not claimed delivered as Library attachments.

## Remaining work / decisions

- Complete automatic, bounded, current-version-bound repository evidence/snapshot collection, durable evaluation processing/retries and operational worker setup. Existing provider integration still requires approved immutable evidence. No live AI call has been made. Provider/repository failures must never become ineligible.
- Complete owner Reveal scores interaction and public/detail breakdown projection. Existing internal frozen snapshot preserves integrity; the owner must settle whether the single Reveal action also freezes marks and whether incomplete coverage blocks reveal. No individual judge marks may reach public/team responses.
- Questions responses is an intended separate configurable category, but weight, scorer, per-question caps/aggregation, missing-answer and overlap rules are not supplied. Do not invent scores.
- Feedback minimum 30 is provisional interpretation of prior wording, not a claimed explicit numeric approval.
- Complete windowed voting/database consistency, current-version score presentation, masked evaluation status, celebration, sort controls and final full regression/build/browser validation. Old full-suite counts do not validate this revised scope.
- Separate homepage slice: podium above Schedule, conditional Pro-per-approved-member copy, accurately separated prize/API and participant credit amounts; verified Exa logo pending. No protected-trait data goes into evaluation or prize ranking. Collaboration must use documented contribution evidence, without inventing identity attribution.

No final migration plan, matching package or owner rollout instructions have been generated for this incomplete revision. Preserve earlier ready `ed80cc5`, held public-eligibility edits and unrelated diagnostic work.

## Subsequent local implementation slice

- Current-version team evaluation progress now returns only pending/running/retry/completed state, no provider errors or score values. Offline/ungraded reports stay pending; a genuine provider score of zero is a valid completed evaluation. This does not create an automatic worker.
- Released canonical aggregate categories are available only on detail/team breakdowns. Listing projections omit component fields; Judge score is first, no individual marks. Missing historical component data is not fabricated.
- New unpublished `0113_submission_vote_window.sql` supersedes0112's voting calendar; SQLite0034 and Drizzle0036 match. Public comments are not blocked by old pause controls. Both vote tables retain existing identity/security/frozen guards. Vote removal/add uses desired-state commands, and a settings-version change aborts the mutation transaction. Five focused SQLite/PostgreSQL-emulation/upgrade tests passed, including17→19 LF/CRLF suffix rollback and old-row/checksum preservation. Native concurrent PostgreSQL and hosted rollout remain unverified.
- The evolving19-entry plan digest is `3624c82a7dc7026b5db4179dc021e5d88d33c66bafab35c4916c5a476e04293b`; all18 prior SQL blobs are preserved. The source checkout verifier intentionally cannot validate a new SQL blob against HEAD before its local commit. No owner migration commands/package are issued for this unfinished revision.
- Separate homepage preview saved at `77c9742547ff47dc873545c2a6a4a0abe88c27fd` in `/workspace/ddd-prizes-review`: seven tests, typecheck/build and three viewport browser checks passed. Not merged into this runtime checkpoint.

## Later review progress

Actual screenshot ZIP saved successfully through the current native single-file host-upload tool: `libfile_2143977e8d7481919523b0e7ffd90e36`, `portal-actual-review-screenshots.zip`,1,556,922bytes,SHA256 `de9c057a76e34073bfe516e6b91c2f0aad26b83df2caa6d859664656cb8ee1c2`. The previous Python helper had failed at authenticated hosted-tools discovery, before any upload; that denied route was not retried. Native save and local identity metadata succeeded. This supersedes the earlier output-transfer blocker for this deliverable.

Further unpushed implementation: server-side Showcase sort and direction before slicing, score option/default only after reveal; no listing criteria accordion; shared revealed-score summary with public-comment count and Project-tab breakdown navigation; short reduced-motion-safe no-modal submission celebration; legacy judging supports declared0–100 with historical0–10 encoding preserved. The automatic timing collector is tested groundwork only, not a connected evaluation worker. See AUTOMATIC_EVALUATION_NEXT_STEPS.md for remaining implementation and operator boundaries.

## Combined owner reveal implementation

The subsequent authorized combined-flow instruction is implemented: owner readiness preview then explicit confirmation captures and releases the current result set in one transaction, retaining existing coverage/tie/policy checks. The confirmation clearly says judging/evaluation/submission edits become locked. Existing internally frozen results are supported without exposing snapshot controls. Stale/expired previews and partial release failures are refused/rolled back. Six SQLite/PostgreSQL-emulation cases passed before/during/after participant submission times; actual provider runs were not involved. This supersedes the earlier note that combined capture was unfinished. Questions-response formulas and automatic worker integration remain unfinished.
