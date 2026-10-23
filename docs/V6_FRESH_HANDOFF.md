# V6 fresh local chat handoff

## Start here: exclusive ownership

The user requested a fresh **local** DDEhack-portal project chat to reduce context confusion. This is a handoff, not cancellation. All five implementation agents have paused safely; no browsers, load workers or local preview remain running. No new source edits, installs or publication should start in the old chat. The successor can take exclusive editing ownership after the parent confirms this checkpoint. Preserve every worktree and dirty/untracked file; do not reset or clean them.

- Executor: `param302-linux`, Linux. Wrapper: `/home/param302/Dev/DDEHack-portal`.
- **Use the integration worktree**, not the older primary checkout: `/home/param302/Dev/DDEHack-portal/.worktrees/visual-integration`.
- Branch: `fix/visual-correction-integration`.
- Runtime source: `722c04d055b1d13ad0b7735069bc20d0855d66b5`.
- HEAD immediately before this handoff documentation commit: `f7aba49` (text-only agent checkpoint). Run `git rev-parse HEAD` for the final documentation checkpoint SHA.
- Primary checkout `dddhack-portal` is older branch `wip/parallel-portal-20261023`, HEAD `7087834`. Do not overwrite it or assume it contains the correction branch.
- Repository: `Param302/dddhack-portal`. New correction commits are local; do not assume remote is current. Verify before any authorized push.

## Live versus local

Live remains public **v5**, https://dddhack-portal.param3021.chatgpt.site, project `appgprj_6ad9ec4bea6c8191b2bb155de7fe00ed`, deployed source `f1a4b3db83e2263170e8b5fb4738b18f0e218b8d`. No correction release was published.

Latest local production artifact:

```text
source 722c04d055b1d13ad0b7735069bc20d0855d66b5
Worker e06ce1a3af228b75ab4aaab5d6e1e66f1139eb66a8e2743aa93ba50cc84c13a0
```

It passed **191/191 tests**, TypeScript, production build, official **183-file** artifact review and compiled Worker smoke. Browser diagnostics found genuine visual defects; this is **not release-ready or visually accepted**. Prior concurrent test execution hit a Miniflare proxy message-ID assertion; isolated D1 and full serial regressions passed afterward. Do not suppress that test or claim a hosted issue from it.

No production imports, deletions, role grants, setting activation, score reveals, AI calls or credential creation occurred. Keep production config revision3, including the user's server-only `OPENAI_API_KEY`. No real interactive ChatGPT login was tested by the synthetic local harness.

## Authoritative status and evidence

Use **`docs/RELEASE-STATE.md`** as the single status ledger. Implemented, integrated, tested and user-accepted are separate states. Update only changed facts.

- Exact load results: `docs/load-300-results.md`, `docs/load-300-baseline.json`.
- Query attribution: `docs/load-300-query-profile.md/json`.
- Earlier transfer baseline/compression: `docs/performance-checkpoint.md`.
- Actual source722 profile diagnostics: `evidence/profile-contained/HANDOFF.md` and `report.json`.
- Actual source722 admin diagnostics: `evidence/admin-batch-722c04d0-e06ce1a3/HANDOFF.md` and `ledger.json`.
- Current Home delivery: `evidence/home-current-0e7756c/LEDGER.md` maps **12 confirmed Library images**. They are original visible viewports, not full-element exports; long mobile sections can continue below the frame. The parent already delivered them to Param.
- Older profile/Discovery Library ledger: `evidence/profile-discovery-batch/library-ledger.json`. Older admin Library receipts: `evidence/admin-batch-0e7756c6-75a667d2/`.
- Source722 profile/admin captures are local only, **not uploaded** and not accepted. Profile count was corrected to **29 checks / 16 captures**; only six diagnostic images had been opened, so do not claim all16 visually reviewed. Admin has28 fresh captures; five confirmation dialogs were Cancel-checked, no mutation.

## Immediate release-blocking defect

Conditional Delhi layers (`61b5869`) save artwork bytes on touch/reduced motion, but a delayed CSS mask request can hide the static fallback before lettering is ready, leaving only the Metro. Root opened the actual defect image.

