# Profile browser diagnostics, source 34d6995

These runs exercised the compiled source `34d69955f9c45031c927dd19a75c18446536714e`, Worker SHA-256 `30aa2b2cdea7f6b5c031b187dbb5e2faa538dd8a6b9709b2e166ea3366013f62`. The Worker hash remained unchanged. Sandboxed Chromium used the official approved `/tmp` installation and the coordinated loopback preview on port 4173. Browser contexts blocked every external origin and non-allowlisted mutation.

The first launch in the normal executor sandbox failed during Chromium process initialization before any browser request. Supported escalation then ran the same sandboxed browser. No `--no-sandbox` or other sandbox bypass was used.

## Actual checks

- `34d6995-5qFfNp/report.json`: 20 successful checks and 13 original screenshots. A strict social-row alignment assertion stopped each viewport at Contact. One explicitly authorized synthetic `fake_alice` profile save succeeded and navigated directly to `/teams`, without a confirmation dialog or fourth review step. No real participant data was used.
- `34d6995-Mx1uog/report.json`: a diagnostic rerun recorded that alignment defect and continued through every step. It has 55 successful checks, 19 original screenshots, six viewport instances of the same alignment defect, no page errors, no blocked requests and no writes. This is not a passing release result.
- Both browsers closed cleanly. No builds or load runs overlapped these coordinated browser runs. Other root/admin read-only browser checks could run concurrently.

Viewports: 1440x900, 390x844, 320x640, 834x1194, 390x500, and a 720x450 CSS viewport at pixel density 2 to cover desktop 200% reflow equivalence. The latter is not a claim that browser-chrome zoom was exercised.

All three steps fit at 390x844 without internal field scrolling: 552px field region, primary footer bottom 805px. Heading/title-dot center differences were at most 0.008px. Eight 18px palette circles retained 44px targets and shared one row at width 390; width 320 wrapped into two rows. Back/Next retained selected color/expression, basics and five edited social URLs. Removing the third social row preserved the other four. Narrow/short/reflow contexts retained safe field scrolling and reachable actions. About-you retained six verified Luma choices and Save.

## Confirmed correction

Social-row controls were genuinely unequal: the native platform selector and trash button measured 44px high, while the URL input measured 48px. For the first desktop row their top coordinates were 283px, 281px and 283px respectively. The URL's computed minimum height was 48px and vertical padding 12px, inherited from a more specific shared `.main` input selector. The scoped profile input selector now includes `label >` so its intended 44px height and 10px padding win without affecting other forms. Matching rebuilt-browser verification remains required.

Opening the original tablet step-one image also showed the Sex legend at the lower scroller edge despite ample vertical viewport space. The existing 700px profile card constrained the stacked tablet form. The tablet breakpoint now permits up to 820px, bounded by the dynamic viewport; mobile and short-screen rules retain their separate safe-scrolling bounds. This also requires a matching rebuilt capture.

The runner now retains exact tag/height/min-height/padding geometry and continues other checks after social alignment defects. Its next-run focus checks also include the Find ID link, in addition to form fields.

## Visual inspection scope

Eleven original screenshots were opened, with `inspected:true` recorded on those entries only: first-run mobile step one, mobile Contact failure, desktop Contact failure and saved Teams; second-run mobile Contact/About, narrow step one, short About, desktop reflow About, desktop step one and tablet step one. No image was stitched, edited, uploaded or marked user-accepted. Unopened captures are explicitly left `inspected:false`. The source mock and strict written correction specification remain the comparison targets; there is no full-site visual acceptance claim.

The single release-status ledger remains `docs/RELEASE-STATE.md`, owned by root. These are diagnostic receipts only.
