# Migration QA evidence

All evidence here is local and synthetic. No production records, deployed Site, provider accounts, credentials, DNS, AI calls or external production endpoint were used. Browser requests are restricted to the declared loopback origin and GET/HEAD. A synthetic fixture cookie selects an already-seeded actor; screenshots are actual rendered application pages backed by disposable SQLite, not API mocks.

## Regression and security checks

The retained v7 suite passed **316/316**, no failures or skips, serially on 24 October 2026 in 64.80 seconds. [Raw log](../../evidence/migration/baseline-tests.log). This is the unmodified baseline suite, not a claim that the integrated migration has passed every retained test.

New migration boundary tests passed **14/14** against the new modules:

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

Images are intentionally Git-ignored; reports retain SHA-256 hashes. The integrator owns Library upload and final links. Initial full-page/early-hydration captures are diagnostic only and are superseded by the hydrated viewport pair. Full-page screenshotting alone does not trigger offscreen lazy content and must not be used to claim complete page fidelity.

The [capture runner](../../scripts/qa-migration-capture.mjs) requires a manifest naming an exact loopback origin, source root/revision, runtime, backend and explicit disposable/synthetic flags. It fingerprints tracked and new runtime source before/after capture. It records requests, bootstrap API counts, navigation diagnostics, geometry, screenshot hashes and WCAG A/AA axe results. Those local development timing observations are not a production performance benchmark.

## Motion checks

The [actual browser report](../../evidence/migration/next-home-hydrated-motion/report.json) passed **9 behavioral checks**: settled fields release rAF work; Pause/Resume and resize do not replay entrance; pointer repulsion returns home; only the interior Delhi fill moves while Metro/mask registration remains fixed; controlled hidden-state events stop work/show fallback; actual offscreen fields schedule no pointer work; reduced/coarse modes request no moving artwork. Hidden-state events are controlled in Chromium, not a claim about physical-device or background-tab throttling.

The separate [deterministic effect runner](../../scripts/qa-migration-motion.mjs) executes the actual bundled Dots/Delhi components with mocked React hooks and browser primitives. It passed Dots9/Delhi8 checks, including visible-time accumulation without hidden catch-up, first-intersection load gating, reuse of decoded layers and pointer cancellation/scroll/blur resets. This is mocked lifecycle evidence and is not combined with actual browser totals.

Chromium's native sandbox is unavailable in this container: the sandbox helper has an unusable owner and user namespaces are unavailable. New runners explicitly report `browserSandbox:false`, use fresh disposable contexts, deny external DNS/requests and load loopback synthetic pages only. Existing retained QA scripts are unchanged. No system sandbox configuration was modified.

## Audit findings and remaining verification

Initial source and Next scans each covered Home, Rules, Dashboard and Profile at both viewports (eight axe scans). Home/Rules/Dashboard had no violations. Both runtimes inherit the same Profile `color-contrast` violation: readonly input3.34:1 (`#778594` on `#edf2f5`) and selected gender-label white on `#008d66`4.19:1. Both miss4.5:1. Desktop Credits also has inherited horizontal overflow. These are source issues, not demonstrated migration regressions; the integrator has the exact selectors and evidence.

The retained **36 popup** and **33 route-skeleton** semantics still need execution on the final integrated Next runtime. They cover bounded native dialogs, focus/scroll restoration, stacking/cancellation, status draft preservation, shell visibility during restoration, aria-busy/status, reduced motion, controlled failure/retry and request elimination. A new stalled server-navigation case is also necessary because Next segment loading can replace the shell independently of restored-page handlers; the frontend workstream is fixing and testing that path. Historical counts must not be reused as current pass claims.

Final integrated typecheck/build/full-suite, native PostgreSQL transactions/triggers, real cookie/auth-provider completion, SMTP deliverability, private storage and hosted latency remain separately gated. No production readiness or complete visual-match claim is made from these local checks.
