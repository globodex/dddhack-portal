# Pure public-content defaults: fixed production comparison

The candidate removes **24,822 script wire bytes per cold visit** on Dashboard, People and Home without adding a request or asynchronous boundary. Source/SSR/navigation/pixel gates pass. Local timings are **mixed**, including a worse cold People median/tail, so this supports a payload reduction, not a universal speed improvement or a claim that the earlier160ms Dashboard cost is fixed.

[Full70-sample report](report.json), [statistics/paired deltas](summary.json), [waterfalls](waterfalls.csv), [compiled graph gate](compiled-gate.json), [visible SSR/navigation/mobile gate](preflight.json), and [pixel comparison](gate-pixels.json) preserve the evidence. Earlier original696 and Home-dynamic candidate comparisons remain separate; none of their timing samples is pooled here.

## Candidate and unchanged boundaries

Current control is the accepted e135-equivalent frontend artifact in `/workspace/ddd-perf-prod-final`, source3c3d3b2f1934da09a1094ec66b5925715463898b (documentation after runtime2657), buildID`QdP_-Y3mVZskIG5jIP-YD`. Candidate source is **d24b47f01c40abe247944a2e81e414a7a31ac06d**, `/workspace/ddd-perf-content-boundary`, buildID`XehgeJXDCi4ZqY376uUy7`.

The root-owned change moves the exact default text literal into pure `lib/public-content-defaults.ts` and redirects two browser imports there. The existing server contract keeps its validator prefix and compatibility re-export. Root's41related tests/typecheck/equality/HTML-denial review passed; this evidence lane did not edit application source. The prior Home asynchronous experiment remains unintegrated; this candidate keeps Home synchronous.

The independent compiled gate reads existing artifacts only. The old client graph contains the84,117-byte Zod factory; **all emitted candidate client chunks have zero ZodError matches**, and the initial factory/byte graph agrees with the separate build lane. Root CSS paths, order and bytes match exactly; fonts and their paths are unchanged. Static initial-JS estimates from the build lane fall84,999raw /24,801gzip bytes. Observed wire transfer, including protocol overhead, is reported below rather than equating gzip estimates with per-visitor transfer.

## Fixed method and results

Both variants use the same exact recovered synthetic copy and baseline696 backend8851. Production frontend local-test mode is unset; native HTTPS sockets/exact.test origins and Node's verified ephemeral CA preserve production proxy guards. Identity is explicitly synthetic, not real Google sign-in. No provider, hosted database, deployment or production credential is used. This is a local production-built frontend comparison, not hosted latency/capacity or field Core Web Vitals.

The single fixed run has **70 measured samples**: seven alternating paired rounds of Dashboard/People cold browser plus cache-enabled repeat (56), and anonymous Home cold browser (14). Identical warm-ups,28 excluded cache primes and two separated first-server observations are retained. No timing sample was removed and no matrix repeated. Chromium desktop1440×900, reduced motion, fresh contexts, unthrottled local device; native sandbox unavailable. Cold HTTP cache is disabled; repeat cache is enabled after a prime. A fixture-only CONNECT proxy blocks external destinations without request interception disabling the cache. No competing build/browser/heavy-test work ran during measurement.

Values are median / nearest-rankp95 milliseconds. At n7, p95 is the maximum observation, a descriptive tail rather than a reliable population percentile.

| Route / cache | TTFB current | TTFB candidate | FCP current | FCP candidate | LCP current | LCP candidate |
|---|---:|---:|---:|---:|---:|---:|
|Dashboard cold|80.7 /213.1|86.9 /107.7|496 /760|464 /552|496 /760|464 /552|
|Dashboard repeat|34.2 /50.8|33.9 /51.3|124 /188|132 /156|124 /200|132 /156|
|People cold|65.3 /96.2|49.6 /90.2|380 /632|440 /2,280|380 /632|440 /2,280|
|People repeat|31.3 /39.2|26.3 /52.2|116 /184|116 /204|116 /184|116 /204|
|Home cold|58.1 /160.6|53.9 /70.4|564 /792|492 /976|564 /792|492 /976|

| Route / cache | HTTP requests current/candidate | Actual network current/candidate | Wire bytes current/candidate |
|---|---:|---:|---:|
|Dashboard cold|22 /22|22 /22|373,304 /348,484|
|Dashboard repeat|22 /22|6 /6|16,820 /16,822|
|People cold|20 /20|20 /20|354,554 /329,732|
|People repeat|20 /20|5 /5|13,441 /13,441|
|Home cold|21 /21|21 /21|1,520,183 /1,495,363|

