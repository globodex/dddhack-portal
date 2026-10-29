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
