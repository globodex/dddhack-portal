# Matched production frontend comparison

The comparison is complete and shows an unresolved **cold Dashboard cost**. Median FCP rose436→596ms (+160ms); cached repeat FCP remained132ms. Cold transfer rose319,930→373,304 bytes (+16.68%). No performance source change was made. These results support a measured tradeoff, not a claim that the redesign is faster.

[Full56-sample report](report.json), [statistics](summary.json), [waterfalls](waterfalls.csv), [attribution](attribution.json), and [runner](measure-production.mjs) preserve the evidence. All4 benchmark PNG originals were opened and viewed: [before Dashboard](baseline-dashboard-1440x900.png), [final Dashboard](final-dashboard-1440x900.png), [before People](baseline-people-1440x900.png), [final People](final-people-1440x900.png).

## Sources and controls

- Baseline frontend `c353a173a85580ebb4eed47fff0a23a0830b81a6`: runtime source696b125 with a build-only TypeScript main-config correction, unchanged application.
- Final frontend `b3b6da9b2d417c8cb997d41de8abe54c9f470f0d`: documentation-only commit after runtime2657f26254ed323ca84a167a2f220f05f4ec7cbf. Rootd3c32 app is equivalent. Neither measured frontend has uncommitted application/config changes.
- Existing matched production `next build --webpack` artifacts, Node24.19.0/Next16.4.3. Build IDs baseline `FxM2l4SoSH0RiG3L9SgqW`, final `QdP_-Y3mVZskIG5jIP-YD`. Build/lifecycle provenance is owned by the separate build lane.
- Supported Next custom HTTPS server, `dev:false`, real encrypted socket and exact `.test` hostname/port; no app-source, proxy-guard or framework configuration override. Production frontend `PORTAL_LOCAL_TEST` is unset. Node verifies the ephemeral CA through `NODE_EXTRA_CA_CERTS`; no TLS verification disabling. Only isolated Chromium ignores the self-signed certificate.
- Both frontends use the **same baseline696 synthetic backend8851** and exact recovered rich-fixture copy `/tmp/ddd-production-comparison-hgn0f2x0.sqlite`. Synthetic Alice identity is supplied by that local fixture, not real Google authentication. This measures production-built frontend rendering and transfer against a controlled backend; it does not measure the hosted Neon/database/provider network or verify authentication/deployment compatibility of the new backend.
- Dashboard plus People control, desktop1440×900, reduced motion, unthrottled local Chromium, no native sandbox available. Two fresh first-server navigations are reported separately (n1 each), followed by identical warm-up. Seven alternating paired rounds per route/variant: fresh browser context with HTTP cache disabled, then enable cache, prime one reload (excluded), and measure a cache-enabled repeat.56 measured samples total, plus28 excluded cache primes/four identical warm-ups/two server-cold observations. No other build/browser/heavy-test load during collection.
- Browser CONNECT proxy allows only the two local frontend endpoints. TLS frontend/backend wrappers deny non-GET/HEAD. Chromium background Google time/update connection attempts were blocked by the proxy; **no page external request or external traffic was allowed**. Playwright request routing was deliberately absent, since it disables the HTTP cache.

## Measured results

Values are median / nearest-rank p95 in milliseconds. With n7, p95 is the largest observation, a descriptive tail value rather than a reliable population percentile. LCP is the last candidate observed at sample time, not field Core Web Vitals.

| Route / cache | TTFB before | TTFB final | FCP before | FCP final | LCP before | LCP final |
|---|---:|---:|---:|---:|---:|---:|
| Dashboard cold browser |68.8 /113.3|93.1 /218.8|436 /852|596 /1,440|436 /852|596 /1,440|
| Dashboard repeat |34.2 /87.6|41.0 /64.9|132 /316|132 /196|132 /316|132 /196|
| People cold browser |63.3 /183.5|62.8 /126.0|432 /1,000|460 /584|432 /1,000|460 /584|
| People repeat |31.4 /89.1|36.9 /79.5|136 /448|120 /336|136 /448|120 /340|

| Route / cache | Completed HTTP requests before/final | Actual network requests before/final | Wire bytes before/final |
|---|---:|---:|---:|
| Dashboard cold |18 /22|18 /22|319,930 /373,304|
| Dashboard repeat |18 /22|6 /6|15,736 /16,820|
| People cold |18 /20|18 /20|330,962 /354,553|
| People repeat |18 /20|5 /5|12,949 /13,440|

