# After request reuse, protected hydration and client links

Audit runtime `cf169739068f85a7e87958ff4a8c18b366fb8bd1` merges integration runtime `02c9804`. Worker `f2e7cf88fd497a29f9a7001fed74af4eceaac67e187bf24b876d9984008c6a29`. Production build/artifact review passed198files.

Complete after run: `cf169739-2026-10-23T20-46-10.373Z/report.json`,17samples, zero errors, same rich/mockup/control synthetic fixture categories and sandboxed unthrottled browser with real HTTP cache. Earlier after run20-45-24.453Z retained11samples before a popup about:blank wait bug; fixing that harness wait required no runtime changes.

| Observation | Before | After |
| --- | --- | --- |
| Protected document full projections (exact source inspection) |3|1 request-scoped authorized view reused by guard/page |
| Protected document client bootstrap API |1|0 |
| Sidebar Discover/Rules/Dashboard new Documents |1each|0each |
| Sidebar client bootstrap API |1each|0each |
| Fresh six-event focus/visibility burst |6identical APIs|0APIs within2s freshness window |
| Expired six-event burst |6by existing handler behavior|1API after2.1s wait |
| Warm JS/style/font wire bytes |0 with observed cache hits|0 with observed cache hits |
| Protected cold script wire bytes |~207KB/7scripts|~219KB/7scripts |

The native client-link runtime adds about11.8KBwire to cold JavaScript. Hydrating data also increases HTML bytes. Removing API requests does not guarantee every document uses fewer transferred bytes. Persistent navigation avoids document bootstrap and re-execution while retaining warm browser assets.

Direct content readiness in supplementary baseline: Discover164.7ms, Rules138.9ms, Dashboard187.0ms, historyBack91.3ms, Forward160.6ms. Two after trials measured Discover122.1/224.1ms, Rules66.0/112.5ms, Dashboard98.4/198.7ms, Back21.1/25.5ms and Forward24.1/26.0ms. The request-count reductions repeat reliably; local time variance prevents a uniform latency speedup claim. Dashboard cold readiness varied305.7–662.9ms after versus459.6ms supplementary baseline. Final after Dashboard cold LCPcandidate540ms versus468ms original baseline; Profile220vs280ms and Admin212vs320ms. These isolated observations do not establish a field Web Vital improvement or regression.

Navigation checks passed for exact destination headings, back/forward, preserved modified-click href/new tab and unchanged original page, and participant navigation to Admin denied403 without an admin body. Native popup's first request can precede Playwright synthetic-header attachment; when it correctly redirected to sign-in, the runner explicitly attached the same fixture headers and replayed the target. Real managed cookie/session completion remains untested.

One harmless anonymous public-home GET probe, with body discarded, was refused by the environment's outbound proxy at CONNECT with403 before TLS,0downloadbytes. No request reached the hosted application, no hosted timing exists, and no alternate route/retry was attempted. This is an execution-network blocker, not a Site availability finding.

Remaining measured bottlenecks: accepted Home artwork remains~3.22MB desktop/~1.37MB touch image traffic on cold browser visits; participant/admin roles still receive the same broad client script set; default favicon requests hit dynamic HTML200 (~4.3KB) instead of a dedicated icon. Root was informed of the bounded metadata.icons fix using the existing supplied brandSVG. No global private cache, credential use, real AI call, publication, or production write occurred.
