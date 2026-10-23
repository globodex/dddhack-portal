# Isolated local performance evidence

Owner checkout: `.worktrees/performance-evidence`, branch `feat/performance-evidence`, fork `50c574e`. Only `scripts/performance*` and `docs/performance*` are owned here. The root agent owns portal, service, experience and current UI styles. No optimization file is claimed yet.

## Current state

Visual baseline and bounded read-only burst baseline completed on 23 October 2026. The measured compiled fingerprints stayed unchanged within and across both runs. Raw sanitized numeric evidence is checked in as `performance-visual-baseline.json` and `performance-burst-baseline.json`; summaries and exact toolchain are in `performance-checkpoint.md`.

PNG feasibility produced candidates only under `/tmp`; independent Pillow decoding, inflated scanlines and non-IDAT chunks match. No application or repository asset was modified. No after measurement or improvement claim exists. Optimization, any new ownership assignment and baseline/after comparison are deferred to the next engineering session.

The compiled visual setup in `.worktrees/visual-integration/scripts/visual-preview.mjs` uses an isolated temporary D1 database seeded from synthetic fixtures and serves `dist/server/index.js` on `127.0.0.1:4173`. The independent scripts do not start it or alter it. The older repository `playwright.config.ts` uses another port and `--no-sandbox`; it is intentionally not used.

## Prepared runs

From this worktree, after root confirms the fresh compiled synthetic preview is ready:

```sh
PLAYWRIGHT_BROWSERS_PATH=/tmp/ddehack-playwright-browsers node scripts/performance-visual.mjs --preview-ready
node scripts/performance-bursts.mjs --preview-ready --label baseline
```

The visual script imports only the approved official runner from `/tmp/ddehack-playwright-runner`, launches Chromium with `chromiumSandbox:true`, and permits only GET/HEAD requests to exactly `http://127.0.0.1:4173`. Other origins and mutation methods are aborted. It visits public Home, Alice's profile and the admin participant fixture at desktop/mobile sizes. It records CDP request events/encoded byte counts, separate Playwright request sizes, navigation/resource/paint timings, last observed LCP candidates, duplicate exact API GET URLs with phases, and image completion plus explicitly labelled post-snapshot `decode()` probes. Initial and controlled-scroll phases are separate. No form is submitted and no secret is revealed.

The read-only burst script uses fixed local API URLs, rejects redirects, verifies fixture identities, consumes response bodies without saving them, and records every request's status, elapsed time, received bytes and errors. It uses two preflight/warmup reads per scenario, then 24 samples at concurrency 1/4/8 for each of Home/profile/admin APIs: 216 measured GETs plus six warmups. It reports empirical p50/p95 and error rates, including both all-request and successful-request distributions. The maximum concurrency is eight. It does not use the existing mutation-heavy `scripts/load.ts`.

Both scripts fingerprint the preview's compiled Worker/config/client manifest before and after a run. A changed build invalidates the run. Raw reports go to ignored, unique `outputs/` subdirectories in this worktree. No app source, shared evidence or production backup is written.

## Baseline/after protocol

1. Root stops competing visual/performance runs and confirms the exact fresh compiled preview and synthetic harness.
2. Capture baseline without changing application files. Preserve raw reports and fingerprints.
3. Identify a concrete measured candidate, agree exclusive file ownership, implement the smallest fix, and run appropriate semantic checks.
4. Root integrates and rebuilds the candidate; record its new fingerprint and restart the same disposable synthetic harness.
5. Run the same visual and burst sequences with `--label after`. Repeat comparable runs if a directional claim is necessary; label sample counts and variance honestly.
6. Report raw changes, p50/p95 and error rates without inferring production capacity, causal attribution from a single run, or a guarantee of improvement.

## Optimization proposals awaiting evidence and ownership

Static file inspection at fork `50c574e` found these source sizes: `fallback-approved-v3.png` 1,689,967 bytes, `delhi-fill-overscan.png` 1,585,270 bytes, `metro-static.png` 302,684 bytes and `text-mask-alpha.png` 82,153 bytes. These are filesystem sizes, not measured transfers. The baseline must establish which assets actually download in each phase before choosing an optimization.

- If a downloaded PNG can be losslessly recompressed with a measurable reduction, propose ownership of that exact asset only. Verify decoded pixels, dimensions, alpha and rendered appearance are unchanged. Do not regenerate approved art or change formats/URLs without agreement.
- If the browser actually records duplicate concurrent same-view API calls, propose a new client-scoped in-flight request coalescing helper, with root retaining exclusive portal integration. Never cache protected responses across users, capabilities, mutations or page lifecycles. Do not implement this solely because focus and visibility listeners exist in source; observed requests decide whether it is useful.

No asset or helper implementation is authorized by this document. Root must agree exact exclusive ownership before edits. The latest user direction defers all such changes tonight.

## Reliability recommendations, pending measured prioritization

Keep retries and submission atomicity in the authoritative service, with AI inactive and off the submission path. Preserve bounded payloads, server authorization, no-store protected reads and immutable attempt accounting when optimizing. Avoid adding a global cache of private responses. For local observations, distinguish HTTP/network errors from application errors and retain sample sizes rather than reporting only successful latency.

Before any capacity statement, use a separately approved, representative environment, realistic fixture size, controlled concurrent workload and platform limits. These local low-concurrency reads cannot establish hosted capacity. No production stress, live writes, backup exports, paid API calls or credential access are part of this task.
