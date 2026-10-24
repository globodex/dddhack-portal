# Current review branch, 24 October 2026

The production Next.js redesign is unpublished on `feat/portal-experience-rework`. Its [review, checks and original screenshots](PORTAL_REDESIGN_REVIEW_2026_10_24.md) supersede the historical ledgers below for this branch. Main contains only the separately authorized deployment filter `e386cc7`; no redesign merge, hosted migration or deployment was performed. The hosted database is populated: follow the [incremental upgrade plan](NEON_POPULATED_UPGRADE_PLAN.md), never synthetic apply/reset instructions.

---

# Cloud continuation

The historical v6 ledger below is preserved. See [V7_CLOUD_STATUS.md](V7_CLOUD_STATUS.md) for the isolated, unpublished v7 implementation, exact build/test evidence, screenshots and remaining boundaries.

# V6 release state

Updated 23 October 2026 after the user requested holding development and publishing the current snapshot. This is the single current ledger. Earlier evidence remains source-bound; implemented, integrated, tested, accepted and published are distinct.

## Current state

- Production is now V6, published source `6cffbc936681147aa91600ff765c1634602b264f`, public URL https://dddhack-portal.param3021.chatgpt.site. Sites confirmed success at20:17:32UTC with config3 unchanged. Receipt: `evidence/v6-publication.json`. No production test records or real AI calls. A fresh Site-only source credential was issued and used in memory via official hidden stdin; it was not persisted.
- Integration branch `fix/visual-correction-integration`, runtime source `0e07bc656d6bfa5d6c009813587b9c3658e22cf1`, Worker SHA-256 `2ca635068e527b2afc7cc226001a236201dcbcce0e09d8fd0529d6afcf315bc3`. TypeScript and 185-file production artifact review pass. Matching targeted browser rechecks are active.
- User says the direction is better but below their desired quality. Broad visual polish is deferred to V7, second priority. This is not full visual acceptance.
- The finite V6 addition is Discover participant cards with real server pagination and scroll loading, preserving search/filter, privacy, keyboard fallback and touch usability. Admin tables and Projects list remain as selected.

## Done / integrated

- Mask decode/readiness defect, conditional original artwork loading, named Lucide imports, static Metro, sticky opaque tablet/mobile header, exact date and Dashboard CTA, original organizer photos/rings and whole-unit transform motion.
- Three-step profile and Dashboard Team / personal Credits / Project composition; actual WhatsApp brand SVG and teammate-only phone access.
- Admin, Discover, Rules, Projects/detail and three-step submission implementation against delivered references. Required fields, six OpenAI ecosystem choices, separate Cerebras and optional deployment preserved. No unresolved AI/scoring activation.
- Directory and public-project batching. Same local compiled Worker / disposable D1 300-participant, 90-team, max5 fixture completed 1,986 requests with zero unexpected errors. Concurrency16 read p95 improved from 2,772.8ms to 283.1ms (about89.8%). Exact latest report: `docs/load-300-after-public-batching.json`, source `d5c1dc3`. Local result is not hosted capacity.
- Lossless assets saved381,027bytes (10.41%), identical decoded pixels/alpha.
- Confirmed first-Back/second-Next wizard defects, no-ID confirmation target bug, unpublished nonleader draft visibility, admin row layout and irregular portrait backdrop corrected.
- Latest integrated corrections: admin circular badge size, selected display names in admin Team members, owner-only safe audit actor names/avatar cues, skip link above sticky header, corrected wizard validation clearing, and membership confirmation naming applicant plus Accept/Decline decision.

## Tested and delivered evidence

- Source418f631:224 automated tests passed before the latest corrections; native coverage88.75% lines,83.97% branches,70.92% functions for loaded/included modules. This is scoped code coverage, not whole-repository or functional interaction coverage. Final matching run is pending.
- Source418f631 read/cancel: Admin531/531 scenarios, Team110/110; Discover baseline69/69 plus6 named Forming/solo checks. Discover dynamic inventory1,243checked/260restricted/355untested. Counts are not claims of exhaustive route/control coverage or positive writes.
- Common mobile/tablet all9roles:486positive checks.20 known skip-overlap failures and5 harness failures recorded separately. Desktop/keyboard remainder and fixed skip are being checked on0e07bc6.
- Projects read-only scope: search/pagination/detail/history/media/validation/role/attempt boundaries checked. The new30-case five-input recovery runner verifies latest corrections. Durable-write groups are still pending fresh-reset execution.
- Profile/Dashboard8 original Library captures delivered by parent19:15UTC. Landing7 images delivered separately.14 additional actual reviewed screenshots delivered20:06UTC: Discover people/teams/profile, Rules, corrected mobile organizers, Projects/detail and wizard. Receipts: `evidence/v6-remaining-418f631/library-*.json`. Synthetic data only; no revealed voucher values.
- Screenshots were compared internally with references. Internal review is distinct from user acceptance. Corrected Admin screenshots and new participant-card screenshots are pending.

## Deferred on explicit user hold and publish instruction

1. Integrate real paginated Discover participant cards. Verify full-directory server search/filter, stable cursor/dedup, no overlapping/stale fetches, scroll touch, empty/error/reset states, keyboard Load more, safe profile hash access, no private projection.
2. Complete targeted latest-artifact skip/navigation, wizard recovery, admin badge/name/log and named membership confirmation checks. Fix any confirmed functional/responsive/accessibility defect only.
3. On fresh disposable synthetic databases, execute positive Team, project/vote/comment/submission, profile Save and admin/import/status/review/credit actions with the planned mouse/touch modes. Keep exact reset/source/Worker guards and action allowlists. No live destructive mutations. Do not equate read/cancel with write coverage.
4. Deliver corrected Admin and participant-card desktop/mobile originals, source/role/viewport labeled.
5. Audit all integrated diffs, run matching final serial regression, TypeScript, build/artifact review and compiled smoke. Resolve failures and rerun only affected checks plus required final gates. Consolidate functional checked/restricted/untested inventory honestly.
6. Publication completed on explicit hold-and-publish instruction. Exact saved version/deployment IDs are in the receipt. Remaining controls, cards and visual polish are not claimed complete.

The user superseded the full V6 completion plan with an explicit hold and publish instruction. The incomplete items above remain deferred and are not claimed complete. Minimum snapshot checks: TypeScript and build/artifact review passed; matching compiled Worker smoke passed; targeted wizard recovery30/30 and mobile/tablet skip/recovery58/58 passed. Positive write tests and remaining desktop/keyboard checks were not completed. Publication outcome must be read from the Sites tool result.

## V7 priorities / explicit deferrals

First priority: implement and test AI verification/background processing, and comprehensive combined-flow E2E expansion. Existing credential/API approval requirements apply when that work begins. Unresolved scoring decisions remain deferred separately.

Second priority: broader UI and visual polish, per user's latest instruction. V6 remains responsible for functional, responsive and accessibility defects.

Additional performance work still unimplemented: client navigation, role/editor code splitting and measured focus/visibility refresh coalescing. The measured read-path improvement above does not imply those are implemented. Private responses/history remain no-store. Physical Android/iOS and managed sign-in/session completion remain unverified; touch results are browser emulation.

## Post-publication read-only verification

Anonymous GET checks after publication passed: Home, Projects, robots.txt and sitemap returned200; Dashboard returned302 to sign-in; protected admin Participants API returned401. No production mutation requests were sent. Exact status/byte/hash receipt: `evidence/v6-public-readonly.json`. The general web-fetch tool could not access the Site, so direct read-only HTTPS verified the boundary instead. This does not verify managed signed-in sessions or physical devices.
