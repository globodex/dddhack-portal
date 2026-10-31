# Simplified portal flow — local review only

Base: ed80cc5372be94bab46c491e0295dc343e271e71. No push, deploy, hosted mutation, paid evaluation or historical deletion. Preliminary/off-platform judging is outside this portal flow.

## Proposed screen structure for mockups

Keep actual shared black hamburger, expression avatar, full-width admin shell, compact gradient/dot cards and existing mobile gutters. Use synthetic identities/projects only.

1. Owner Settings → Event: submission window card (opens/closes in IST, existing preview/confirm), then AI model card. Model select plus four compact price tiles; below, saved model's recorded input/output/cached/total token metrics. Show unavailable for missing telemetry/billed cost. Configuration uses existing server secrets, never an API-key input/client payload. Ordinary admins do not receive selected model or usage. Account access is not implied by choosing a model.
2. Admin Submissions: top three cards Projects / Submissions / Drafts, search plus compact filter icon, readable project list. Identity/banner compact, team members inline with permitted chips/icons. Per-project review offers current-version human mark/private note, explicit AI evaluation status/action and eligibility review. No appeals CTA or judging clock. Prefer a compact insights disclosure over a dense analytics wall. Drafts remain private and never enter committed score cohorts.
3. Results: scoring configuration and score breakdown live here. Show current versus frozen provenance, missing component as Awaiting scores, actual zero as 0. Component rows: AI, human, collaboration/non-demographic diversity, votes, Codex/question-response evidence, feedback bonus, penalties. Individual question answers show saved response and available evidence; do not invent a numerical question mark. Existing human50/AI30/votes5/collaboration10/Codex5 plus feedback up to5 are defaults, not newly approved weights. Preserve a saved custom policy; no new formula is implemented.
4. Public project: voting continuously available subject to auth/removal/own-team/integrity rules. Feedback uses a fixed trimmed minimum30; public max1500 remains. Staff feedback stays available even if participant feedback is paused. Posting does not itself qualify feedback for score bonuses.

Mobile: single-column cards, price grid wraps, native labelled model select; no horizontal scroll. Preserve keyboard focus/loading/error states and existing full-screen navigation. Parent coordinates visual mockups; this document is a code-grounded brief, not a claim that images were generated.

## Implemented independently of unresolved scoring

- Public/legacy voting no longer obey pause/calendar controls. Existing votes, audit rows and snapshot data are preserved. Reusing the old API to pause voting is rejected.
- Active admin/owner comments bypass participant feedback pause in projection, command and database guard, via transaction-scoped server-created capability. Ordinary participants retain their existing audience/eligibility rules. Legacy staff feedback bypasses its calendar/check-in gates; own-team and immutable-result guards remain.
- Explicit AI job dispatch/run and reevaluation are not gated by participant submission close. Version binding, approved repository snapshot, provider readiness, job attempts/lease and freeze/remove checks remain. No worker is automatically enabled and no paid request ran.
- Legacy human judge scoring no longer obeys submission/judging dates; assignment/conflict/auth/freeze checks remain. Existing modern staff project reviews were already independent of those dates.
- Feedback posting minimum is static30 after trimming. Existing public max1500 and legacy max500 remain; ordinary duplicate/abuse protections remain. Exposed feedback minimum/target controls removed; the historical target value remains in saved policy because its scoring replacement is unresolved.
- Owner model choices use official OpenAI standard short-context text prices in USD/1M tokens, checked2026-10-31. Cached input is included in input telemetry. Charged cost remains unavailable; no billing amount is inferred. Provider is the existing OpenAI Responses integration; a Cerebras provider adapter/key flow is not fabricated.

## Dependencies and decisions still required

- Freeze/reveal: existing snapshot freeze still requires historical score-policy/closing-date readiness. Hiding the old date inputs does NOT remove this backend condition. Recommended replacement is explicit owner Freeze with full readiness preview, no deadline, preserving immutable snapshot/reveal semantics; requires an explicit decision before implementing. Current judging is independent even while final freeze remains constrained. No automatic finalization/reveal/top-five changes.
- Weights/question scoring: confirm any change to existing component weights and whether per-question rows are explanation of existing AI areas or new independently weighted marks. Do not double count response claims with AI/Codex components. Diversity only documented contributions/complementary project skills, never gender or other protected traits.
- Feedback target: the UI tuning is removed, but stored score denominator stays intact until a replacement bonus formula is approved. Voting being open forever also does not silently change the existing scored-engagement qualification/cohort window; choose snapshot-time aggregation versus retaining historical score windows before changing final totals.
- Provider configuration/access: existing owner model setting selects future evaluations, not credential creation or account-access verification. Existing repository snapshot approval UI and automatic queue draining remain outstanding; explicit approved evidence/job processing is still necessary. No live/provider secrets touched.

## Deployment implications

This follow-up is separate from ready package ed80cc5 and has not replaced its archive. New append-only migration0112_continuous_engagement.sql (SQLite test equivalent0033) removes legacy voting time/pause triggers and adds exact transaction-capability exemptions for staff feedback. All17 historical SQL checksums remain unchanged; the new plan has18 entries. Backend package must be rebuilt from final approved source after this scope is settled. No migration/package/deployment commands from the previous ready package apply automatically to this follow-up.

## Local verification checkpoint

-18 focused tests passed (SQLite/PGlite, selected model telemetry/privacy, explicit evaluation and unavailable-provider handling).
-51 related regression tests passed (permissions, settings/review UI, engagement qualification, provider grading and immutable result gates).
-17 existing populated-upgrade/ledger/Windows-source tests passed against the appended18-entry plan.
-2 dedicated0112 tests passed: LF/CRLF17→18, unchanged historical rows/checksums, failed trigger replacement rollback, pending-only application and repeat inspection.
-Final16-test UI/continuous-operation rerun passed. An earlier core run had one obsolete voting-switch rendering assertion; it was corrected and rerun successfully. Do not describe that earlier run as green.
-Actual synthetic browser1440/390 passed: model select/save (local DB only), owner-only projection, no obsolete date/min/target inputs, no horizontal overflow and staff feedback while participant feedback is paused. No provider call or production write. Captures outside Git at `/workspace/simplified-judging-review/screens/`.
-Native PostgreSQL multi-connection concurrency and hosted behavior were not verified; PGlite verifies PostgreSQL SQL/trigger/transaction behavior only. No lint script is configured. A fresh full repository aggregate was not run for this design-stage checkpoint.
-The prior ready backend ZIP remains byte-identical; rebuilding it for this follow-up is intentionally deferred until policy/design decisions settle. Never deploy the old package as though it contained these new changes.
