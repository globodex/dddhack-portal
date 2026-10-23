# Local browser waterfall baseline

Compiled runtime5fa4ffea3a2d62c7ebb7671a4ac572ef2043e1e9, Worker2a9faed220192b2abb77788bd6c3c8ed36e3db51025ae3418dc5a0b9360388d3, isolated rich/mockup/control synthetic fixture.14 exploratory samples, sandboxed Chromium, no throttling, real HTTP cache enabled and no browser request routing. Warm script/style/font cache hits were observed. These are one sample per scenario/cache state, not statistical estimates or hosted capacity.

Evidence is `5fa4ffea-2026-10-23T20-40-11.995Z/http-only-report.json`; the raw report is retained alongside it. A classification-only correction excludes local blob/data resources (every excluded entry transferred0bytes) and clears inherited document metrics for the focus-only phase. It changes no real transfer-byte or document-timing measurement. An earlier0-sample timeout on the shared stalled preview is retained in20-37-44.983Z; the isolated preview was responsive without sites-env bootstrap. No production request or user mutation was performed.

| Route | Cold TTFB ms | Cold LCP candidate ms | Warm TTFB ms | Warm LCP candidate ms | Cold wire bytes | Warm wire bytes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Home desktop |48.0|444|28.4|112|3,577,803|16,080|
| Dashboard participant |111.8|468|88.0|252|296,130|11,919|
| Profile participant |30.4|280|25.0|124|292,476|9,786|
| Participants admin |46.2|320|29.1|140|293,805|11,109|
| Home emulated touch |25.8|244|19.2|72|1,684,519|15,573|

Measured priorities:

1. A deliberately injected burst of three focus and three visibility events produced6identical Dashboard API requests,5duplicates,15,390bytes. This is a controlled event burst, not a claim that ordinary navigation always generates duplicates.
2. Sidebar Discover, Rules and Dashboard each caused a new Document, changed timeOrigin, and1API request. Seven scripts re-executed from cache; assets were not downloaded again. Warm sidebar Dashboard TTFB84.9ms and last observed LCP236ms. Client navigation can remove full-document bootstrap overhead, but needs role/route/recovery checks.
3. Exact source inspection finds3complete protected-view projections per document visit: worker/index.ts pre-render permission view; app/[[...path]]/page.tsx discarded view; then client/API view. Browser sees only document+1API, not the two internal calls. Request-local reuse and private initial hydration are bounded fixes; no cross-request or cross-user response caching is warranted.
4. Every protected cold route fetched the same7scripts, about207KBwire. Root portal imports participant, admin, profile, Home and submission code into the shared client dependency graph. Role/editor bundle separation remains a candidate after higher-impact repeated-projection work is measured.
5. Home artwork dominates cold bytes:3.22MB desktop images and1.37MB touch images. Accepted originals/motion are unchanged. This does not justify rewriting visuals or lossy assets. Warm images mostly validate304while scripts/fonts/CSS hit cache.

LCP values are last observed candidates after a fixed settle period, not finalized Core Web Vitals. Backend cache warmth, local CPU contention, image decoding and browser startup affect these samples. No network/CPU throttling or hosted signed-in performance was measured.
