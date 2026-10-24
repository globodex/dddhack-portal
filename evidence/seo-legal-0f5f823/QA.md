# Legal pages and SEO evidence

Displayed source: `0f5f8236bcc30c3d6a6a5960eb2f24154ed89d19`.

The integrated repository was at documentation-only revision `09682b5c34e029a49ebd873bb4786083819e8abe` during capture. The harness verified that `app`, `lib`, `neon` and `next.config.ts` matched the displayed source and had no uncommitted changes. Screenshots use the existing local development server and disposable synthetic backend. No production mutation, provider change or deployment occurred.

## Rendered review

All 20 original PNGs were opened and visually inspected. Both legal pages retain server-rendered text, the shared warm paper/ink palette, a clear draft label, readable headings and natural document scrolling. No clipping or horizontal overflow was observed at any viewport. The 44px black menu button and Lucide destinations are visible; all five destinations fit the short mobile menu. The retention screenshot visibly distinguishes the 90-day private-data policy, manual review, public showcase retention and separate indefinite owner logs.

| Page/state | Desktop 1440×900                                                                  | Mobile 390×844                                                                  | Short mobile 390×480                                                            |
| ---------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Privacy    | [Viewport](privacy-1440x900-viewport.png), [full page](privacy-1440x900-full.png) | [Viewport](privacy-390x844-viewport.png), [full page](privacy-390x844-full.png) | [Viewport](privacy-390x480-viewport.png), [full page](privacy-390x480-full.png) |
| Terms      | [Viewport](terms-1440x900-viewport.png), [full page](terms-1440x900-full.png)     | [Viewport](terms-390x844-viewport.png), [full page](terms-390x844-full.png)     | [Viewport](terms-390x480-viewport.png), [full page](terms-390x480-full.png)     |
| Menu       | [Desktop](privacy-1440x900-menu.png)                                              | [Mobile](privacy-390x844-menu.png)                                              | [Short mobile](privacy-390x480-menu.png)                                        |

Tablet 768×1024: [privacy viewport](privacy-768x1024-viewport.png), [privacy full page](privacy-768x1024-full.png), [terms viewport](terms-768x1024-viewport.png), [terms full page](terms-768x1024-full.png). Additional [mobile retention detail](privacy-390x844-retention.png).

## Checks

The [machine report](report.json) records 19 passing browser/HTTP checks, four Axe scans with zero reported violations and no browser/console errors. Menus passed keyboard opening, Escape, browser Back, focus return, touch open/close and geometry checks. Legal-page and menu use issued zero session/API requests. All browser contexts closed after capture; this lane started no extra frontend server.

Googlebot HTTP checks found semantic draft text and `noindex, nofollow` on `/privacy` and `/terms`, with configured local canonicals and no public Open Graph metadata. Auth, profile, dashboard, participant/team directories and admin settings remained noindex without tested private fixture fields. A missing public project returned 404 and noindex. The anonymous private API returned 401, `X-Robots-Tag: noindex, nofollow` and `Cache-Control: private, no-store, max-age=0`.

The sitemap contained exactly 28 fixture URLs: home plus 27 eligible published project detail paths. It excluded legal drafts, directories, `/projects`, `/leaderboard` and private pages. Robots permits HTML crawling so noindex can be read, blocks general API crawling and permits permission-filtered public project media.

Thirteen focused source tests and typecheck passed before integration. Those checks cover configured production-origin behavior, metadata projection, published-project filtering, sitemap pagination/failure, robots, event facts and the confirmed active Cloudflare proxy. The browser harness is [scripts/qa-seo-legal.mjs](../../scripts/qa-seo-legal.mjs).

## Limits and publication review

These are local synthetic-fixture checks in container Chromium with emulated touch, not physical-device, production-login or performance measurements. Native Library upload is unavailable to the parent because its upload returned HTTP 401; these original PNGs remain accessible repository evidence.

Both legal pages remain explicit drafts and noindex. Organizer review is still needed for exceptional retained records, processing locations, deployment analytics, backups/provider log retention, school-age/guardian policy, cancellation/refunds, jurisdiction and dispute handling. Already stored event policy needs owner review/publication through the existing workflow. The 90-day unnecessary-private-data policy is a manual organizer process; no automatic purge, provider erasure, response deadline or compliance guarantee is claimed. The separate owner-only audit-log policy remains indefinite.
