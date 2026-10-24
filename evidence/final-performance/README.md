# Frontend before/after observations

Baseline696b125; final applicationae2b027. Same disposable backend8789 and Next16.4.3 development webpack.28 samples in each version:3fresh desktop browser contexts per7routes,1mobile context per route. HTTP cache disabled, same unchanged synthetic data. Final run happened after other QA browsers/build/test jobs ended. Raw initial compilation outliers remain in both reports.

| Route | Before/after completed requests | Before/after wire bytes | Byte change | Before/after median TTFB | Before/after median FCP |
| --- | ---: | ---: | ---: | ---: | ---: |
| /dashboard | 15/15 | 4,108,767/4,145,978 | +0.91% | 299.6/560.8ms | 688/864ms |
| /discover/participants | 14/13 | 4,119,819/4,142,465 | +0.55% | 460.1/290.1ms | 1188/640ms |
| /discover/teams | 12/11 | 4,117,204/4,139,845 | +0.55% | 368.5/192.1ms | 824/592ms |
| /admin/participants | 11/11 | 4,104,302/4,146,038 | +1.02% | 404.9/439.2ms | 1188/764ms |
| /admin/teams | 12/12 | 4,121,121/4,158,911 | +0.92% | 1162.4/337.4ms | 2080/728ms |
| /admin/submissions | 11/11 | 4,104,275/4,141,619 | +0.91% | 815.6/272.0ms | 1644/608ms |
| /admin/settings | 12/12 | 4,107,017/4,144,788 | +0.92% | 535.8/239.0ms | 1540/656ms |

Completed request count did not increase on these initial navigations. Wire bytes rose0.55–1.02% across desktop medians. Initial browser API requests remained0 in all28 baseline and28 final samples; protected data still arrived in the authorized SSR projection. Placeholders did not add requests. Final run:20native screenshots,0page errors,0blocked/external/mutation requests.

Timing results are mixed: Dashboard median TTFB/FCP increased, while other observed medians generally decreased. Development server cache/compilation and process conditions limit the comparison. These measurements do not promise faster production performance or hosted capacity. Admin now opens populated All filters, so its DOM is intentionally different. Mobile samples are single observations, not percentiles.

The default Turbopack production build emits13JS chunks totaling943,030bytes,284,077bytes gzip estimate across all routes. CSS totals279,287bytes,46,811gzip estimate. This inventory includes chunks a visitor may never request; it is not a production transfer measurement. No dependency or lockfile change was introduced. Exact hashes/sizes are in `../release-validation/production-assets.json`.

Normal-motion landing verification separately demonstrates rest/offscreen pause and reduced-motion behavior; performance navigation uses reduced motion. Native architecture tests and hydrated modal/selection controls are not replaced by timing.

Raw reports: `../redesign-rich-before/report.json`, `report.json`; numerical medians and methodology: `comparison.json`. Screenshot pixels use the actual application with synthetic content.

A separate like-for-like44-participant All/All check resolves the default-filter confound: original document2,832elements versus final2,905 (+73); participant section2,691→2,707 (+16). The old default's240elements represented an empty state. Actual matching-filter evidence is in `../admin-dom-comparison/report.json`.
