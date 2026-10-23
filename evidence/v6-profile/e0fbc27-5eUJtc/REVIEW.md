# Matching profile QA, source e0fbc27

Compiled source: `e0fbc27c87449ff499427589108b201ab7829365`. Worker SHA-256 before and after: `cd37903033f7f01ca7bb19aa6c33c79fcdf0552727b434b7bf26b76949f54241`.

The root-confirmed rich/mockup-review preview ran on `http://127.0.0.1:4173` with disposable synthetic D1 and `fake_alice`. Official sandboxed Chromium exercised the compiled artifact. No build or load run overlapped QA. Root/Dashboard read-only browser work could run concurrently. All browser contexts and the browser closed cleanly.

## Result

63 automated checks passed. There were 23 original captures, zero recorded defects, zero page errors, zero external/blocked requests and zero writes. Save was intentionally omitted to retain the shared fixture; earlier synthetic Save-to-Teams evidence remains separately recorded. This pass verifies the latest rendering and profile interactions, rather than repeating that mutation.

All three steps at 390x844 fit without internal field scrolling: the field region was 602px and the primary action footer ended at y826. The heading/dot group center difference was 0px. Eight small palette circles retained 44px targets in one row; at 320px they wrapped safely into two rows. Tests also covered 1440x900, 320x640, 834x1194, 390x500, and desktop 200% reflow equivalence through a 720x450 CSS viewport at pixel density 2. This reflow context does not assert that browser-chrome zoom was operated.

Checks exercised all eight expression/color choices independently, five aligned social rows, platform selection, target-only removal, Back/Next value retention, a single active step, focus movement, verified Luma options, required fields, no horizontal overflow, unclipped visible form controls, and safe field/action access on short screens. The Find organization ID link is included in focus reachability checks.

## Clean delivery originals

These original viewport captures were taken before avatar or form-value edits, preserving the blue/squeezed default and actual synthetic fixture values:

- `reference-desktop-step1-original--alice--1440x900--e0fbc27.png`
- `reference-mobile-step1-original--alice--390x844--e0fbc27.png`
- `reference-mobile-step2-original--alice--390x844--e0fbc27.png`
- `reference-mobile-step3-original--alice--390x844--e0fbc27.png`

All four were opened directly beside the exact selected target `/home/param302/Dev/DDEHack-portal/design-research/2026-10-23/main-pages-v3/01-profile-three-steps.png` in the same image comparison input. The standalone rounded desktop surface/pale canvas, single brand, blue progress/count, dot-left Profile title, fields/picker split, multicolor expression previews, quiet divider, filled green Sex segments and black actions now follow that target's hierarchy. The previously reported incomplete canvas, clipped selected ring and extra gray strip above Sex controls are visibly corrected. No new layout defect was identified in this scoped comparison.

Fixture names, email, selected Sex, social prefills and empty optional fields remain the actual synthetic values. Explicit source corrections were retained: no duplicate desktop logo, no generated Step-1 back action, no extra country-selector field, and unchanged approved fields and palette.

Narrow step one, short Contact and tablet step one were also opened. Exactly seven actual images are flagged `inspected:true` in `report.json`; the remaining captures retain `inspected:false`. Images were not edited, stitched, uploaded or marked user-accepted. Root owns screenshot delivery, the single release ledger and final whole-site acceptance.
