# Local release checkpoint — 23 October 2026

Tested source commit: `4cc46437075ef46fa4a86266928fb338d8172bd1`.

This revision is implemented locally on param302-linux in the existing feature branch. It is not deployed. Public Site v4, runtime config revision 3, role grants, policies, real data, provider configuration and score reveals have not been changed. No credential was created, no real credit was imported/revealed, and no paid evaluation ran.

## Current operational contract

Individual states are Registered, Going, Checked in and manually recorded Absent. No automatic absence cutoff/scope is configured. Portal individual approval is authoritative; Luma is registration only. Teams display Forming, Locked, Not submitted or Submitted. Eligibility is a separate property of a committed version, never a team lifecycle label. Voluntary leader lock freezes membership and team details for review without granting approval. Database guards preserve the lock, even for membership moves out of a locked team.

At least one effective individual check-in permits the team’s submission workspace and endpoints, within an explicitly enabled operational window. That team gate remains as confirmed; a possible narrower individual gate is still being clarified. Attendance, individual approval, lock and committed submission facts remain separate. Only individually checked-in members qualify for prizes/rewards; absent members do not disqualify their team. This patch performs no prize allocation.

The initial committed project consumes attempt one. There are exactly three immutable committed versions; after the third the entire project is read-only. Draft saves and wizard navigation consume no attempts. Concurrent identical retries return the existing committed version, rather than spend another attempt. Both the revised and legacy submission paths have retry protection. Display-only status overrides cannot reset counts, unlock details, create submission records or manufacture public entries. Individual/team overrides require confirmation, audit reason and server authorization. Registered participants in Locked teams are prioritized by earliest lock; status/team/lock filters and safe exports are available.

## Repository evidence and scoring boundaries

Both repository creation and first commit must be strictly after 2026-11-01T02:30:00Z (1 November 08:00 IST). Exact-boundary values fail. Missing/inaccessible metadata and API failure remain unverifiable; they are not proven timing violations. The full submitted SHA is saved in each immutable version. Organizer-supplied evidence records are bound to that exact version/SHA and retained immutably, with source, observation time, timestamps, decision and reason. No automatic external repository API verification is claimed.

Established violations require a specific rule and private evidence. Admins can decide eligibility; assigned judges without a membership conflict can restore eligibility with explicit reason and audit. This grants no other admin powers and makes no live role assignments. Restored committed submissions remain Submitted and may reappear publicly without waiting for score reveal. Repository dates are operational evidence, not proof of original authorship. No repository recreation/history-rewriting workaround is suggested.

AI weight zero removes only the AI scoring contribution; it does not override project eligibility. A null AI score remains null in persisted reviews. Zero-weight computation uses a zero contribution without fabricating an evaluation. AI reveal still requires persisted, current-version provider results. Judging definitions and operational activation remain independently gated.

## Privacy and interface

Credits require the assigned checked-in user’s current verified identity and the allocation’s email snapshot. Team membership grants no access. Legacy rows without a matching email snapshot fail closed; this patch does not backfill identities or allocate production credits. Staff may edit shared Markdown setup instructions. A small safe Markdown renderer supports steps/code/HTTPS links without HTML execution, remote fetching or secret interpolation.

Approved home/profile studies are implemented, subject to browser QA: public top-right navigation, user-supplied SVG brand with Codex Community New Delhi text, reference-style decorative glyphs/colors, Schedule/Venue/Rules/FAQ stacks, organizers below, icon-only motion pause, reduced-motion alternatives and an accessible scroll cue. The two-step profile asks full name/sex, then one-line bio/social links with optional photo. Sex choices are exactly Male/Female/Non-binary; skills are no longer required. Existing profile values are preserved until an explicit update; no demographic inference is performed. Host photos still use initials until authentic identities/assets are verified.

The approved Delhi v3 asset pack supplies a fixed alpha mask, separately moving overscanned fill and completely stationary Metro. Movement is inverse and clamped to ±6/±4 source pixels, scaled to rendered width. Pointer leave/resize/pause reset it. Touch, reduced motion, JS disabled, load failure or unsupported masks use the exact approved fallback. Assets were materialized from Library and inspected locally. Upstream asset-only cloud QA is not integration/browser QA. Provenance/limitations: docs/assets/delhi-v3-manifest.json.

The submission wizard has three local steps, remaining-attempt display, review/confirmation and preserved draft values. The signed-in Rules page has five concise categories; public basics stay on Home. Remaining page redesigns await their separate mockup review.

Optional profile photos use existing supported D1 storage; no external storage provider. Client processing crops/re-encodes PNG/JPEG to a square PNG. Server processing validates PNG signature, dimensions, CRCs, compression/filter bytes and bounded decompression, recompresses raster rows and discards ancillary metadata. SVG and cross-user writes are rejected. Photos are private unless the existing profile-public consent permits access; serving uses no-store/nosniff/sandbox headers and fresh authorization. No photo/name/sex inference is used for scoring.

Public Home/Projects/Leaderboard/project detail receive public-only SSR, canonical metadata/social previews, robots and a sitemap of eligible public projects. Private routes, including Rules, remain authenticated/noindex and absent from the sitemap. Event structured data contains general public venue only. HTTP checks verify emitted markup; no search indexing/ranking or comprehensive external SEO audit is claimed.

## Migration and release gates

Pending hosted additive migrations are drizzle/0010_groovy_black_cat.sql (prior correctness patch), 0011_wealthy_spirit.sql, 0012_vengeful_shape.sql and 0013_fantastic_slipstream.sql. The corresponding local migrations are 0007–0010. The schema defines 54 application tables. Existing rows are preserved; no reset/drop-table path is used. New records and indexes support locks, retry receipts, status facts, repository evidence/decision history and photos. Constraint/revision triggers protect immutable history and scoring snapshots.

Verified locally: TypeScript; full regression suite; official Sites build and artifact reachability gate; compiled Worker smoke using disposable synthetic D1. Final verification: 63 tests passed, 0 failed; TypeScript passed; production artifact gate passed with 151 files. Compiled Worker checks passed, including public SSR/canonical metadata, robots/sitemap, own photo 200 / private anonymous photo 404 and operational/auth boundaries. Evidence is in evidence/release-2026-10-23-*.log, evidence/sites-production-smoke.json and evidence/sites-artifact-reachability.json. Browser rendering, keyboard/touch/resize interaction, real managed ChatGPT login/logout and device QA remain unverified because this local task has no controllable browser. The 8 PM IST target is not an acceptance claim.

Before publication: finish reviewed visual/device checks where a supported browser is available; review this source/migration set and current policies. Keep OPENAI_API_KEY environment revision 3 intact, without provider activation/calls. Publication is held by the current instruction; any required fresh publishing credential needs its specific action-time approval. No deployment or credential operation has been attempted in this turn.
