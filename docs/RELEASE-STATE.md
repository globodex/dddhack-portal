# Portal release evidence ledger

This is the single current Done / WIP / Left ledger. Implemented, integrated, tested, visually accepted and published are separate states. Historical evidence remains in the linked reports.

## Release boundary

- **Published:** public v5, source `f1a4b3db83e2263170e8b5fb4738b18f0e218b8d`. No V6 publication.
- **Owner:** exclusive editing transferred to the fresh local thread. Integration is `.worktrees/visual-integration`, branch `fix/visual-correction-integration`. Earlier worktrees and dirty files are preserved.
- **Current profile / Dashboard artifact:** source `e0fbc27c87449ff499427589108b201ab7829365`, Worker `cd37903033f7f01ca7bb19aa6c33c79fcdf0552727b434b7bf26b76949f54241`. Production build and TypeScript pass. Matching actual browser comparison is in progress; user acceptance remains separate.
- **Passing integrated regression checkpoint:** 199/199 serial regressions, TypeScript, 183-file production artifact review and compiled Worker smoke passed on `ef25bbf`. Later profile / Dashboard changes have focused checks and build evidence; final combined regressions and smoke must be rerun.
- No production data imports/removals, role grants, settings activation, credit reveals, external AI calls, credential creation or publication occurred. Named fake voucher reveals in disposable local QA are recorded separately. Hosted capacity and real ChatGPT login remain unverified.

## Done: implemented, integrated and tested

| Scope | Implementation / integration | Actual evidence | Acceptance / publication |
| --- | --- | --- | --- |
| Delayed mask lettering defect | `5b591ac`: one fetched/decoded Blob mask shared with CSS; original pixels and static Metro preserved | Unit decode/failure/lifecycle checks; seven actual sandboxed browser cases including held mask/fill, failed mask/fill, coarse/reduced, pause/resume/media/resize. Original held/revealed PNGs opened. `evidence/v6-mask/report.json` | Defect correction verified locally; full Home acceptance pending; unpublished |
| Read-query amplification | `5db11a5`: request-local team/person aggregates and batched submission metadata; no global cache/index claims | Four new correctness/privacy/revocation tests plus 31 focused regressions. Same 300/90 assignment local SQL calls Participants 3015→16, Admin Teams 907→13, Discover Teams 731→10. Compiled after-load result below | Backend improvement measured locally; no hosted capacity claim; unpublished |
| Actual Lucide named imports | `5b34b8e`, `df71fe3`, exact `lucide-react` 1.61.0 | Named standard UI icons, authentic supplied logos/custom dots kept separate. TypeScript/build/183-file artifact pass | Final rendered component review remains; unpublished |
| Profile three-step reference | `1e5559d`, `90076a8`, `e0fbc27`: standalone pale canvas, white compact card, desktop fields/avatar split, mobile avatar first, eight small colors, Next / Next / Save | First comparison opened source and clean desktop/mobile originals together. Fixed canvas height, clipped selection ring and Sex-control strip. Final matching recheck: 63 checks pass, 23 original captures, no defects / JS errors / blocked requests / writes. Four clean originals compared beside exact target | Actual reference comparison, not user acceptance; unpublished |
| Dashboard exact reference | `15cb161`, `556b1b5`, `44f731d`, `e0fbc27`: Team / Credits / Project tabs, single expression per participant, private venue, masked personal vouchers, read-only upvotes and attempt history | Matching `e0fbc27` actual run: 17/17 checks, 13 originals, desktop/tablet/mobile, zero JS errors or blocked requests. All originals opened with reference. Fixed Leader alignment, narrow Maps placement and empty team-palette fallback. A separate tablet scroll check confirmed a transparent sticky-header P2; patch and targeted matching recapture pending | Eight original main-pair images saved to Library; receipt `evidence/v6-main-pair-e0fbc27/library-delivery.json`; no user acceptance; unpublished |
| Admin hierarchy correction | `4aaa1af`, `55a0aef`, `c3c5c30`: compact rows, black primaries, bounded import, single mobile export, grouped Credits | Actual 41/41 checks, 36 captures, zero JS errors or committing writes; named synthetic confirmations cancelled | Earlier correction tested; newly delivered exact Admin / Settings boards now in isolated implementation; unpublished |
| Hero / navigation / date / arrows | `72b78e3`, `56c779c`, `e4b8abc`, `f4f8413`: exact date, clean Register, Lucide arrows, eight expressions / five tiers, falling repulsive bottom strip, sticky navbar | Matching actual desktop/tablet first-fold checks pass. Repulsion measured up to 181.58 px, pause/reduced/offscreen/resize checked. Lower Venue/FAQ column regression was found and fixed in `9f4d856`; matching recheck pending | Whole Home acceptance pending; unpublished |
| Timezone hydration and roster recovery | `a5e5fb5`: explicit IST timestamps; only `LUMA_EMAIL_MISMATCH` receives the intended safe recovery shell | Regression and compiled smoke pass. Actual six desktop/tablet/mobile critical cases pass with no JS errors; private API remains forbidden/no-store | Local confirmed defects fixed; unpublished |
| Lower desktop sections | `ef25bbf`, `9f4d856`: shared Schedule / Venue / eight Rules / FAQ composition, desktop expression columns | Source / TypeScript / build pass. Actual review exposed inherited Venue/FAQ styles; scoped fix integrated, matching recheck pending | No organizer or portrait-backdrop completion claim; unpublished |
| Existing core contracts | Ecosystem checkboxes, separate Cerebras declaration, voucher-only credits preserving legacy ciphertext, privacy-safe Discovery modal, immutable attempts/votes and role gates remain integrated | Existing regression suite and compiled smoke | No real voucher allocation or unresolved judging activation; user visual acceptance still open |

