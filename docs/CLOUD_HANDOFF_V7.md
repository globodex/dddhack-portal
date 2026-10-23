# Cloud continuation after the V6 snapshot

The user explicitly requested holding development, publishing the current coherent snapshot, then moving development to a saved Codex Cloud task. This file authorizes no new credentials, production mutations or AI calls.

Runtime snapshot: `0e07bc656d6bfa5d6c009813587b9c3658e22cf1`; Worker SHA-256 `2ca635068e527b2afc7cc226001a236201dcbcce0e09d8fd0529d6afcf315bc3`. The publication checkpoint adds documentation only. Read Sites publication receipt for the actual live version. Repository is exclusively `Param302/dddhack-portal`; preserve all branches, no force pushes/main resets.

All agents paused with browsers closed. No production records or secrets have been exported. Existing Site `appgprj_6ad9ec4bea6c8191b2bb155de7fe00ed` is public. Preserve its audience, D1 and config3. OPENAI_API_KEY and legacy encryption configuration stay in Sites and are not needed for synthetic tests.

## Continue in priority order

1. AI verification/background processing implementation/testing, plus comprehensive combined-flow E2E. Scoring decisions remain deferred; no real API calls or activation without applicable approval.
2. Broad UI/visual improvement, per user. Current design is better but below the desired level, not fully accepted. Preserve approved fields/privacy and original supplied assets. Actual screenshots must be compared internally with references before delivery.
3. Finish Discover participant cards and real server pagination/scroll loading. Existing source still uses the list and bounded full-directory projection. Contract agreed but NOT integrated: `/discover/participants?q=&membership=all|in|out&limit=24&cursor=...&person=...`; max48, case-insensitive name+ID keyset, query-bound cursor, safe focusedPerson, server search/filter across entire directory, no duplicate/overlapping/stale pages, accessible Load more/retry/end, touch/keyboard tests. Admin remains table; Projects remains list. Local backend draft is untested and contains a known HTTP normalization regex typo; do not apply blindly.
4. Positive synthetic write control tests remain unrun. Prepared Team runner requires a fresh reset-bound manifest; project runner restricts writes to four actions and exact fake targets, one device per fresh reset. Admin runner has uncommitted static corrections. Profile Save positive test and remaining desktop/keyboard navigation are incomplete. Never report these as passed from read/cancel evidence.
5. Additional performance work: client navigation, role/editor code splitting, focus refresh coalescing. Existing measured300/90 workload improved local read p95 from2772.8ms to283.1ms atconcurrency16,1986requests/zero unexpected errors; not hosted capacity. `docs/load-300-after-public-batching.json` is exact evidence.

## Evidence and reproduction

`docs/RELEASE-STATE.md` is the single ledger. Source418f631 passed224 tests with loaded-module native coverage88.75% lines/83.97% branches/70.92% functions. Latest0e07 snapshot passed TypeScript,185-file build/artifact review, compiled synthetic smoke, wizard recovery30/30 (five input modes), skip/recovery58/58 (mobile/tablet all9roles). Read/cancel counts: Admin531/531, Team110/110, Discover baseline69/69 plus6 named fixture checks. These are scoped and not exhaustive interaction coverage. Physical devices and managed sign-in/logout completion are unverified.

Profile/Dashboard8 images and landing7 images were delivered, plus14 images at20:06UTC. Library IDs and original paths are in `evidence/v6-main-pair-e0fbc27/library-delivery.json`, `evidence/v6-landing-8e904504/library-delivery.json` and `evidence/v6-remaining-418f631/library-*.json`. Screenshot binaries remain Library/local, not Git. Current admin12 captures have12 route checks; only3 were visually reviewed before hold.

Install from lockfile in the actual cloud environment and follow its runtime/browser/network instructions. Node24+; run typecheck, full serial tests, build/artifact review and production smoke. Do not assume local /tmp Chromium caches or symlinked dependencies exist. Test credentials are synthetic fixture actors only. No production load, fake records, database dumps or secret migration.

## Design references

Main eight boards delivered in Library: profile `libfile_d5422b4a7efc819197fed4e02c871b30`; Dashboard `libfile_6fdab1b064d08191a2902b20eb60732f`; Discover `libfile_b957c220b54481919b08ca4e1d98c7d6`; Projects `libfile_39b52e3ca2248191a1ea495d2e61cef3`; Admin `libfile_24b521bbc148819181168724be7fdb7e`; wizard `libfile_6f25977ba4e8819193e89349b95eb934`; Settings/Review `libfile_bc5305437da88191aa2987075e302b85`; Team/Rules/Logs `libfile_9fc700bb05e48191964ed7a460cb6cc1`. Selected organizers `libfile_73355cbeb8b08191be77e6bcfa52ce82`; rejected9fd board must not be used. Preserve original organizer photos already in public assets, matching rings and origin-side unit motion. Generated labels/artifacts never override approved functional rules.