All56 responses200; initial browser API calls0, page errors0, external page requests0, horizontal overflow0. Exactly90 backend projection GETs (45 per variant, one per navigation including excluded setup/prime loads); session calls0 during the matrix. No duplicate bootstrap projection/session fetch was introduced. Dashboard is slower in6of7 paired cold rounds; paired median FCP delta+108ms (difference of marginal medians+160ms). People is a useful control but its rendered card design also changed. Dashboard's LCP element changed from the small Dashboard heading to the large team heading, so LCP is not a comparison of identical painted elements.

The n1 first-server observations, excluded from the table, were baseline TTFB475.1/FCP916 and final302.8/764. They must not be used to claim cold-server improvement. Development diagnostics in `evidence/final-performance-current` are separate and are not substituted for this production-built comparison.

## Attribution and limits of a fix

Dashboard's fixed extra53,374 wire bytes comprise **23,310CSS +14,385JS +14,595font +1,084HTML**. Final has5render-blocking stylesheets versus3. The shared layout imports public, profile, admin and Studio sheets globally. Route CSS splitting or removal of overridden legacy CSS could reduce transfer, but requires a separate implementation and cross-route interaction/visual verification; no unproven CSS deletion was made.

The extra font is DM Sans900, selected by the Studio heading's CSS weight800 because the installed faces are400/500/700/900. The selected source and actual accepted typography use this heavy face. Switching to700 would reduce headline weight, so it was not treated as a safe optimization.

The font finishes before FCP in **all7 cold Dashboard samples**, by139–249ms. In the one separate final CPU trace, all four font requests begin223.0–223.7ms after document send; first Layout lasts184.1ms, fonts finish422.8–425.9ms, and the second Layout is10.0ms.900 finishes just1.8ms after the last other font. The trace does not show a100ms second-layout/font-swap penalty or establish that a preload would recover the160ms median cost. No speculative preload/public-font duplicate was added.

[CPU trace report](cpu-profile-report.json), [baseline trace](baseline-dashboard-timeline.json.gz), [final trace](final-dashboard-timeline.json.gz) contain exactly one additional diagnostic load per variant. Inclusive main-thread Layout totals96.3→195.3ms and UpdateLayoutTree18.6→28.4ms; EvaluateScript240.1→166.7ms. These n1 instrumented totals overlap nested events and carry tracing overhead. They support investigating layout/CSS before blaming JS execution; they do not isolate a single cause or prove a safe fix. The matrix's long-task total median117→203ms includes tasks **after FCP**, so it is not all paint-blocking time.

## Raw validation correction

The initial end-of-run cache assertion counted an inline `data:image` fixture as a cache hit, even with HTTP caching disabled. All56 timings were already collected and the browser closed. [Original raw report](raw-report-before-http-counter-correction.json), [exact original runner](measure-production.raw-runner.mjs), and its checksum remain intact. [Correction script](correct-http-counters.py) recomputes only HTTP cache/request counters, preserving every timing, wire total and complete request record. All28 cold rows have zero HTTP cache hits; all28 repeat rows have real HTTP cache hits. The report retains the original validator error and records the correction. No timing sample was dropped and no second matrix was substituted.

## Fixture safety and cleanup

[The earlier fixture incident](INCIDENT.md) is explicitly preserved. The positional-output mistake occurred before the hold and invalidated its failed preflight, not the previous completed development run. Root/Reference recovered an exact64-table copy; this resumed measurement never touched the overwritten original.

Named `--source`/`--output` helper manifests [before](fixture-resume-before.json), [after56](fixture-resume-after.json) and [after profiling](fixture-after-profiling.json) all match `bf01ef3f41c8ffced1c2d7d9109a3c4f43de014427c8da40d672e946cbd06d45`; integrityOK, foreign-key violations[]. No fixture seed, data deletion or HTTP mutation was performed in the resumed task. Prior failed/pre-hold/preflight provenance remains intact.

All browsers are closed. Landing stopped HTTPS Next PIDs143965/143961; this lane stopped backend8851 PID143771 and API/CONNECT PID143790. All3443/3444/8842/8851/8899 listeners were verified absent. The ephemeral CA/keys remain private under `/tmp` and are not committed. New evidence commits are local only, with author and committer Parampreet Singh <rubercuber.30@gmail.com>. No push, main merge, provider setting, hosted database action or deployment occurred during this resumed task.