## Measured read-path improvement

Unchanged bounded compiled Worker + real disposable D1 workload: exactly 300 participants plus 2 operational admins, 90 teams, 300 memberships, max 5/team; same seed and route cohorts. No competing browser/build/test workers during timed work. Worker/source fingerprint and immutable snapshot recorded.

| Normal read cohort | Previous p50 / p95 ms | V6 p50 / p95 ms |
| --- | ---: | ---: |
| concurrency 1 | 28.9 / 312.8 | 10.1 / 84.3 |
| concurrency 4 | 368.7 / 825.2 | 116.9 / 158.2 |
| concurrency 8 | 525.2 / 1560.0 | 178.5 / 397.5 |
| concurrency 16 | 1269.7 / 2772.8 | 365.9 / 847.1 |

Concurrency 16 read p95 was approximately 69.4% lower. All 1,986 requests completed: 1,870 successes, 116 expected rejections,zero unexpected errors. Final invariants: 90 projects, 270 immutable versions/receipts, 600 unique votes, no fourth attempts/duplicate vote rows/FK violations/outbound calls/AI jobs. These local measurements are not hosted capacity. Baseline: `docs/load-300-baseline.json`; exact after report: `docs/load-300-after-v6.json` (source72b78e3, Workerd1d05cc2).

Lossless PNG compression remains integrated `592e5f5`: 381,027 bytes / 10.41% saved with identical pixels/alpha. New mask browser run measures 3,279,047 encoded artwork bytes on fine desktop and 1,371,819 on cold coarse/reduced contexts; no second network CSS-mask request. This is a byte measurement, not a loading-time claim.

## WIP

1. The promised profile / Dashboard desktop/mobile batch is internally reviewed and saved as eight original Library images. Parent delivery uses `evidence/v6-main-pair-e0fbc27/library-delivery.json`. Captures use only synthetic identities, private venue and credit inventory; no revealed voucher values are captured or uploaded.
2. Further public-project read batching is ready in isolated commit `e2a42f2`, audited but not integrated. Measured SQL calls are 204 → 13 for 24 cards and 156 → 13 for 18 cards in the focused fixture. Six new correctness/privacy/revocation tests pass. Repeat the same compiled 300/90 workload only after integration and build; no latency improvement from this new patch is claimed yet.
3. Separate active isolated lanes implement the exact delivered Admin / Settings boards, Discover / Rules boards, and Projects / submission boards. Integration owns shell, shared tokens, auth and backend. No competing edits to shared styles.
4. The exact selected organizer attachment `libfile_73355cbeb8b08191be77e6bcfa52ce82` is resolved in `SELECTED-ORGANIZERS.md`. Isolated commit `c273ccf` implements that geometry, smaller original portraits with matching rings and whole-unit origin slides. Audited source; integration and matching actual verification remain pending. Rejected organizer boards are not implemented.
5. One root ledger tracks source, tests, actual comparison, Library delivery, acceptance and publication separately. Screenshot binaries remain local / Library, not source commits.

## Left / release gates

- Finish and compare matching actual desktop/tablet/mobile captures for remaining routes and meaningful states. No full-site visual pass or user acceptance exists.
- Verify the tablet sticky navbar on scroll and apply any confirmed background fix.
- Finish the requested bounded progressive portrait background dots. No animated behavior is claimed from static mockups.
- Client navigation, role/editor code splitting, and measured focus/visibility refresh coalescing remain pending. Existing history fetch is on demand; it is not a lazy-split editor bundle. Private responses/history remain `no-store`.
- Run final combined serial regression, TypeScript, build / artifact review and compiled smoke after integration. Preserve the reproducible 300/90 baseline and rerun for the queued performance change with exclusive timed infrastructure.
- No publication before visual/functional acceptance and any applicable action-time approval for one fresh existing-Site source credential. Preserve production config 3 and inactive unresolved judging / AI. No full V6 publication estimate is justified while these gates remain open.

## V7 priorities explicitly deferred from V6

1. Implement and test AI verification and background processing. No real API calls or credential changes are authorized by this deferral; existing approval gates apply when V7 begins.
2. Add comprehensive combined-flow end-to-end regression coverage after the UI changes. Basic V6 regression, permission, build, smoke and visual safety checks remain required.

Unresolved scoring decisions remain deferred separately. AI integration is not part of completed V6.
