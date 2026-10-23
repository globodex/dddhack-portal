# Session, reveal and confirmed-policy release

Local engineering runs on param302-linux in the existing DDEhack-portal checkout. This record supersedes earlier unresolved choices in UX_REVISION_V3.md. Publication state is recorded separately in CORE_PUBLICATION.md after a terminal native deployment result.

## Confirmed event choices

No strict participant cap. Individual approval remains required; teams still have at most five members. Pre-made team roster and the whole idea lock together at **29 October 2026, 23:59 IST** (18:29 UTC). The public submission deadline is **1 November 2026, 16:00 IST** (10:30 UTC), with no alternative cutoff advertised. These three choices are included in the default draft policy; unrelated judging/operational decisions are not silently confirmed.

Owner Settings can preview an extension by a positive whole number of minutes, including an IST date rollover. Publication requires the matching preview fingerprint, policy version, explicit confirmation and reason. Negative, fractional, zero, excessive or invalid values fail. Existing submissions are retained. The public API and initial SSR use the same current deadline. A preview warns if the extension reaches an existing judging close; final scoring stays blocked until its dependent operating window is corrected.

The base global weights are 50 human + 30 AI + 5 votes + 10 diversity + 5 Codex, plus up to 5 feedback bonus (maximum 105). Owner-only preview/publication changes one global version for everyone. Per-team overrides are rejected; frozen results block policy changes. Audits and append-only policy history record the versions. Legacy input rubrics are normalized to the chosen weights. No gender inference or automatic sensitive-attribute scoring was added. Diversity/Codex criteria, vote/feedback validity and normalization, judging/appeal windows and other remaining definitions still need explicit confirmation before event activation/scoring. No live activation occurred.

## Managed sessions and logout

The official Sites identity-and-secrets contract owns hosted authentication and the reserved signin/signout/callback routes. Valid managed identity is consumed on every request; normal navigation/refresh does not trigger a new app-created session or force sign-in when identity is present. The app does not control or extend platform session lifetime. It stores no credentials in localStorage, URLs or bundles. Harmless animation preferences remain in localStorage.

Log out first opens the accessible confirmation dialog, then uses top-level navigation to the official /signout-with-chatgpt route. The isolated local adapter expires its HttpOnly fixture cookie instead. Page-hide clears private view state and invalidates in-flight loads; a restored page refreshes authorization. Failed anonymous reads clear the private projection. Real hosted cookie expiry, reopening a browser, interactive sign-in and managed logout/invalidation remain **unverified** without a browser. Local tests prove repeated trusted-identity requests work, no app session cookie is issued, fixture logout expires its cookie and missing identity gets 401; these do not prove platform cookie behavior.

## Reveal stages

Only current admins and the owner can reveal; roles are re-read server-side. No live grants or reveal actions occurred.

1. Community: eligible projects follow upvotes descending, immutable first submission time ascending, then stable ID for exact ties. No score, numeric rank, formula or evaluation progress is public.
2. Reveal AI scores: requires an explicit public intent, active confirmed policy, complete current-version finalized persisted provider evaluations and an explicit finite provider score in the original 0–30 range. It never derives or fabricates a score from a disabled/pending evaluation. The stage snapshots the persisted scores and reorders the board by score. Ties retain first-submission order. No formula or private report is exposed.
3. Reveal Final score: requires a current frozen snapshot and confirmed scoring disclosure. It starts a new immutable stage. Admins choose any unrevealed top-five position in **manual order**. Each action is idempotent, explicit and audited. Previous stage history remains protected in D1.
4. During unveiling, only explicitly unveiled awards get public identities, positions and final scores. The ordinary project list stays in community order. Other final placements are withheld until all top-five awards are unveiled: publishing every lower placement earlier would disclose the hidden five by set subtraction. At completion, full final-score order becomes public. Existing public project descriptions remain discoverable throughout.

Confirmed criteria and version-matched weights appear only after the final stage starts, inside a discreet Info/details section. Public API, project detail, legacy /winners and cached SSR projections cannot bypass the staged disclosure. Legacy publish-results is disabled. Reveals are never activated by adding code or deploying migrations.

## Confirmations

Every app mutation routed through the portal action handler opens a native modal dialog before the API write. It names the affected object and action; critical public actions state the audience and consequences. Cancel has initial focus and preserves data; Escape cancels, modal keyboard focus is contained, and focus returns to the trigger or main region. Prompts do not auto-dismiss. One pending/action guard prevents double submit; a status toast reports completion/cancellation/errors. Read-only import/policy previews do not publish anything. Server checks separately validate critical reveal intent, policy preview fingerprints, current versions and authorization.

Provider-free state/controller tests cover cancellation and repeated decisions; static markup checks cover dialog semantics. Actual keyboard, touch and focus behavior remain browser QA work.

## Verification and remaining limits

TypeScript and all **41** regression tests pass. Tests include actual local D1 migration/constraint parity, staged disclosure/manual order, unauthorized/premature reveal, provider prerequisites, immutable histories, policy version/CAS, extensions and rollover, shared lock timing, private venue revocation and confirmation cancellation. The official production build/artifact review inspects **131 files**, retaining the documented build-only dependency mitigation. Compiled Worker checks cover managed identity boundaries, public/default deadline, owner preview and explicit reveal-intent rejection. Evidence is in evidence/stages-*.log and evidence/sites-production-smoke.json.

Browser inventory remains unavailable; no interactive session/visual/device QA or screenshot success is claimed. No paid evaluation, reliable background runner, credit key, role grant, import, generated Delhi artwork or policy activation was introduced. Live runtime config revision 3 was verified read-only: the existing OPENAI_API_KEY remains secret, with PORTAL_RUNTIME=sites and PORTAL_TRUST_SITES_DISPATCH=true. Publication must preserve that config.

Append-only hosted Drizzle migrations 0002–0009 upgrade the live v3 schema; local migrations 0003–0006 cover the same additions. No reset or destructive data migration is included. Native read-only inspection confirmed no existing event-settings row, so confirmed defaults do not overwrite a stored event policy.
