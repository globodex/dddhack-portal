# Desktop chapter viewport restoration and larger co-partner logo

Source: `2f124a874730ccff3aafe0fee34a9ee427b2a33c`, based on published source `0aa85b55840dc26b2e9306e48fd592e83eae054c`. This change concerns Schedule, Venue, Rules and FAQ. The overall hero markup, title/art/layout, mobile geometry helper and organizers are unchanged. The separately authorized co-partner logo grows from 26px to 50px image height, preserving its actual 360×159 aspect ratio and existing local asset.

The anonymous live before captures reproduce the problem at 1440×900, 1847×1023 and 1920×1080: a 1400px chapter container, 60px headings, and explicit compact overrides make pending Schedule and Venue ordinary-flow panels about 316px and 274px tall. At 1847px their actual card width is about 1312px. The fix uses viewport gutters instead of a fixed content cap and restores full viewport stages for all four chapters. Desktop headings become 82px at 1440px and 96px at the larger sizes. At 1847×1023, Schedule becomes about 1721px wide and 905px tall; Venue is 891px tall.

CSS reserves the desktop stage before JavaScript. Actual no-JavaScript and hydrated chapter heights match within 1px at all three desktop viewports. This avoids the specific compact-to-full-height change; it is not a complete CLS measurement or speed claim. Native sticky positioning handles progression without a scroll listener or scroll hijacking. An oversized published agenda or expanded FAQ retains its natural height and scrolls fully before bottom pinning. Short screens, reduced motion and pause keep ordinary readable flow.

Validation:

- 12 focused Home, desktop/mobile geometry and organizer unit tests passed.
- 52 accepted geometry/interaction browser checks passed: six accepted checks from `verified/report.json` and all 46 checks in `verified-resume/report.json`. Actual desktop full-width stages, SSR height parity, native overlap, expanded FAQ focus, short/reduced fallbacks, mobile390/320 behavior and touch CTA navigation are covered.
- Three accepted pointer/pause checks in `motion-report.json` plus both scoped checks in `motion-report-scoped.json` passed, bringing the accepted browser count to 57. All page-error arrays are empty.
- Every row of a temporary six-row synthetic published agenda is readable and hittable at 1440×900 and 1847×1023. Only the owned temporary SQLite fixture changed; its original absent content row was restored and read back as absent.
- At 390×844, the 50px logo leaves the CTA at 681–739px, with about 105px of visible settling area below it. At 768×1024, the CTA remains visible at 867–925px. At 320×480, natural scrolling exposes an unobstructed 58px touch CTA and the complete settling pile. Touching the CTA reaches the existing sign-in return path without sending authentication.
- Settled hero images wait 2.2 seconds after the relevant scene enters view. Desktop and mobile title, Delhi artwork, static Metro, controls, original expressions and organizer assets remain intact. The existing logo file is unchanged and no dependency or image request was added.

Native before/after screenshots:

- [Live before, 1847×1023](before-live/1847x1023-schedule.png)
- [Local after, 1847×1023](verified-resume/1847x1023-schedule.png)
- [Local after, 1440×900](verified/1440x900-schedule.png)
- [Local after, 1920×1080](verified-resume/1920x1080-schedule.png)
- [Larger logo on desktop](verified-final/1440x900-hero-larger-logo.png)
- [Larger logo on mobile](verified-final/390x844-hero-larger-logo.png)
- [Short mobile CTA and settled dots](verified-final-supplement/320x480-CTA-reachable.png)
- [Long agenda last row](verified-resume/1847x1023-long-agenda-row-6.png)

Selected actual pixels were viewed, including the matching live/after desktop frames, no-JavaScript full-height frame, larger logos, short-mobile settled pile, long agenda and expanded FAQ focus. All native PNGs are preserved separately with hashes and dimensions.

Evidence limits and corrected harness receipts: Library read returned metadata/OCR for the 1847×1023 attachment, but no locally materialized pixels; the earlier export 401 was not retried. This lane inspected equivalent actual live-page pixels. Chromium's initial live inspection hit its container certificate-trust error; system curl validated HTTPS and returned 200. The anonymous visual-only browser retry relaxed certificate checking for that context, with GET/HEAD-only routing and no cookies or credentials. No app, provider or system trust setting changed. Local captures use normal local HTTP.

The initial FAQ guard rejected 0.46875px of outer control-edge clipping. The targeted receipt proves its text is fully visible at 857–883px, and its complete 44px center is visible and hittable; no app fix was warranted. A supplemental global `.hero-dots` query included the eight organizer dots and caused a false offscreen result. The corrected `.home-hero` query proves the eight hero transforms stop while its bottom is 2642px above the viewport. Both original receipts remain preserved and excluded from accepted-check counts. Early local after captures occurred before the source commit; the unchanged application patch is bound to 2f in `verification.json`. Final verified captures identify 2f directly.

All browser contexts and owned Next 3010/backend 8855 processes are stopped; both listeners are verified closed. No pushes, hosted writes, migration, provider configuration or deployment occurred in this lane. Root owns final integration/typecheck/build and publication onto its current main, preserving the independent Windows repair.
