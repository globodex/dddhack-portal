# Migration QA evidence

All evidence here is local and synthetic. No production records, deployed Site, provider accounts, credentials, DNS, AI calls or external production endpoint were used. Browser requests are restricted to the declared loopback origin and GET/HEAD. A synthetic fixture cookie selects an already-seeded actor; screenshots are actual rendered application pages backed by disposable SQLite, not API mocks.

## Regression and security checks

The retained v7 suite passed **316/316**, no failures or skips, serially on 24 October 2026 in 64.80 seconds. [Raw log](../../evidence/migration/baseline-tests.log). This is the unmodified baseline suite, not a claim that the integrated migration has passed every retained test.

New migration boundary tests passed **14/14** against the new modules ([raw log](../../evidence/migration/boundary-tests.log)); strict isolated TypeScript validation also passed:

- [Backend tests](../../tests/migration-backend.test.ts) reject missing/wrong/short proxy secrets and mismatched forwarded origins before invoking auth/data dependencies; strip forged identity/host headers; derive identity freshly; recheck mutation Origin; revoke private team access after an actor change; preserve read-only viewers and independent auth cookies; redact exceptions.
- [Proxy tests](../../tests/migration-proxy.test.ts) pin origin/path/query, forward only allowed client headers, reject foreign/missing mutation origins, retain separate Set-Cookie values containing Expires commas, remove upstream hop/identity/CORS headers, constrain redirects, disable local fixtures in production and redact upstream exceptions.
- Independent review found that resolving an incoming pathname with `new URL(path, appOrigin)` could switch origins for a scheme-relative path. The integrator now assigns pathname/search onto a pinned origin and restricts backend paths to `/api/`; the new regression covers both cases. The frontend already limited forwarded routes to `/api/*`; no browser exploit was demonstrated.

Existing service tests remain the reference for atomic three-attempt submission/receipt guards, immutable scoring snapshots and intentional score reveal, leader/member privacy, role revocation, credit deletion cascades/instructions and audit masking. Passing SQLite behavior does not establish PostgreSQL trigger or transaction parity; native PostgreSQL verification belongs to the DB integration checks.

## Matched actual screenshots

The stable Home comparison uses exactly **1440×900** and **390×844**, identical reduced-motion settings, loaded fonts, explicit dot-field hydration and viewport screenshots. Development tool overlays are hidden. QA and UI inspected all four images. The [pixel comparison](../../evidence/migration/home-comparison.json) records crop bounds and source provenance.

| Viewport | Source                                                                 | Next migration                                                         | Observation                                                                                                                                                      |
| -------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1440×900 | [Source report](../../evidence/migration/v7-home-hydrated/report.json) | [Next report](../../evidence/migration/next-home-hydrated/report.json) | Delhi/Metro crop pixels identical. 1.3151% viewport pixels differ, including intentional new sign-in CTA and crisper dot edges after transient compositor hints. |
| 390×844  | Same source report                                                     | Same Next report                                                       | Delhi/Metro crop pixels identical. 0.2585% pixels differ, confined to CTA bounds; all remaining pixels match.                                                    |

Actual image paths, ready for Library delivery:

- `evidence/migration/v7-home-hydrated/home-1440x900-viewport.png`
- `evidence/migration/v7-home-hydrated/home-390x844-viewport.png`
- `evidence/migration/next-home-hydrated/home-1440x900-viewport.png`
- `evidence/migration/next-home-hydrated/home-390x844-viewport.png`

Images are normally Git-ignored. The authorized artifact fallback force-includes these four inspected Home images plus six inspected final sign-in/ready-workspace images; the [delivery receipt](../../evidence/migration/github-image-delivery.json) retains paths, source revisions, fixture provenance and SHA-256 hashes. Library tool discovery failed at the network layer before upload preparation, so no Library IDs or successful transfers are claimed. Initial full-page/early-hydration captures are diagnostic only and are superseded by the hydrated viewport pair. Full-page screenshotting alone does not trigger offscreen lazy content and must not be used to claim complete page fidelity.