Script transfer238,645→213,823bytes is24,822bytes lower in every cold route. Tiny HTML changes account for total reductions24,820Dashboard (6.65%),24,822People (7.00%),24,820Home (1.63%). CSS remains57,151bytes per cold route; fonts58,536Dashboard/Home and43,941People, identical. Cached CSS/font transfer is0 in all repeat samples; native cache-hit/network request counts remain equal. No Home cost is shifted to a new script request.

Paired FCP deltas (candidate−current), with all observations retained:

- Dashboard cold median−40ms, faster4/7, slower3/7; repeat median−28ms, faster4/7, slower3/7. Marginal repeat median still rises124→132ms because a difference of medians is not the median paired difference.
- People cold median+40ms, slower5/7; the round3candidate2,280ms sample is retained (paired+1,840ms). Candidate marginal cold median380→440ms is worse in this run. Repeat paired median+4ms, slower4/7/faster3/7; marginal repeat116→116ms.
- Home cold paired median+8ms, slower4/7/faster3/7 despite marginal564→492ms. Tail792→976ms is retained.

All repeat observations have0long tasks in both variants. Cold total long-task medians are Dashboard144→140ms, People158→219ms, Home109→127ms; totals include post-FCP work and do not isolate paint blocking. No new CPU trace or speculative cause was added. The data therefore does not establish uniform timing improvement, and the adverse People result is not dismissed as proven noise. The confirmed optimization is removal of unnecessary client package bytes with intact behavior.

All70 responses200, page errors0, external page requests0, horizontal overflow0. Private initial browser API calls0. Home retains the same one existing browser refresh after its SSR projection in both variants. Backend trace totals122view GETs,61per variant, session calls0, all200. This matches106navigations including setup/prime plus16existing Home refreshes; no new request is attributed to this candidate.

## Actual rendered gates and screenshots

Before numerical collection, one browser checked each variant's visible Home and Dashboard with JavaScript disabled, then hydrated Dashboard and actual Projects→Home navigation. The candidate also completed one390×844 touch flow through the real black44px mobile menu to Home; menu closes, Home is visible, document width390equals viewport390 and no page error occurs. No artificial held Home chunk is used because Home remains synchronous. After this gate, both HTTPS apps were symmetrically restarted with zero warm-up before the fixed matrix.

All four desktop gate pairs are pixel-identical: Home/Dashboard, no-JS/hydrated. All three matrix pairs are pixel-identical: Dashboard/People/Home. Original16PNGs are preserved. They were inspected using full-page contact sheets, plus native mobile menu/first-viewport detail and the full mobile original. The no-JS gate checks actual visibility, not merely hidden streaming text; Home's synthetic private venue marker remains absent. Offscreen portrait loading matches the control. This is Chromium emulation, not a physical-device claim.

Selected originals: [candidate Dashboard](final-dashboard-1440x900.png), [candidate People](final-people-1440x900.png), [candidate Home](final-home-1440x900.png), [Home without JS](final-home-nojs.png), [mobile menu](final-mobile-menu-390.png), [mobile Home](final-mobile-home-390.png). Current counterparts and source dimensions are recorded in the same folder and screenshot manifest.

## Integrity, cleanup and scope

Named [before](fixture-before.json) and [after](fixture-after.json) manifests match all64table schema/content hashes: `bf01ef3f41c8ffced1c2d7d9109a3c4f43de014427c8da40d672e946cbd06d45`, integrityOK and no foreign-key violations. The helper reads only the recovered comparison copy with SQLite read-only/query-only; explicit output collision/overwrite guards apply. The overwritten original from the earlier documented incident was not accessed. No seed, domain mutation or data deletion occurred.

All browsers are closed. Landing stopped HTTPS PIDs159430/159426; this lane stopped backend8851 PID158756 and API/CONNECT PID158775. All3443/3444/8842/8851/8899 listeners were verified absent. Root was released for its guard test/backend artifact/default build. No push, main merge, hosted operation, credential/provider setting or deployment occurred. New evidence commits are local only, author and committer Parampreet Singh <rubercuber.30@gmail.com>.

This is a justified client/server dependency-boundary fix with a measured network benefit and documented timing uncertainty. It does not remove the previously measured extra globalCSS/font cost or substantiate a claim that the original160ms Dashboard regression is solved.
