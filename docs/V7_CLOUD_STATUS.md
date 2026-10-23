# V7 cloud implementation checkpoint

The verified final v6 handoff is `8a9daadb96e360340620ab5f0619d0489b2d3e50` on `release/v6-publish-20261023`. Cloud work is isolated on `v7/cloud-integration-20261023`. Main and the release branch were not changed. The published Site remains v6 source `6cffbc936681147aa91600ff765c1634602b264f`, config3. Nothing in this checkpoint was published.

The final tested build is source `436c91885de22ab4be020a198cd8897abe11192c`, Worker SHA-256 `dea84021ecb472fa63d5d3b6ea4fe8a3e9d6ac3924d32a2bef87b7c0913e1a3b`, with 206 reviewed artifact files. It adds a compact Crown control style to the preceding integrated build `0a2e3f97b457d4ba8fd1a71333887b50633d84e3`, Worker `b127925d2aaa0eea1f44f6526d4e1437038549e9aa2ca6ac7371a55f092a13c7`. The workload, Credits and cache browser evidence remains bound to that preceding build; their runtime logic is unchanged. Later evidence, documentation and test-script commits do not change the final runtime.

## Implemented

- Discover uses participant cards with real server keyset pagination, full-directory search and membership filtering. Scroll loading has abort/stale-response guards, deduplication and keyboard Load more/retry controls. A real 300-person backend test loaded 24 then 48 unique cards and found participant299 beyond the initial page. Mouse and actual CDP touch scrolling both passed.
- Submissions create one inert verification job per committed version, with idempotent receipts. Explicit bounded processing supports leases/recovery and an injected offline verifier. Missing evidence produces human-review results, never fabricated scores or penalties. The production evaluator remains disabled.
- Credits accepts CSV upload or paste, Add credits, per-column headings/Markdown, then Publish with final internal validation and confirmation. Checked-in eligible recipients receive unique mappings. Confirmed column or batch deletion removes its inventory, mappings and instructions. Audits sanitize headings/instructions and retain at most five fully masked samples. A deletion does not revoke externally redeemed vouchers.
- Manual operational-readiness UI and checkbox gates were removed. Authorization, Going status, personal attendance, valid submission windows, leader access, three committed attempts, review coverage and frozen snapshots remain enforced. Existing inactive installations are covered by real D1 upgrade tests.
- All admins can judge directly in a submission's Review panel using 1–10 marks and optional private feedback. Judge/mentor assignments remain optional separate-role workflows. Owner result controls now explain their own actual prerequisite. The current scoring implementation is accepted as the v7 baseline; no new weights were chosen. See [the exact baseline](v7-scoring-baseline.md).
- Admin teams offer a confirmed Crown transfer to a current teammate, including locked teams. Atomic checks preserve the lock, memberships, private idea and submission history. Both previous and new leaders receive fresh permissions; the new leader still needs personal check-in.
- Request-local authorized projection reuse and SSR hydration remove duplicate bootstrap API work. Framework links retain a client shell. Focus/visibility bursts are coalesced. Admin label deltas are memory-only, actor/role/route/version scoped; volatile state and private fields are freshly authorized on every response. Locked admin overrides and avatar/name changes invalidate presentation versions.
- Route-shaped skeletons keep the navigation shell visible, use reduced-motion-aware CSS and accessible loading state, and add no requests. Mobile navigation is one full-screen top-down panel with focus trapping/restoration, Escape and background scroll lock. FAQ/Venue/Rules gutters are symmetric. Mobile hero CTAs use a growing vertical stack with decorative layers unable to intercept touch.
- Admin agenda/FAQ controls use Lucide icons, names, deletion confirmation and immediate local feedback. Accepted artwork has lossless WebP alternatives with unchanged originals and PNG recovery, saving 945,885 bytes across four images. Two separate NEW DELHI artwork choices are previews only.

## Evidence and limits

The final integrated serial suite passed **316/316**, zero failures or skips, in69.45s. TypeScript, production build/artifact review and compiled Worker smoke passed. The preceding workload build passed315tests before the additional actual D1 presentation API test. This is test evidence, not a new whole-repository code-coverage percentage. Historical 88.75% line / 83.97% branch / 70.92% function coverage applies only to the previously included modules.

