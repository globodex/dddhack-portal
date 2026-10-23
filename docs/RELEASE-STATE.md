# Portal release evidence ledger

This is the current status ledger. Implemented, integrated, tested and visually accepted are separate states. Screenshots from an earlier artifact do not verify later source edits. A passing local load test does not establish hosted capacity.

## Release boundaries

- Live: public v5, source `f1a4b3db83e2263170e8b5fb4738b18f0e218b8d`. No correction release has been deployed.
- Integration branch: `fix/visual-correction-integration`, local worktree `.worktrees/visual-integration`.
- Latest compiled/diagnosed artifact: source `722c04d055b1d13ad0b7735069bc20d0855d66b5`, Worker SHA-256 `e06ce1a3af228b75ab4aaab5d6e1e66f1139eb66a8e2743aa93ba50cc84c13a0`. The twelve delivered Home viewports show earlier source `0e7756c` / Worker `75a667d2`.
- Current runtime source `722c04d`: **191/191 regressions passed** in isolated serial execution, TypeScript passed, production build/official 183-file artifact review passed, compiled Worker smoke passed. A prior concurrent run hit a Miniflare synchronous-proxy message-ID assertion; the D1 test passed in isolation and the full serial run passed. Browser diagnostics still found release-blocking visual defects; test success is not visual acceptance.
- User rejected the profile/admin screenshot appearance. Functional checks do not override that visual feedback. Publication is held.
- No production imports, record removals, role grants, score reveals, AI calls or settings changes occurred in this correction work.

## Implementation and visual evidence

| Scope | Integrated evidence | Tested | Visual acceptance / remaining work |
| --- | --- | --- | --- |
| Exact ecosystem checkboxes; separate Cerebras declaration; no per-member contribution/hash burden | `63f27df`, existing submission corrections | Server/UI regressions pass; AI verification remains inactive | Remaining wizard screens and interactions need final review |
| Voucher-only credits; legacy ciphertext preserved | `bd6eb90` | Keyless synthetic import/allocation/reveal, revocation/isolation/migration tests pass | No real vouchers allocated; masked participant view still needs final route batch |
| Discovery allowlisted profile modal | `1c81316` | Native modal, privacy, Escape/focus return; screenshot evidence `c8da0b2` | Density still needs refinement; screenshot delivery is not user acceptance |
| Approved Home layout, shared stack geometry, authentic four organizer images | `bc18809`, `4067a56`, `76c1379`, `0e7756c` | Actual eight-viewport stack, agenda, repulsion, pause and reduced-motion checks on captured artifact | Twelve current section viewport images delivered; public cosmetic changes below are newer |
| Home optical scale, chapter layout and controls | `65475f2`, `7fea1a9` | Matching artifact built; wordmark/media/failure diagnostics run | Delayed CSS-mask reveal defect blocks release; latest additional hero/nav/date requests remain unimplemented |
| Hidden visible Menu label, correct Viewer label, singular member wording | `b0ac220` | Combined source tests/TypeScript pass | Matching rendered verification pending |
| Rules follow owner-configured opening/closing window, preserve fixed repository cutoff, remove participant SHA request and state leader check-in requirement | `b0ac220` | Two new regressions; full suite 184/184 | Matching rendered verification pending |
| Latest profile refinement: small palette, coordinated heading/back/dot, per-step scroll and official outline icons | Integrated `27f1698` | Full suite passes; matching browser diagnostic 29 checks / 16 captures | Strict review still fails: duplicate preview, eight colors not one row at 390, boxed mobile, optional suffix, balanced header. Follow-up not started. |
| Latest admin density and exact-target trash actions | `bbd763c`, root integration `722c04d` | Full suite passes; matching 28 captures; first row y350.5 desktop/y437 mobile, Add height44px, no horizontal spill | Status disclosures, mobile Teams toolbar/removal, Credits hierarchy, import max width and stretched state pills still need work |

Screenshot ledgers: `evidence/profile-discovery-batch/library-ledger.json` and `evidence/admin-batch-0e7756c6-75a667d2/ledger.json`. The Home twelve-image Library ledger is preserved in the public-home worktree under `evidence/public-home-approved/delivery-wip/LEDGER.md`; images are **visible viewports**, not stitched full-section exports. Long mobile sections may continue below a frame.

## Performance ledger

