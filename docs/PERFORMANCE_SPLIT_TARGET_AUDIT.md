# Measured targets for preserving the approved UI

For source `e135e3ec7b787f7e6167c29f4e46bc76a9fbfcec`, the best small candidate is a conditional `next/dynamic` import of **Home inside the client Portal, with SSR retained**. The lightweight estimate is **22,513 fewer initial minified bytes / 7,410 fewer gzip bytes** on private pages. It excludes shared avatar/heading/content modules and respects the stock table's existing asynchronous boundary. This is an estimate to validate, not a claimed Next build saving or a fix for a measured paint delay.

No application, layout, CSS, permission or server payload changes were made. No Next build, browser, server, database, provider, push, merge or deployment was run. Existing production bundles were inspected; lightweight in-memory esbuild transforms produced only analysis JSON.

## Exact existing payload attribution

The entire frontend source graph (`app`, `lib`, Next config, package/lock files and TypeScript config) is byte-equivalent between e135 and the existing final production webpack build at `2657f26`. That permits using the preserved build for this source analysis without compiling a new app.

The existing matched production Dashboard cold samples show:

| Resource    | Baseline wire bytes | Final wire bytes |  Added |
| ----------- | ------------------: | ---------------: | -----: |
| JavaScript  |             224,260 |          238,645 | 14,385 |
| Stylesheets |              33,841 |           57,151 | 23,310 |
| Document    |               9,041 |           10,125 |  1,084 |

These are observed response bytes from the preserved measurement matrix. They include response overhead and cannot be substituted with standalone gzip estimates.

Three foundation JavaScript requests are byte-identical in both variants and total 133,157 wire bytes. The entire 14,385-byte JS increase is in the application/bootstrap family: baseline 91,103 versus final 105,488 wire bytes. The baseline's Portal client factory is 199,664 raw / 55,146 standalone gzip bytes; the final concatenated factory is 229,710 / 62,300. The factory's 7,154 gzip increase does not equal the network increase because chunk partition, other factories, compression and wrappers also changed.

The existing stock table is already separate: webpack module 9460 is 7,170 raw / 2,454 standalone gzip bytes in `460.bc87bd5f73b2eb94.js`. It is not part of the initial Dashboard scripts. Counting it again as a new admin split saving would overstate the result.

## Small code-splitting candidates

The table uses an in-memory esbuild ESM graph with minification, external packages and real static/dynamic import separation. Each row externalizes one entry and recomputes the initial static closure. This estimates code that could move out of the initial client graph; the deferred chunk still needs to be downloaded when used. Differences are not additive.

| Entry                   | Initial raw bytes removed, estimate | Initial gzip bytes removed, estimate | Scope and risk                                                                                                   |
| ----------------------- | ----------------------------------: | -----------------------------------: | ---------------------------------------------------------------------------------------------------------------- |
| Home                    |                              22,513 |                                7,410 | Strongest small candidate. Only `path === '/'` mounts it. Keep default SSR and all existing public markup.       |
| Admin credit manager    |                              10,733 |                                2,932 | Admin-only render; keep its existing stock table lazy boundary and server-authorized data.                       |
| Admin import dialog     |                               5,266 |                                1,570 | Includes import UI exports that become unused. Preserve opener focus, Escape/history and loading geometry.       |
| Owner submission window |                               3,805 |                                1,153 | Preserve visible owner controls, datetime conversions and confirmation behavior.                                 |
| Add/revoke admin access |                               2,581 |                                  730 | Preserve owner-only projection and current run/confirmation contract.                                            |
| Admin project actions   |                               2,575 |                                  640 | Small gain; preserve exact target/removal scope and confirmations.                                               |
| Leader transfer         |                                 665 |                                  162 | Too small alone; shared admin operation code remains elsewhere.                                                  |
| Profile flow            |                              11,493 |                                3,324 | Separate candidate; authorized onboarding can render from Dashboard, so it must retain SSR when actually needed. |