The fresh local compiled workload used **300 participants / 90 teams**, **1,986 requests**, at most **16 simultaneous requests**, **116 expected rejections** and **zero unexpected errors**. It retained 270 submission versions/receipts, 600 unique votes, no foreign-key violations and 270 inert pending verification jobs with attempts0. No external provider calls occurred. Concurrency16 read p95 was 563.7ms while other local QA ran; this is not a matched performance improvement comparison or a hosted-capacity guarantee. See [source-bound load evidence](../evidence/v7-final-local-load/README.md).

Final Credits browser checks passed16/16 across desktop paste/mobile upload. Crown transfer passed24/24 across mouse/touch/keyboard on the workload build, then18/18 on the final compact-control build across desktop/mobile. Both final viewports measured44×44px action targets,52px member rows, correct pointer ownership and no horizontal overflow. Mobile hero checks passed48 across six portrait/short viewports, anonymous/signed-in states, resizing and CSS zoom150%, with actual touch activation. Earlier scoped evidence also covers Profile positive Saves, Team writes, admin desktop/keyboard/touch controls, project recovery, three submissions, comments and voting. Counts from different matrices are not combined into an exhaustive interaction-coverage claim.

The repeatable waterfall improvement is request elimination: protected bootstrap API1→0, sidebar document1→0/API1→0, six rapid focus events6→0 within freshness or1 after expiry. Final exploratory back/forward readiness was46.3/25.7ms locally versus91.3/160.6ms in the earlier baseline. Cold timings varied and the client-link runtime adds about11.8KB wire JavaScript; no uniform speedup is claimed. Final Home cold transfer was26.1% lower desktop and12.6% lower emulated touch; Admin repeated decoded JSON was19.0% smaller while fresh authorization/private fields/status remained. See [final measured timings](V7_PERFORMANCE.md) and [source-bound verification](../evidence/v7-admin-presentation/frozen-verification.md).

Actual Playwright screenshots and separate preview images are saved in Library with source-bound receipts under `evidence/`. Use [the clickable delivery index](V7_SCREENSHOTS.md). Screenshots prove rendered behavior for those fixtures; mockups remain design targets, not interaction evidence. Selected mockup metadata was verified, but the environment's signed-download transfer was refused by its outbound proxy. Complete side-by-side fidelity review is therefore still pending; no claim of100% visual matching is made.

## Operating the new Credits flow

These controls are in the cloud v7 build, not the currently published v6 site:

1. In Participants, approve the intended attendees as Going and record verified Check in.
2. Open `/admin/credits` from Credits. Upload CSV or paste CSV. Each header is a separate credit column and each nonblank cell is one unique code. Maximum20 columns,1,000 data rows and512KiB CSV; duplicate headings/codes are rejected.
3. Select Add credits. Edit each heading and its Markdown instructions. No explicit Preview/Review step is required.
4. Select Publish, verify the named headings and code count, then Publish credits in the confirmation. Allocation occurs once to eligible checked-in recipients, limited by stock. Publish after verifying the intended recipients; this does not promise allocation to future arrivals.
5. Use Delete column for one credit definition or Delete batch for the whole upload, then confirm the exact target. Its mappings and instructions are removed together; sibling columns survive a column deletion.

Never place real voucher values in screenshot, audit notes or ordinary exports. [Fallback procedures](HACKATHON_FALLBACK.md) explain uncertain writes, offline receipts and reconciliation.

## Remaining boundaries

- Real AI calls, private project transmission and provider activation await separate explicit destination/payload approval and secure runtime configuration. No key was read, copied or assumed present in cloud.
- Hosted signed-in latency/capacity, managed sign-in/logout completion and physical-device behavior are unverified. The harmless hosted public timing probe was refused at proxy CONNECT403 before TLS or application data; it is not evidence the Site is unavailable.
- Real final scoring still requires the configured windows/rules and completed version-specific reviews/evaluations. Accepting the existing formula does not manufacture missing values or publish results.
- Further selected-mockup fidelity review and broad role/editor bundle separation remain work; no unselected visual direction was substituted.
- Publication remains the user's laptop workflow. No production records, configuration, credentials or credits were changed by this cloud task.
