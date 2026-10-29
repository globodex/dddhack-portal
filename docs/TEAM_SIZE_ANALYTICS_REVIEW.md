# Team-size filter and approval analytics correction — local review

Baseline: published `0f03975f38445d1e450b7f0f4872ac1905ca6b6e`. This follow-up is not authorized for publication.

## Confirmed cause

`lib/admin-stats.ts` counted a nonempty team as approved when all current membership registrations were approved, without requiring an actual team lock. The dashboard/admin approval helper requires both a real lock and unanimous underlying registration approval. Thus an unlocked solo team with approved registration could inflate the Approved/Solo analytics while remaining Forming in the list. Display-only lock overrides do not count as actual locks.

The aggregate now requires the actual lock. Approved Absent members retain registration approval; personal attendance and venue permissions are unchanged. Pending teams remains the complement of approved teams in the active analytics population. No stored team/member status is changed to adjust counts.

A card's `approved/total approved` is an approval ratio. `1/1` describes an approved one-member team; an unapproved solo can show `0/1`. The analytics card covers the entire active collection independently of list search/status/profile/size filters and selected distribution cohort. These scope distinctions remain intentional.

The reported six-versus-three live difference is consistent with the confirmed predicate mismatch, but live records were not queried and the identities of the excess teams are not established.

## New control

Administration → Teams → existing funnel icon → Team size: All sizes, 1 person (solo), 2 people, 3 people, 4 people, 5 people. It stages with existing fields, applies with AND, clears with Clear and contributes to the active-filter count. No new toolbar row.

The backend validates sizes strictly and applies a parameterized membership-count predicate before response presentation. The value participates in presentation cache scopes, request options, team CSV exports and member-email exports. Only the admin Teams view/team exports accept this new filter; no public audience is expanded. Existing whole-collection statistics are unchanged by the selection itself.

## Validation and artifacts

Focused regressions cover SQLite and PostgreSQL semantics via PGlite: sizes 1–5/empty buckets, exact member counts, lock/unlock approval, approved Absent, AND filters, authorization, invalid inputs, API and export parity, presentation-cache separation and query budget. Browser checks cover Apply/Clear and responsive geometry at 1440, 390 and 320 pixels, including a 320×480 short viewport. PGlite is not proof of native concurrent PostgreSQL behavior.

Local synthetic component screenshots: `/workspace/team-size-filter-review/filter-{1440,390,320}.png`. They show the actual filter component with production CSS, not full-page/live captures. No images are tracked or uploaded.

## Rollout impact

No new SQL migration or settings change is required. Both frontend and backend updates are required. The already published `portalapi.zip` (SHA256 `a63f43009afc8df75f7d29783ed8e44759740aaf4ea4d003034bed59bf4834a0`) predates this follow-up and must not be represented as containing it. A new matching backend archive is required before a future approved rollout; it has not been rebuilt as part of this local review.

No push, deployment, hosted database connection/mutation or live participant lookup was performed.

Final local checks: 28 focused tests passed, 0 failed/skipped; production build passed; standalone typecheck passed; `git diff --check` passed. Earlier failed new-test iterations were corrected (SQLite COUNT parameter numeric typing, actual presentation metadata field, member-email CSV projection expectations, and using the guarded admin unlock command rather than direct lock deletion). The clean final run covers those corrections. Full 1,000+ suite was not rerun for this focused follow-up.

## Participant captions and lifecycle filter clarification

Each of the four Teams statistic cards now includes a small participant total beneath the team number. These count all current memberships in that card's team cohort: Total, Locked, Approved or Pending. Thus Pending team's participants includes approved teammates too; it is not the Participants page's count of only unapproved people. The selected Team Sizes cohort also carries its own participant total. Shared members/cohorts are not added together as unique event attendees. Missing old-backend fields are omitted; genuine zero is displayed as zero. All sums are in the same bounded aggregate query.

The explicit `Team status: Approved` regression now tests the actual list: before submission opening and without submitted history, its Solo result matches the Approved/Solo cohort. Once the window opens the same team enters Yet to submit; once committed it enters Submitted. In both later states its underlying approval remains true, so the approval-cohort analytics intentionally still includes it while the literal Approved-stage list does not. This semantic distinction is preserved, not silently redefined. Exact equality across these stages would require choosing to change the filter/cohort meaning; this review does not make that product decision.

Actual component previews use the authorized AdminStats component and production CSS over real aggregates from synthetic fixtures. Files outside Git: `/workspace/team-participant-card-review/cards-{1440,390,320}.png`, with full viewport context `stats-{1440,390,320}.png` and `report.json`. Each cohort's participant caption and absence of horizontal overflow were checked at all three widths, including 320×480. The native Library route remains blocked by the prior HTTP401, so no upload was retried and no Library file IDs exist.

Participant-caption revision: 24 affected tests passed (SQLite and PostgreSQL semantics, literal Approved/Yet to submit/Submitted transitions, aggregate/query budget, exports/cache, zero groups and responsive filter behavior); production build and standalone typecheck passed. The preview browser script additionally checked all five cohort captions at desktop/mobile/short-mobile widths. A failed synthetic submitted-state setup was corrected by using the required synthetic check-in; submission guards were not weakened. No new SQL or archive was produced. No full regression run, hosted verification, push or deployment.

## Approved main-only publication and matching package

The owner subsequently authorized main-only publication and its live Vercel frontend consequence. The review branch must remain unchanged. A new backend ZIP is now built/verified from runtime source `aede2eb7c595b2ddd0708bbd3337ab9e97dac21e`; this supersedes the earlier not-yet-rebuilt review note above. ZIP SHA256 `e2fe6ef514c45cd6f52175b25ce10a4f569fbe08bb648181c7059e07cd97200d`, index `45f6f7ba72839fa2015c4bf14b5412c778e424817182abcdd472c807dc397f67`.93 entries,92 unchanged dependency/native entries,98 exact committed application inputs, independent byte-identical JavaScript, no forbidden inputs, unchanged schema plan, zero packager warnings/env{}. Host smoke200/403/503, zero outbound attempts, host Sharp substituted only in separate smoke copy; ARM64 execution not performed.

No source changes occurred after passing production build/typecheck and24 affected tests. [Fresh Windows backend deployment commands](TEAM_SIZE_ANALYTICS_WINDOWS_ROLLOUT.md) use main, Node checksum verification, a new literal extraction directory and targeted no-env Neon deployment. No agent migration or backend deployment is authorized or performed. Package evidence is in `evidence/team-size-analytics-release/`; images remain outside Git.
