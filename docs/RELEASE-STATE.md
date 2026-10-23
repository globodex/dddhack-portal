# Portal release evidence ledger

This is the single current Done / WIP / Left ledger. Implemented, integrated, tested, visually accepted and published are separate states. Historical evidence remains in the linked reports.

## Release boundary

- **Published:** public v5, source `f1a4b3db83e2263170e8b5fb4738b18f0e218b8d`. No V6 publication.
- **Owner:** exclusive editing transferred to the fresh local thread. Integration is `.worktrees/visual-integration`, branch `fix/visual-correction-integration`. Earlier worktrees and dirty files are preserved.
- **Current combined browser artifact:** source `8e90450443fd3dc61ddad88448ca4cec8395d494`, Worker `901580c960143319604987bfb37f67e336b5bd228c0d6d8244dcd87515daea13`. TypeScript and the 185-file production build / artifact review pass. Matching actual page, touch and control audits are running; no user acceptance is implied.
- **Regression checkpoint:** 215/215 serial regressions passed before the final Admin / Projects integration. The subsequent combined run passed 214/215 and caught a restored private-arrival Settings control. That control was removed again in `d5c1dc3`; its eight focused contract tests pass. Final combined serial regression and compiled smoke remain required after the current browser fixes.
- No production data imports/removals, role grants, settings activation, credit reveals, external AI calls, credential creation or publication occurred. Named fake voucher reveals in disposable local QA are recorded separately. Hosted capacity and real ChatGPT login remain unverified.

## Done: implemented, integrated and tested

| Scope | Implementation / integration | Actual evidence | Acceptance / publication |
| --- | --- | --- | --- |
| Delayed mask lettering defect | `5b591ac`: one fetched/decoded Blob mask shared with CSS; original pixels and static Metro preserved | Unit decode/failure/lifecycle checks; seven actual sandboxed browser cases including held mask/fill, failed mask/fill, coarse/reduced, pause/resume/media/resize. Original held/revealed PNGs opened. `evidence/v6-mask/report.json` | Defect correction verified locally; full Home acceptance pending; unpublished |
| Read-query amplification | `5db11a5`: request-local team/person aggregates and batched submission metadata; no global cache/index claims | Four new correctness/privacy/revocation tests plus 31 focused regressions. Same 300/90 assignment local SQL calls Participants 3015→16, Admin Teams 907→13, Discover Teams 731→10. Compiled after-load result below | Backend improvement measured locally; no hosted capacity claim; unpublished |
| Actual Lucide named imports | `5b34b8e`, `df71fe3`, exact `lucide-react` 1.61.0 | Named standard UI icons, authentic supplied logos/custom dots kept separate. TypeScript/build/183-file artifact pass | Final rendered component review remains; unpublished |
| Profile three-step reference | `1e5559d`, `90076a8`, `e0fbc27`: standalone pale canvas, white compact card, desktop fields/avatar split, mobile avatar first, eight small colors, Next / Next / Save | First comparison opened source and clean desktop/mobile originals together. Fixed canvas height, clipped selection ring and Sex-control strip. Final matching recheck: 63 checks pass, 23 original captures, no defects / JS errors / blocked requests / writes. Four clean originals compared beside exact target | Actual reference comparison, not user acceptance; unpublished |
| Dashboard exact reference | `15cb161`, `556b1b5`, `44f731d`, `e0fbc27`: Team / Credits / Project tabs, single expression per participant, private venue, masked personal vouchers, read-only upvotes and attempt history | Matching `e0fbc27` actual run: 17/17 checks, 13 originals, desktop/tablet/mobile, zero JS errors or blocked requests. All originals opened with reference. Fixed Leader alignment, narrow Maps placement and empty team-palette fallback. A separate tablet scroll check confirmed a transparent sticky-header P2; opaque white/border patch integrated `28ea026`, targeted matching recapture running | Eight original main-pair images saved to Library; receipt `evidence/v6-main-pair-e0fbc27/library-delivery.json`; no user acceptance; unpublished |
| Admin hierarchy correction | `4aaa1af`, `55a0aef`, `c3c5c30`: compact rows, black primaries, bounded import, single mobile export, grouped Credits | Actual 41/41 checks, 36 captures, zero JS errors or committing writes; named synthetic confirmations cancelled | Exact Admin / Settings / Review / Logs boards integrated `f0b3484`; matching actual comparison and control audit running; unpublished |
| Hero / navigation / date / arrows | `72b78e3`, `56c779c`, `e4b8abc`, `f4f8413`: exact date, clean Register, Lucide arrows, eight expressions / five tiers, falling repulsive bottom strip, sticky navbar | Matching actual desktop/tablet first-fold checks pass. Repulsion measured up to 181.58 px, pause/reduced/offscreen/resize checked. Lower Venue/FAQ column regression was found and fixed in `9f4d856`; matching recheck pending | Whole Home acceptance pending; unpublished |
| Timezone hydration and roster recovery | `a5e5fb5`: explicit IST timestamps; only `LUMA_EMAIL_MISMATCH` receives the intended safe recovery shell | Regression and compiled smoke pass. Actual six desktop/tablet/mobile critical cases pass with no JS errors; private API remains forbidden/no-store | Local confirmed defects fixed; unpublished |
| Lower desktop sections | `ef25bbf`, `9f4d856`: shared Schedule / Venue / eight Rules / FAQ composition, desktop expression columns | Source / TypeScript / build pass. Actual review exposed inherited Venue/FAQ styles; scoped fix integrated, matching recheck pending | Selected organizer geometry integrated `c3bd9aa` and portrait backdrop `8e90450`; actual motion / geometry / legibility checks running; unpublished |
| Existing core contracts | Ecosystem checkboxes, separate Cerebras declaration, voucher-only credits preserving legacy ciphertext, privacy-safe Discovery modal, immutable attempts/votes and role gates remain integrated | Existing regression suite and compiled smoke | No real voucher allocation or unresolved judging activation; user visual acceptance still open |