The six listed admin extras together estimate 27,059 raw / 8,438 gzip bytes removed from the initial shared graph. This does **not** remove inline AdminParticipants, Review, AdminList or Settings from Portal. Their standalone transformed function sizes are recorded separately in the JSON: AdminParticipants 7,839 raw, Review 7,935, AdminList 6,396, Settings 4,001 and ContentEditor 5,664. Those are gross function sizes, not proven additional savings. Moving them requires a larger component extraction and careful treatment of shared primitives; it is not a small import-only change.

Home's unique closure is Home, Dots, home-motion, DelhiWordmark and its two helpers, OrganizerSection and its helper, and home-geometry. Shared HeadingDot, DotAvatar, avatar contract and event content remain. Individual source/input contributions are recorded in the report. The estimate deliberately excludes installed package savings, because externalizing a local component does not prove which shared icons/runtime modules Next will remove.

## Why Home is a bounded first experiment

The installed Next 16.4.3 lazy-loading guide explicitly supports top-level `next/dynamic` inside a Client Component, conditional rendering, and SSR by default. Portal is already a Client Component. The change belongs there, rather than in the server catchall page, where the guide says dynamic imports of Client Components do not currently provide automatic client splitting. Do not use `ssr: false`.

This changes the loading boundary, not the authorized view, event content, public artwork, fonts, CSS or motion behavior. The next controlled build must confirm that private pages omit the Home chunk, the first Home document includes its complete approved SSR markup, and SSR preloads the needed chunk. Existing synchronous `renderToStaticMarkup` tests need an async React stream awaited through `allReady`; keep every current assertion. Also check cold and client navigation, reduced motion, menu interactions and chunk-load failure behavior. A CSS or typography change is not part of this candidate.

## CSS routing decision

Simply moving global imports from the root layout to the same catchall page or statically imported Portal component does not create different route graphs for Dashboard, Profile and Admin. Their runtime path branch still uses the same compiled entry. A conditional server-side `import('./admin.css')` is not a documented guarantee of the intended per-path stylesheet link behavior, and was not validated here. It should not be treated as a safe quick split.

Documented alternatives are separate filesystem route/layout boundaries, or an actually lazy client feature boundary that owns its CSS. Both need cascade and navigation checks. Installed CSS guidance warns that styles remain after navigation and that import order affects the cascade. Changing `cssChunking` alone does not remove root-imported styles from this shared entry; its `graph` option is Turbopack-only and cannot be used as evidence for the paired webpack result.

The current files are not cleanly separable by filename:

- `team-discovery-experience.css` contains Dashboard layout, team creation and personal-credit rules in addition to discovery. Moving the whole file to Discover would break Dashboard states.
- `projects-rules-experience.css` also covers submissions, including Dashboard's project editor.
- `redesign.css`, shell/navigation/skeleton styles and shared component rules need to stay available to all relevant routes.
- Moving Home CSS together with Home JS is a separate change: its font-face import participates in the existing Dashboard typography. Retain the current root CSS for the first JS experiment.

Standalone minified CSS estimates are in the report, including admin-experience 26,175 raw / 3,958 gzip bytes and admin-credit-batches 10,305 / 2,240. These are gross source estimates, not ready-to-remove compiled bytes. An admin-only CSS boundary may be feasible after selector ownership and cascade order are established, with identical cold, soft-navigation and modal screenshots. It is higher risk than the Home JS split.

## Reproduction and limits

`node scripts/analyze-perf-split-targets.mjs` reads installed Next docs, existing build assets and source, then writes `evidence/perf-target-audit/report.json`. It does not write compiled application output. The report records artifact hashes, module factory sizes, source equivalence, actual measured requests, lightweight estimates and the installed documentation hashes. No causal timing gain is claimed. A coordinated production build and matched browser comparison are still required before accepting an implementation.
