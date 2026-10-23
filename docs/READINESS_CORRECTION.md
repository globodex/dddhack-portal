# Local correctness correction — not deployed

This patch separates participant operations from judging/scoring. Published public version 4 and its runtime config 3 remain unchanged. No live policy activation, roles, imports, reveals, credentials or provider calls occurred. Further visual implementation/publication is on hold for the requested mockup review.

## Corrected readiness

Submission readiness requires explicit submission enablement and only confirmed operational requirements: valid opening/cutoff, deployment eligibility rule and privacy/retention notice. Check-in has a separate enablement scope and requires its own Luma/approval and privacy requirements. The existing active flag remains an operational envelope; explicit operationScopes prevent enabling one function from enabling the other. Legacy fully active events with no scoped field remain compatible.

Only owner actions can enable operations, with current policy version, explicit intent, reason, audit and policy history. No action is invoked automatically. Existing full activation continues to require every scoring confirmation. After operational enablement, the owner can record still-pending judging definitions without changing protected operational rules; deadline/weight changes retain their dedicated preview paths. Judging edits do not mark confirmation flags automatically.

Valid operational-only submissions now commit even when diversity, vote normalization, AI fallback and other judging decisions remain incomplete. Profile/leader authorization, all-member Going approval, required logo/banner, GitHub URL, contributions, attestation, server window, frozen-result guard and three successful attempts remain enforced. Failed writes consume no version. Attendance can be recorded without a credit key; credit allocation remains separately protected.

The newly user-confirmed defaults are: submissions open November 1 at 08:00 IST, and deployment link is optional for every project. No web/non-web classification, substitute video or extra mandatory evidence is introduced. Submission cutoff remains 16:00 IST; combined whole-idea/roster lock remains October 29 at 23:59 IST. Luma/check-in policy remains unconfirmed. No strict participant cap, shared team size of at most five, global base weights and manual award order are preserved.

Dashboard and admin setup now report independent submission/check-in/scoring states. Missing setup yields actionable 409 responses and draft-safe messages instead of DATABASE_NOT_INITIALIZED. Scoring/reveal gates remain fail-closed.

## Explicit engagement qualification

The original raw count of all new public upvotes/comments has been removed from the scorer. Scored engagement now requires an explicitly confirmed versioned qualification policy selecting audience, scoring window, staff feedback review and duplicate treatment. None is selected or confirmed by default. Public participation and community-order counts remain separate and unchanged.

Scoring uses only upvotes matching the selected audience/time window. Feedback needs an authorized staff qualification record tied to comment text hash, accepted submission version and qualification-rule version, within the selected audience/window and declared length bounds. It counts distinct valid authors and applies the explicitly selected duplicate rule. Meaningfulness is a staff decision, not a count of all text or a new English-only inference heuristic. Unreviewed candidate feedback blocks final computation rather than silently receiving zero or counting as valid. Changed text/rule/submission versions invalidate prior qualification. Review history is immutable and result freeze blocks further qualification; revision triggers include attendance changes.

Diversity uses an explicit supported non-demographic assessment basis. Negated words such as “do not infer gender or demographic entropy” no longer fail keyword checks. Unsupported demographic assessment modes/extra algorithm fields are rejected. Free-form rubric text is not executable scoring logic; no profile gender/name/photo is used for automatic demographic scoring. Basis and rubric confirmation remain unset by default.

## Verification

- TypeScript: pass.
- Regression suite: 51 pass, 0 fail, including actual local D1 scope enablement, additive migration/constraint parity, operational-only submission, separate check-in, permissions, windows, Going/media/repository/attempt checks, feedback qualification and actual score-bonus computation.
- Official Sites production build/artifact gate: pass, 133 artifact files. Existing build-tool advisory mitigation remains unchanged.
- Compiled Worker smoke: pass in disposable local D1. Operational-only submission 200, scoring 409, check-in 409 before separate enablement and 200 after it. No credit key, real API or live data required.
- A D1-specific false failure was caught and fixed: D1 meta.changes can include trigger writes. Scoped/full activation now relies on the transactional SQL assertion of the direct update, rather than rejecting success afterward based on trigger-inclusive metadata.
- Browser/visual/session-device verification remains unavailable locally. Static UI changes here only reflect corrected setup readiness, not the requested redesign.

Evidence: evidence/readiness-*.log, evidence/sites-production-smoke.json, evidence/sites-artifact-reachability.json. Append-only migrations: drizzle/0010_groovy_black_cat.sql and local db/migrations/0007_operational_qualification.sql. They add a feedback-review ledger and scope/revision guards; no data reset or live migration was run.

## Minimal remaining decisions

For participant operations: privacy/retention notice and duration. For check-in additionally: the user’s pending Luma/Going/override rule; do not decide it from the default false value.

For scoring: diversity rubric and assessment confirmation; Codex assessor/rubric confirmation; scoring-qualified engagement audience/window/normalization, feedback validity/threshold and duplicate policy; judge close, appeal deadline, coverage and tie procedure; AI-failure handling and proposed false-claim penalties. Record the final approved disclosure after those definitions are set. Do not re-ask the resolved cap, locks, opening/cutoff, optional deployment, base weights or manual reveal choices. AI/provider execution and a reliable background mechanism remain separate technical work, with no paid test approved here.