## Measured read-path improvement

Unchanged bounded compiled Worker + real disposable D1 workload: exactly 300 participants plus 2 operational admins, 90 teams, 300 memberships, max 5/team; same seed and route cohorts. No competing browser/build/test workers during timed work. Worker/source fingerprint and immutable snapshot recorded.

| Normal read cohort | Original p50 / p95 ms | Directory batching p50 / p95 ms | Public-project batching p50 / p95 ms |
| --- | ---: | ---: | ---: |
| concurrency 1 | 28.9 / 312.8 | 10.1 / 84.3 | 10.2 / 29.9 |
| concurrency 4 | 368.7 / 825.2 | 116.9 / 158.2 | 49.3 / 114.9 |
| concurrency 8 | 525.2 / 1560.0 | 178.5 / 397.5 | 83.2 / 132.5 |
| concurrency 16 | 1269.7 / 2772.8 | 365.9 / 847.1 | 162.1 / 283.1 |

Latest concurrency 16 read p95 is approximately 89.8% below the original local baseline, and 66.6% below the directory-batching checkpoint. All 1,986 requests completed: 1,870 successes, 116 expected rejections, zero unexpected errors. Final invariants remain 90 projects, 270 immutable versions/receipts, 600 unique votes, no fourth attempts/duplicate vote rows/FK violations/outbound calls/AI jobs. Source / artifact fingerprints were unchanged during the exclusive run. These local measurements are not hosted capacity. Baseline: `docs/load-300-baseline.json`; directory checkpoint: `docs/load-300-after-v6.json`; latest exact report: `docs/load-300-after-public-batching.json` (source `d5c1dc3`, Worker `c5cb086f`).

Public project list SQL statements now measure 13 for 24 cards and 13 for the final 18 cards, from 204 and 156 respectively. The request-local map preserves current eligibility, soft removal, actor votes and hidden score boundaries. Admin Team individual status now uses the same batched person facts rather than deriving individual state from team readiness.

Lossless PNG compression remains integrated `592e5f5`: 381,027 bytes / 10.41% saved with identical pixels/alpha. New mask browser run measures 3,279,047 encoded artwork bytes on fine desktop and 1,371,819 on cold coarse/reduced contexts; no second network CSS-mask request. This is a byte measurement, not a loading-time claim.

## WIP

1. The promised profile / Dashboard desktop/mobile batch is internally reviewed and saved as eight original Library images. Parent delivery uses `evidence/v6-main-pair-e0fbc27/library-delivery.json`. Captures use only synthetic identities, private venue and credit inventory; no revealed voucher values are captured or uploaded.
2. Public-project read batching is integrated as `cc1d01d`, with six focused correctness/privacy/revocation tests and the matching compiled workload measured above. No further timing run is needed unless performance code changes or a new concern justifies one.
3. Exact Admin / Settings / Review / Logs, Discover / Rules, Projects / submission and selected organizer / backdrop lanes are integrated. Separate agents now compare actual references and exercise controls. Integration owns shell, shared tokens, auth and backend. A strict admin removal payload defect was found in the control audit and corrected in `7770c19`; actual confirmation/cancel/allowed action verification is pending.
4. The exact selected organizer attachment `libfile_73355cbeb8b08191be77e6bcfa52ce82` is resolved in `SELECTED-ORGANIZERS.md`. Integrated `c3bd9aa` implements that geometry, smaller original portraits with matching rings and whole-unit origin slides. Audited source; matching actual verification is running. Rejected organizer boards are not implemented.
5. One root ledger tracks source, tests, actual comparison, Library delivery, acceptance and publication separately. Screenshot binaries remain local / Library, not source commits.

## Left / release gates

