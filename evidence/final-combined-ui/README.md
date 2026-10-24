# Combined actual Next UI verification

Baseline capture source: `34236a144eb90837310e305274d5b2a6b518c30e`. This is an isolated Next16.4.3 webpack development runtime on localhost3018 and a separate synthetic backend on8867. `fixture.json` records a fresh seedLocal+seedRichVisual SQLite fixture with17fake users,3teams,2projects,5committed versions and21non-redeemable inventory rows. No environment credentials or production records were copied.

The first24 chosen native PNGs in `report.json` were captured and actually viewed: desktop1440×900 and mobile390×844 People/Teams/member dialog, public project list/detail/Share, admin submissions/private project detail/Teams action menu, dashboard project toolbar and inline history. Targeted320×480 frames cover People, current team members, private project detail and Share. Header avatar appears before hamburger on every route. No horizontal overflow, outer modal clipping, browser page errors or POSTs were observed. All320rating targets remain at least44CSSpixels.

Verified interactions include actual People search, three safe current team member identities without contact values, Escape returning focus, actual local project URL clipboard copy, Share Escape/browser Back and focus restoration, admin Rename/Add menu controls, and touch/Enter opening current and previous committed submissions with one bounded history GET. Native inline history is intentionally not a modal.

The original People no-bio cards show excess fixed-height space. Root identified this actual visual defect and owns the scoped compact-card CSS correction; these three People frames are baseline evidence and will be superseded by a separate source-bound refresh. No app source was changed in this QA worktree.

Two stopped harness attempts are preserved honestly. Attempt1 searched for the legacy history-modal trigger rather than the current inline summaries. Supplement corrected that, then incorrectly expected the stock region's accessible name on its child table. The actual stock table already rendered correctly with fake values. `FAILED-current-ui.png` is a harness diagnostic, not accepted final imagery or an application failure. Those stock Copy/menu checks were pending at that checkpoint and are closed by the final supplement below. Development StrictMode recorded two requests for the same bounded stock page on explicit expansion; there was no initial inventory-page request or polling. No production request-count or timing claim follows from this development run.

`report.json` includes source/tree/input hashes, payload byte counts and hashes from explicitly labeled read-only QA probes, actual geometry, requests and unmodified browser error arrays. The probes are separate from normal UI requests. Root owns the production build/full test suite.

Live AI evaluation, result freeze or public reveals were not performed. The fixture has no real configured provider or frozen score stage, so no AI/final visual state is invented. Those missing states are a stated coverage limit, not evidence that user scoring policy should be changed. All browser mutation requests were blocked. No push, merge to main, hosted write, deploy or provider operation occurred.

## Completed compact refresh and final checks

Final refresh source is local merge `53479587bc70fe718344066d1b7678f180a36356`, whose app/lib/neon/package files match root `a57b229b8214d148c6fa197c0d7e2bcde639ddb9` exactly. The isolated backend was restarted on that source before the refresh. `final-manifest.json` is the authoritative selection of25 viewed images and maps each image to its actual baseline or refreshed source, with byte hashes. Three `people-compact-*` images replace the older People images in the chosen set. No-bio cards now measure176px at1440/390 and natural190px at320; no overflow was introduced. The other21 baseline views retain their original342 source attribution.

Final checks passed: actual320touch scrolling within the team sheet reaches the last72px member link, which passes visibility/hit testing; background scroll remains unchanged. Admin stock has no initial mapping request and fetches only a bounded page on explicit expansion. Actual fake-code clipboard copy succeeds. Two identical page0 requests are observed under development StrictMode, with an aborted mount request recorded. The mobile menu's Logout color is `rgb(177,45,38)`; Escape returns focus to the hamburger, Logout opens its confirmation and Cancel sends no POST. Browser page/console error arrays and blocked POST arrays are empty.

The all-codes table screenshot is preserved as `admin-credit-stock-allcodes-desktop1440.png`. The chosen stock frame uses the Assigned filter so the actual fake recipient/email/value/time/status mapping is visible, with explicit clipboard verification. Raw first locator attempts are retained separately; they targeted the table's enclosing region name and a recipient display name where the actual Copy accessible name uses its email. These are harness corrections and did not cause server writes.

Source, dependency, compiled Next runtime and stylesheet hashes are recorded in the final manifest. This verifies the actual combined development render; it does not establish production frontend timing. Root retains ownership of production build/full-suite results and any later selected-profile-only presentation change.

All browser contexts and owned3018/8867 processes were closed. `cleanup.json` records the final empty-listener check and unchanged domain row counts from a read-only SQLite connection.

## Stock alignment correction

Root's final pixel review found a genuine14px downward offset in the stock status select that the initial review missed. The inherited `app/style.css` label margin was14px0. Root fixed this with the narrow direct-label `margin:0` override in `41de32b`, consumed locally as `787e983e3168bfcbd27021cf30c5233a1ccc9c24`. This is CSS only and changes no API or domain data.

The final accepted stock views are `stock-aligned-1440x900.png` and `stock-aligned-390x844.png`; both were actually viewed after the fix. Earlier stock frames remain useful functional evidence, but are superseded for appearance. `final-manifest.json` replaces its chosen desktop stock frame and identifies the additional mobile correction separately.

Computed verification: desktop input, Search button, label and select all have top633.09375,bottom681.09375,height48. Mobile input/Search have top661.390625,bottom709.390625; select/label have top721.390625,bottom769.390625, exactly the12px grid gap with no inherited margin. All controls are48px high; the label has no padding or margin. No horizontal overflow occurs.

After waiting for the actual stock `aria-busy=false` state, keyboard Tab follows input→Search→status and touch Search works at both sizes. Search is intentionally disabled while the matching-geometry loading table is present, so the earlier premature focus assertion was a harness error. A further optional exact mobile-cell-name assertion included a CSS data-label prefix and was removed from the bounded alignment test. Attempts are preserved in separate reports. Final alignment report passes with zero page errors and zero POSTs. All reopened3018/8867 runtime and browser processes were stopped again after verification.