- Preserved original PNG: `evidence/wordmark-loading-722c04d/wordmark-delayed-mask-at-reveal.png` (ignored local binary; do not commit screenshot binaries).
- Metrics/runner: same directory `report.json` and `wordmark-loading-qa.mjs`; originals also in public-home worktree.
- Cold coarse390/reduced1440: **3,345,240 → 1,371,819 encoded artwork bytes**, saving **1,973,421 / 59.0%**. This saving is **provisional**, not a release pass. Fine-pointer desktop remains3,345,240.
- Fill abort keeps fallback; coarse transition removes layers. Fine-hover restoration was not fully demonstrated because CDP left `hover:none` after restoration.
- Proposed fix was **not started**: use one fetched/decoded original mask Blob URL for inline `mask-image` and `-webkit-mask-image`, keep fallback until all layers are ready, revoke on unmount; preserve original pixels and static Metro. Validate the proposal rather than assuming it works. Recheck delayed mask/fill, failures, pause, media switches, resize and request bytes.

## Performance priority

The user explicitly prioritizes faster loading above further decorative work. Actual compiled Worker + disposable real D1 test: exactly300 participant users plus2 ops admins,90 teams, max5 members; **1,986 requests**,1,870 successes,116 expected rejections,**zero unexpected errors**. Final invariants:90 projects,270 immutable versions/receipts,600 unique votes, no fourth attempts/duplicate votes/FK violations/outbound calls/AI jobs.

Normal GET cohort p50/p95 ms: c1 **28.9/312.8**, c4 **368.7/825.2**, c8 **525.2/1560.0**, c16 **1269.7/2772.8**. Initial commits c8 p95 **172.3ms**, votes c16 p95 **246.6ms**. Local results are not hosted capacity.

Instrumented follow-up is separate:192/224 GET attempted,176 finished,16 c16 Admin Participants timeouts under instrumented/nonexclusive infrastructure. No c16 Admin Teams/Submissions cohort ran. Measured SQL/request: Dashboard61; Discover Teams731; Discover Participants7; Projects253 for24 cards/193 for18; Admin Participants3015; Admin Teams907; Admin Submissions187.

Implemented:

- Lossless PNG recompression `592e5f5`: **381,027 bytes /10.41%** saved; identical decoded pixels/alpha.
- Conditional artwork loading `61b5869`: measured but mask defect above.
- `722c04d`: one sanitized score projection per public response, reused for cards **and awards**; no global cache. Community empty scores skip unnecessary valid-project scan. Regression checks one projection and next-request eligibility revocation; actual after latency/query measurements pending.
- Existing dots use rAF, transform motion, offscreen/background pause and reduced-motion support.

Pending: bulk team/person facts, query batching, measured indexes, compact projections/pagination beyond current24 project cards, client navigation, role splitting/lazy editor bundles, focus/visibility refresh overlap and targeted invalidation. Private portal/history use `no-store`; do not publicly cache private responses. Initial baseline found one portal API request/page and no duplicate URL group, so do not claim duplicate removal was implemented. History data is fetched only on modal opening, not a lazy-split bundle.

Safe next batching design from independent review: aggregate membership totals/approved/qualifying attendance, historical version counts, locks/overrides and current-actor pending requests separately before joining, to avoid join fan-out. Public projection must contain only current safe team fields, no ideas/phones/emails/reasons. Preserve status precedence override > any historic committed version > qualifying attendance > lock > Forming, existing readiness zero-team behavior, attendance revocation, and attempts/history through soft removal. Existing memberships-team index already exists; do not invent index benefits without plans. Bulk worktree exists but **no batching code was written**.

## Latest visual requirements and unfinished work

Read the strict review at `/home/param302/Dev/DDEHack-portal/design-research/2026-10-23/profile-admin-review-2/VISUAL-REVIEW-AND-DEVFOLIO.md`. It reviews older screenshots, not a new authenticated Devfolio flow. Full route contract is `.../live-v5-audit/FULL-SITE-ACCEPTANCE.md`; do not copy it wholesale into Git because it includes private examples. Do not claim full-site fidelity from a global stylesheet or four screens.