| Item | Implemented / integrated | Evidence / next step |
| --- | --- | --- |
| Lossless Delhi PNG compression | Yes, `592e5f5` | 3,660,074 → 3,279,047 bytes; 381,027 bytes / 10.41% saved. Exact decoded pixels/alpha retained. No loading-time speedup claimed. |
| Unused motion artwork on touch/reduced motion | Integrated `61b5869`; measured but NOT release-ready | Coarse/reduced payload 3,345,240 → 1,371,819 bytes (59.0% saving). Desktop unchanged. Delayed CSS mask hides lettering after fallback disappears; fix and full recheck required. |
| Client-side navigation | Pending | Current navigation uses ordinary links. No SPA navigation speedup claimed. |
| Role code splitting / lazy editors | Pending | Do not call current monolithic UI split. History data already loads on opening its modal; this is not history bundle splitting. |
| Duplicate API fetching | No change justified by initial measurements | Baseline Home/Profile/Admin each made one portal API call, no duplicate URL groups. Focus/visibility refresh overlap and targeted invalidation still need profiling. |
| Private response safety | Existing `no-store` retained | No public cache for private portal/history responses. No new public cache layer added. |
| Query batching, indexes, compact projections and broader pagination | Score projection reuse integrated `722c04d`; bulk queries pending | Each public response now reuses one sanitized score projection, with next-request revocation regression. Actual after latency/counts pending. Measured prior SQL counts: Teams731, Admin Participants3015, Admin Teams907, Projects253 for24cards. No new index claimed. |
| Animation scheduling | Implemented in current dots | `requestAnimationFrame`, offscreen/background pause, reduced-motion static state; actual bounds/pause checks on captured artifact. No per-frame React-state loop. |
| Local read baseline | Complete | 216 measured reads, zero errors, tiny synthetic fixture; see `docs/performance-checkpoint.md`. |
| Exact 300 participants / 90 teams synthetic compiled test | Completed, integrated `c8b9257` | 1,986 requests: 1,870 successes, 116 expected rejections, zero unexpected errors. Local only; detail below. |

### 300/90 diagnostic result

The compiled Worker and real disposable D1 held 300 participant users (plus two operational test admins), 90 teams and 300 memberships, with no team above five. The final assertions found 90 projects, 270 immutable versions/receipts, 600 unique votes, no fourth version, no duplicate vote pairs, no foreign-key violations, no outbound requests and no AI jobs. Synthetic data never touched production.

Normal page API reads, 75-person cohorts: concurrency 1 p50/p95 **28.9/312.8 ms**; 4 **368.7/825.2 ms**; 8 **525.2/1560.0 ms**; 16 **1269.7/2772.8 ms**. Ninety initial submission commits at concurrency 8: **131.9/172.3 ms**. Six hundred unique votes at concurrency 16: **134.3/246.6 ms**. The read bottleneck is unresolved; these results must not be described as smooth hosted operation or a capacity guarantee.

The first setup diagnostic returned one empty 404 before any mutation because the direct Miniflare asset router differed from Wrangler's routing configuration. It was retained separately, corrected through the supported local router settings, and excluded from the successful workload. A closed stdin gate also required restarting disposable fixture setup; it produced no timed requests. Neither failure is hidden in the final run counts.

## Remaining release gates

1. Integrate isolated profile/admin/artwork-loading patches sequentially, review scope and rerun the combined tests/build/artifact/compiled Worker checks.
2. Render the matching final artifact at desktop/tablet/mobile sizes. Test avatar/social/back controls, imports/confirm cancellation, modals, scroll/stack/resize, loading/error/empty states and privacy. Record actual remaining route gaps; no whole-site visual pass yet.
3. Profile and improve read latency with evidence; preserve current authorization, immutable attempts, vote uniqueness and request isolation.
4. Publish only after the user-required visual verification and applicable fresh short-lived Site-source credential approval. Preserve production config3 and keep AI inactive.

Unresolved judging definitions remain inactive and do not justify inventing scoring rules or blocking unrelated operational flows. The source data, private venue details, production secrets and real voucher values do not belong in this ledger.

## Handoff freeze

User requested a fresh local project chat. All five agents are paused at safe checkpoints; all browsers and disposable runtime processes are closed. No further source edits should begin until the successor receives exclusive ownership. Read `docs/V6_FRESH_HANDOFF.md`. New 722c04d profile/admin captures remain local and visually unaccepted; no new Library uploads were made for those.