The integrated root source `78b2fd4` produced [18 final viewport screenshots](../../evidence/migration/root-final/report.json), eight WCAG A/AA scans with **zero violations**, zero errors, no horizontal overflow and no blocked requests. Protected documents made zero duplicate bootstrap API reads. Credits' actual Upload CSV control opened the native picker at both viewports; its hidden input measured1×1px and no file was uploaded. No stylesheet injection or API mock was used. Separate [ready-workspace captures](../../evidence/migration/root-ready/report.json) use the authorized rich synthetic fixture: checked-in Alice, an existing submitted project and two committed versions. The Team and Project tabs were activated through the actual UI; no data-changing control was submitted.

The [capture runner](../../scripts/qa-migration-capture.mjs) requires a manifest naming an exact loopback origin, source root/revision, runtime, backend and explicit disposable/synthetic flags. It fingerprints tracked and new runtime source before/after capture. It records requests, bootstrap API counts, navigation diagnostics, geometry, screenshot hashes and WCAG A/AA axe results. Those local development timing observations are not a production performance benchmark.

## Motion checks

The [actual browser report](../../evidence/migration/next-home-hydrated-motion/report.json) passed **9 behavioral checks**: settled fields release rAF work; Pause/Resume and resize do not replay entrance; pointer repulsion returns home; only the interior Delhi fill moves while Metro/mask registration remains fixed; controlled hidden-state events stop work/show fallback; actual offscreen fields schedule no pointer work; reduced/coarse modes request no moving artwork. Hidden-state events are controlled in Chromium, not a claim about physical-device or background-tab throttling.

The separate [deterministic effect runner](../../scripts/qa-migration-motion.mjs) executes the actual bundled Dots/Delhi components with mocked React hooks and browser primitives. It passed Dots9/Delhi8 checks ([report](../../evidence/migration/mocked-motion.json)), including visible-time accumulation without hidden catch-up, first-intersection load gating, reuse of decoded layers and pointer cancellation/scroll/blur resets. This is mocked lifecycle evidence and is not combined with actual browser totals.

Chromium's native sandbox is unavailable in this container: the sandbox helper has an unusable owner and user namespaces are unavailable. New runners explicitly report `browserSandbox:false`, use fresh disposable contexts, deny external DNS/requests and load loopback synthetic pages only. Existing retained QA scripts are unchanged. No system sandbox configuration was modified.

## Audit findings and remaining verification

Initial source and Next scans each covered Home, Rules, Dashboard and Profile at both viewports ([before-fix evidence](../../evidence/migration/inherited-findings.json)). Both inherited Profile contrast failures: readonly input3.34:1 and selected gender label4.19:1, below4.5:1. Credits' global100%-width input rule also expanded its hidden file input and the desktop document. Narrow CSS fixes now give the readonly input5.63:1 and selected label4.62:1; the final integrated eight scans are clear and Credits fits both viewports while retaining native picker activation.

The retained [**36 popup checks passed**](../../evidence/migration/next-controls-popups/report.json) on source `5fc013e`, at1440×900,390×844 and320×480. They retain the bounded native dialog, focus trap/restoration, scroll/geometry, stacking/cancellation, draft-preservation, import, discovery and committed-history assertions. Fixture preparation uses ordinary UI filters and opens the team's native disclosure; no writes are allowed. Actual Next lifecycle failures were found and fixed: confirmation cleanup read a cleared ref and failed to restore parent focus; a stale queued native close event dismissed a reopened discovery dialog. The assertions were preserved, and the complete matrix passed after both fixes.

The retained [**33 restored-page skeleton checks passed**](../../evidence/migration/next-controls-skeleton/report.json) on source `856311f`. They verify initial SSR/bootstrap elimination, shell visibility, busy/status semantics, decorative placeholders, reduced motion, controlled failure/retry and no loaded-content overlay. These controlled restoration events do not establish BFCache eligibility. The frontend workstream separately verified actual delayed server navigation, removing a segment-loading boundary that replaced the whole shell; its source-bound report is `docs/migration/next-navigation-evidence.json`. Counts across these separate matrices are not combined into an exhaustive coverage claim.

The integrator records repository-wide typecheck/build/full-suite and native PostgreSQL transaction/trigger results separately. Real auth-provider completion, SMTP deliverability, managed private storage, hosted latency and physical-device behavior remain unverified here. No production readiness or complete visual-match claim is made from these local checks.