1. **Profile:** exact three steps, Next → Next → Save → Teams. Current bounded-card patch is integrated and functionally checked, but strict follow-up **not started**: remove duplicate avatar preview/Your avatar; eight18–20px palette circles in44px targets on one390px row (4×2 at320); unboxed full-width mobile; balanced44/flex/44 back/title+dot header; no optional suffix; selector+URL+trash on one row. One active step, safe short-screen/internal scroll, keyboard/zoom access, no clipping. No profile-save confirmation. Fields/prefills/requiredness remain; all socials optional, personal photo uploads forbidden. Do not substitute a fourth review step.
2. **Admin:** first participant row now y350.5 desktop/y437 mobile; Add44px and no horizontal spill. Remaining: repeated status disclosures/≈86px rows, no participant avatar cue, mobile Teams toolbar/removal text, cramped Credits. Credits should use identity+Active state and aligned Inventory/Assigned numeric blocks on mobile, not a flat four-column table. Bound expanded import around600px, preserve Single/List/headerCSV → Add → email/count-only confirmation. No reasons/helper prose. Settings long structural grouping remains. No fake stats/logos.
3. **Icons:** latest user explicitly requires actual **`lucide-react` library named imports**, not copied SVG paths or text glyph arrows. Existing profile/admin official copied paths do not satisfy this newest requirement. Preserve supplied brand logo/custom dot artwork and authentic brand assets separately. Tree-shaken named imports, consistent stroke/size/labels. Lucide worktree is clean; **no package installed or icon replacement started**.
4. **Home right cluster:**7–8 overlapping expressions with five clear size tiers Largest > Large > Medium > small > smallest. Bottom retain individual sizes, more bounded overlapping dots, fall from above at hero entry, strong airblower repulsion. No per-frame React rerenders or CTA obstruction; pause offscreen/background/reduced, portrait-mobile strip hidden. **Not started** after latest instruction.
5. **Home nav/actions:** mobile/tablet sticky visible navbar; hamburger only with accessible name, no visible Menu/current-section label, keep brand and content offset. Exact date: `Sunday, 1 November 2026 · Hosted by Codex Ambassadors`. Register no underline, subtle arrow hover/focus movement with reduced-motion static; properly aligned actual Lucide arrow on Continue with ChatGPT. **Not started** after latest instruction.
6. **New lower Home variant:** parent design chat `01a1681d-a2c4-758b-8857-9bb17352403c` is preparing mockups. Wait until they are shared with user, then implementation is authorized without another approval.7–8 concise agreed rules; four circle portraits on colored cylinders rising together desktop/alternating mobile; expressive right dots each desktop/tablet section; portrait sparse dots progressively filling jar-like to≈80%. Maintain readability/performance; do not implement this pending variant from guesses.
7. Actual matching screenshots/interactions still needed for the whole route/component checklist, including Dashboard Team/Credits/Project/history, project wizard/showcase/detail, Settings sections, all key empty/error/loading/modals. User rejected prior screens4/10. No visually accepted full release exists.

## Preserve functional/security contracts

Do not reopen resolved rules: no hard participant cap; max5/team; roster+idea lock29Oct2026 23:59IST; default submissions1Nov08:00–16:00IST, owner may edit both with preview/confirmation/audit; repo creation **and first commit strictly after**1Nov08:00IST is a separate fixed cutoff. Optional deployment for all projects. Leader must personally check in to commit; exactly3 immutable committed attempts, retries/draft navigation do not spend attempts. Only committed submissions have eligibility; operational/API outage is not proof of violation.

Viewer can only browse safe discovery/public projects. Roster imports add only and never overwrite existing fields/status; removed records not silently restored. Team lock never grants individual Going. Phone only current teammates; personal voucher recipient must individually check in; vouchers/links only, no API keys. Keep legacy ciphertext untouched and fail-closed, do not delete/rotate production key. Public scores/reveals/roles remain gated; unresolved judging definitions/AI/background runner stay inactive. Public votes per eligible roster person/project, own-team vote needs personal check-in; no duplicate votes across versions. Private venue never in public code/metadata/cache/export. No live data/role mutation implied by code implementation.

