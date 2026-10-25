# Shared portal width and mobile hero spacing

Implementation source: `ef6ec891a814b929f48889605ef0afb6f61a76c4`, detached from `59ddf2b9146117bc76e561c402c62a9e93392afd`.

The unified header had removed the sidebar markup and margin, but the old shell and page maximum widths remained. At a 1920 × 1080 browser viewport, the header measured 1905px while workspace main stopped at 1440px, Discover at 1120px and admin content at 1180px. Public main was centered in a 1440px frame. This left a visibly unused canvas. The supplied private 1195 × 1007 screenshot was materialized using the current Library workflow and viewed internally. Its exact one-column arrangement was not reproduced at 100% zoom on this source, so this receipt does not invent its browser zoom or runtime version.

The shared unified-navigation stylesheet now makes the non-Home, non-onboarding main fill the header canvas and removes collection-level caps from Discover, admin and Rules. Existing gutters remain. At 1600px and above, team grids use three columns and People four; smaller existing breakpoints remain. Form and prose measures remain component-owned, including 1080px profile and 960px project editor maxima; Rules paragraphs keep 75ch.

The compact Home grid still reserved a minimum 144px empty row for the removed upper expressions. That row is now a 24–64px responsive gap; the released height goes to the separate lower dot stage. The 390 × 844 anonymous actions moved from y 677 to 530.5 in the synthetic rehearsal, whose banner adds 46px. At 320 × 480 they moved from y 589.8 to 469.8; short screens retain natural scrolling. The two real CTA destinations, bottom expressions, safe-area padding and pointer access remain. This rule applies only below 1000px; no desktop hero selector changed.

| Surface                      | Before | After                           |
| ---------------------------- | ------ | ------------------------------- |
| 1920px workspace main        | 1440px | 1905px, same as header          |
| 1920px Discover              | 1120px | 1801px, 52px gutters            |
| 1440px admin content         | 1180px | 1330px, existing 47.5px gutters |
| 1920px public main           | 1440px | 1905px                          |
| 390px mobile actions top     | 677px  | 530.5px                         |
| 390px lower expression stage | 168px  | 314.5px                         |

Verification: 11 relevant unit/SSR tests pass and TypeScript passes. The read-only browser matrix passes 105 checks; a focused supplement passes 6 more, including actual editor opening, the final member in a short scrolling modal, normal-motion lower expressions and native browser 200% zoom. At native zoom, outer 1440 × 900 becomes inner 720 × 378, DPR 2, visualViewport.scale 1; main and header both measure 712.5px with no horizontal overflow. This is native browser zoom, not CSS zoom.

The browser used a fresh, separate synthetic fixture, GET/HEAD only, on localhost:3025 and backend:8875. No mutations, hosted calls, auth sends or real records were used. 41 final PNGs and 9 before PNGs were opened and inspected. Evidence stays outside Git at `/tmp/ddd-shared-width/`, with exact dimensions, hashes, source and coverage in `manifest.json`. The legacy `/submission` route aliases Dashboard; editor measure was checked by the real Project tab then Update project controls in the supplement. The initial null-editor harness error is preserved in `rejected-null-editor-harness-report.json`, rather than reported as a product failure.

Before Projects frames had missing images because the initial fixture harness omitted the existing image GET handler. That local harness was corrected to call the real publicProjectImage function for final captures. Loaded logos are not a CSS change. Final captures had no failed HTTP responses.

Reproduce with the fresh synthetic backend running, then `node tests/browser/shared-width.mjs` and `node tests/browser/shared-width-supplement.mjs`. Output defaults to `/tmp/ddd-shared-width/`. All browser contexts and owned preview listeners were closed after QA. Generated Next declarations were restored. No screenshot, private reference, ZIP, provider change, deployment or push is included.

Delivery limitation: the current prepared Library batch helper received HTTP 401 at its hosted tools-list request before any preparation, upload or finalization. No Library IDs were created, and the operation was not retried or switched to another route. The original screenshots remain intact. The private reference was never included in the delivery batch.
