# Measured cloud performance

Workload and final browser source: `0a2e3f97b457d4ba8fd1a71333887b50633d84e3`; Worker `b127925d2aaa0eea1f44f6526d4e1437038549e9aa2ca6ac7371a55f092a13c7`. The later `436c918` build changes Crown presentation only. These are local compiled Worker measurements with disposable synthetic D1, not hosted capacity or a readiness guarantee. No production stress test was performed.

## Fresh 1,986-request workload

Dataset300participants/90teams;314GET and1,672POST;116expected rejections;zero unexpected errors. At most16simultaneous requests, rather than300concurrent users. The complete [report](../evidence/v7-final-local-load/report.json) preserves every operation and group. Other local regression/browser work ran concurrently; this is not an exclusive matched before/after timing trial.

| Operation | Concurrency | Requests | p50 ms | p95 ms |
| --- | ---: | ---: | ---: | ---: |
| Normal reads |1|75|13.6|48.8|
| Normal reads |4|75|62.9|139.6|
| Normal reads |8|75|110.0|239.7|
| Normal reads |16|75|247.2|563.7|
| Initial submission commits |8|90|151.7|223.3|
| Second commits |8|86|138.1|271.8|
| Third commits |8|86|149.2|197.4|
| Identical initial submission retries |16|90|304.3|321.7|
| Unique votes |16|600|206.1|437.1|
| Duplicate vote retries |16|300|165.4|306.2|

Each write group above had zero unexpected errors. Fourth submissions and concurrent distinct final-attempt contenders were correctly rejected; their116expected rejections are not counted as successful writes. No cross-operation aggregate percentile is presented. Integrity checks retained270versions/receipts,600uniquevotes, zero foreign-key violations and270pending verification jobs with attempts0 and no provider activity.

## Browser cold and warm reloads

The baseline is source `5fa4ffea`; final source is `0a2e3f97`. Sandboxed Chromium, unthrottled localhost, real browser HTTP cache. Each table cell is a single same-condition observation. LCP is the last observed diagnostic candidate, not a finalized field Web Vital. There is no meaningful p95 estimate from these mixed single samples.

| Route | Cold TTFB before→after ms | Cold LCP candidate before→after ms | Warm TTFB before→after ms | Warm LCP candidate before→after ms |
| --- | --- | --- | --- | --- |
| Home desktop |48.0→43.3|444→344|28.4→20.4|112→116|
| Dashboard |111.8→75.7|468→232|88.0→46.1|252→108|
| Profile |30.4→29.8|280→176|25.0→25.5|124→60|
| Admin Participants |46.2→46.1|320→216|29.1→24.5|140→84|
| Home emulated touch |25.8→24.7|244→260|19.2→17.9|72→88|

Touch Home's LCP candidate and some warm samples did not improve. Earlier after trials also varied substantially, including cold Dashboard readiness305.7–662.9ms under local contention. These observations do not support a uniform percentage speedup.

## Navigation and request elimination

Supplementary baseline direct-navigation content readiness was Discover164.7ms, Rules138.9ms and Dashboard187.0ms. The final trial measured142.1ms,80.7ms and107.8ms respectively. History Back91.3→46.3ms; Forward160.6→25.7ms. These figures measure content readiness, separately from document TTFB or click feedback.

| Repeatable behavior | Before | After |
| --- | --- | --- |
| Complete authorized projection per protected document, exact source inspection |3|1 request-scoped promise |
| Protected client bootstrap API |1|0 |
| Sidebar new Document / bootstrap API |1 /1|0 /0 |
| Six rapid focus/visibility events within freshness |6APIs|0APIs |
| Same burst after freshness expires |6APIs|1API |
| Admin50-row repeated decoded JSON |22,157bytes|17,939bytes |

Admin's4,218byte reduction is19.0% of decoded JSON. It does not reduce or cache fresh authorization/database work, phone/idea/credit projection or volatile status. Actor changes and role revocation were verified with actual D1 and browser403/cache-clear checks. There is no public/shared private-data cache.

Complete cold Home CDP transfer totals were3,577,803→2,644,248bytes desktop (26.1% lower),1,684,519→1,473,112bytes touch (12.6% lower). Lossless artwork alternatives preserve the decoded approved pixels. The client-link runtime adds about11.8KB cold wire JavaScript and SSR hydration increases document size; request elimination does not guarantee fewer bytes in every protected document. Some soft-navigation RSC transfer lengths were unknown and are explicitly marked lower-bound in the raw report.

Admin agenda/FAQ recorded30click-to-first-feedback observations from1.6–55.5ms across mouse/keyboard/touch. Local add/remove used zero requests. Confirmed save/publication requests measured29–55ms. This is scoped UI feedback evidence, not the latency of every button or a hosted benchmark.

The harmless hosted public-home probe was refused by the environment proxy at CONNECT403, before TLS and with zero downloaded application bytes. No hosted timing exists. Managed signed-in sessions, venue networks and physical devices remain unverified.

Raw sources: [baseline](../evidence/v7-waterfall/BASELINE.md), [final browser report](../evidence/v7-waterfall/0a2e3f97-2026-10-23T21-08-05.797Z/report.json), [cache verification](../evidence/v7-admin-presentation/frozen-verification.md), [admin interaction evidence](../evidence/v7-admin-editor-final/summary.json).