Submission exact checkbox question: `How have you integrated OpenAI ecosystem in it?` Choices OpenAI API, Codex, ChatGPT Sites, Parallel Agents, Parallel worktrees, ChatGPT. Separate project-named Cerebras Yes/No. Codex optional. No participant SHA/manual evidence/per-member contribution fields. Evaluation must distinguish verified absence from inaccessible evidence, never request plaintext API keys or infer Codex authorship from code style; no new point allocations/paid calls.

## Paused worktrees/agents

| Scope | Branch / local HEAD | State |
| --- | --- | --- |
| Root integration | `fix/visual-correction-integration` / docs checkpoint after `f7aba49` | Sole successor integration target; runtime frozen722c04d |
| Profile agent | `.worktrees/discovery-dialog`, `fix/discovery-dialog`, `8ec4f82` | Paused; tracked clean; strict edits not started; local PNGs preserved |
| Admin agent | `.worktrees/admin-rendered`, `fix/visual-admin-rendered`, `79d1df1` | Paused; tracked clean; local PNGs preserved |
| Public agent | `.worktrees/public-home-approved`, `feat/approved-home-20261023`, `061c84e` | Paused; tracked clean; untracked wordmark runner/metrics/full-element runner preserved |
| Load agent | `.worktrees/load-300`, `test/load-300-compiled`, `37a7543` | Completed/paused; tracked clean; all disposable runtimes removed |
| Icons agent | `.worktrees/lucide-system`, `fix/lucide-system`, `722c04d` | Paused; clean; no install/edit |
| Root batching | `.worktrees/read-query-batching`, `perf/read-query-batching`, `722c04d` | Clean, no implementation yet |

Older worktrees also exist. Run `git worktree list --porcelain`; do not remove them blindly. Agent commits were cherry-picked sequentially; equivalent source commits often have different integration hashes. Do not re-cherry-pick already integrated changes.

## Dirty/untracked preservation and tooling

Integration has documentation/evidence work left outside the final handoff commit: `design-qa.md`, `docs/VISUAL_CORRECTION_CHECKLIST.md`; untracked `docs/CLOUD_CONTINUATION_2026-10-24.md`, evidence/admin-rendered-qa, profile-rendered-qa, route-inventory, visual-first-pass; scripts/qa-admin-readonly.mjs, qa-route-inventory.mjs, visual-first-pass.mjs, **visual-preview.mjs** and **visual-rich-fixtures.ts**. These are preserved locally, not automatically reviewed/committed. The generated official artifact/smoke JSON and sanitized Home/wordmark ledgers were included in the atomic handoff commit. Other worktrees retain local screenshot PNGs and dependency symlinks. Keep screenshot binaries out of source commits; Library IDs/metrics are text evidence. Full-element Home screenshot runner is prepared but **never run**.

Node24.22, Python3.14. Official approved sandboxed Playwright1.64.1 is in `/tmp/ddehack-playwright-runner/node_modules/playwright/index.mjs`; browser cache `/tmp/ddehack-playwright-browsers`. Set `PLAYWRIGHT_BROWSERS_PATH` and use `chromiumSandbox:true`. The repo's old Playwright config uses `--no-sandbox` and stale tests; do not run it unchanged. CUA inventory had no browser/IAB, so user explicitly authorized Playwright. No sandbox bypass.

Verified commands from integration (normal exec may require supported escalation for local D1/tool ports):

```sh
node --import tsx --test --test-concurrency=1 tests/*.test.ts
npm run typecheck
npm run build
npm run test:production
node --import tsx scripts/visual-preview.mjs --rich
```

Last preview was4173 with disposable synthetic D1; it has been stopped cleanly. Start a fresh one before scripts, record exact source+Worker hash, restrict browser network to loopback, never use real identities/credits. Verify no competing Workerd processes before isolated tests. `rg` is absent; use Python/grep/find without fuss.

No fresh publishing credential is approved for the corrections. Publication still needs final checks and applicable action-time approval for one short-lived existing-Site source credential; never log/save it plaintext or assume expired tokens exist. Tomorrow's earlier plan was Cloud engineering/Playwright and Windows-laptop publishing; **current explicit request is a fresh local chat**. Do not silently switch environments. Production secrets stay in Sites; no UI/test secret needed.