- Finish and compare matching actual desktop/tablet/mobile captures for remaining routes and meaningful states. No full-site visual pass or user acceptance exists.
- Finish targeted tablet sticky-navbar recapture after the integrated opaque background fix.
- Verify the integrated bounded progressive portrait background dots, organizer geometry and actual motion. No animated behavior is claimed from static mockups.
- Client navigation, role/editor code splitting, and measured focus/visibility refresh coalescing remain pending. Existing history fetch is on demand; it is not a lazy-split editor bundle. Private responses/history remain `no-store`.
- Run final combined serial regression, TypeScript, build / artifact review and compiled smoke after integration. Preserve the reproducible 300/90 baseline and rerun for the queued performance change with exclusive timed infrastructure.
- No publication before visual/functional acceptance and any applicable action-time approval for one fresh existing-Site source credential. Preserve production config 3 and inactive unresolved judging / AI. No full V6 publication estimate is justified while these gates remain open.

## V7 priorities explicitly deferred from V6

1. Implement and test AI verification and background processing. No real API calls or credential changes are authorized by this deferral; existing approval gates apply when V7 begins.
2. Add comprehensive combined-flow end-to-end regression coverage after the UI changes. Basic V6 regression, permission, build, smoke and visual safety checks remain required.

Unresolved scoring decisions remain deferred separately. AI integration is not part of completed V6.

## Mobile touch and control release gate

The user requires route-by-role control checks, including buttons, links, forms, selects, checkbox/radios, uploads, tabs, dialogs, validation, permitted and disabled states with mouse, keyboard and touch emulation. Each lane records checked / untested / blocked explicitly; screenshots or element existence alone do not count. Clean captures precede any allowlisted synthetic local writes, on a fresh disposable database. No production destructive mutations are authorized.

Signed-in Home CTA is exactly **Open your Dashboard**; signed-out is **Continue with ChatGPT**. In the bounded live V5 anonymous 390 px touch check, the real CTA received trusted touch/click events without overlay interception and navigated to authentication. The reported signed-in V5 workspace failure was not reproduced because that run had no signed-in session; auth completion and physical Android/iOS devices were not verified. Current V6 synthetic signed-in touch navigation is a required gate.

The teammate WhatsApp control now uses a single locally served Simple Icons 16.0.0 brand SVG, preserving accessible label, wa.me action and teammate-only phones. Provenance is `public/icons/social/WHATSAPP-SOURCE.json`; no whole icon bundle or runtime CDN dependency was added.

## Latest landing screenshot checkpoint

Source `8e904504`, Worker `901580c9`: eight original screenshots saved to Library in `evidence/v6-landing-8e904504/library-delivery.json`. Seven are ready for the next user batch: desktop/mobile hero, desktop Schedule / Venue / Rules / FAQ and desktop organizers. Mobile organizers are retained as diagnostic evidence and withheld while the grid-like backdrop arrangement is corrected. Internal comparison is not user acceptance. The earlier mislabeled lower-section diagnostics are superseded by sequential captures with frontmost-heading assertions.

Actual checks: selected organizer/lower geometry 24/24; portrait backdrop behavior 17/17; opaque sticky header 3/3. No physical Android/iOS claim. Actual signed-in mobile Home CTA reaches Dashboard with its synthetic role retained; remaining common-control audit is still running.

Current browser findings queued for the next matching artifact:

- Discover same-document hash modal opening: source fix `b09e57c`, runner prerequisites `91eeaa3` then `2a7745a`.
- Create-team confirmation uses the first existing row when the target ID is absent: integration must guard `portalTargetName` lookup before searching. A separate exact-target regression is required.
- Wizard second Next reuses the native submit button and opens Update project draft unexpectedly: fix `eb2a3c`, matching browser regression pending.
- Projects byline / paired tablet actions: scoped fix `f843cc7`, matching visual comparison pending.
- Admin search padding and mobile Admin access grid: scoped fix `eba5467`; mobile submission row track correction `b88aaa6`.
- Admin Review needs safe teamName / teamPalette in its existing privileged projection rather than treating a synthetic project logo as a team badge.
- Shared full-sidebar desktop header should use the selected account mark rather than a redundant hamburger, as DELIVERY-INDEX specifies. Keep the mobile/tablet menu.
- Inline wizard must avoid redundant surrounding Dashboard chrome while preserving its Dashboard entry and a usable Back/exit control. Isolated correction in preparation.
- Compact unlocked Team controls and irregular seeded portrait backdrop are in isolated correction lanes. Current evidence does not claim these visual changes are complete.

Fresh disposable confirming-write phase is pending after clean capture review. Candidate helper `71d5cd0` adds 25 independent public project fixtures for actual pagination and an unvoted synthetic target. Additional Forming / solo / pending-request fixtures are in preparation. No source edits or new builds should interrupt the remaining current hash-bound browser run. Preview is currently the disposable process started from source `8e904504`.
