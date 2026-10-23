# Actual Home browser diagnostics, source 34d69955

- Served source: `34d69955f9c45031c927dd19a75c18446536714e`.
- Compiled Worker SHA-256: `30aa2b2cdea7f6b5c031b187dbb5e2faa538dd8a6b9709b2e166ea3366013f62`, unchanged before/after.
- Artifact checkout: `../visual-integration`; local synthetic preview `http://127.0.0.1:4173`.
- Official Playwright 1.64.1, Chromium 156.0.8078.4, `chromiumSandbox:true`, loopback GET/HEAD only, external/mutation requests blocked. No requests needed blocking; no page errors. Ordinary sandbox launch failed before a page; the same sandboxed browser then ran through supported escalation. Browser closed after both diagnostic runs.
- Seven viewports: 1440x900, 1733x963, 1194x834, 834x1194, 390x844, 320x740, 844x390. Additional cold reduced phone.
- 49 original visible-viewport PNGs, zero uploads. They are neither stitched nor full-element exports. All seven hero originals plus eleven menu/lower-section originals were visually opened (18 total), listed in `report.json`. Existing lower sections are diagnostics, not acceptance of the parent’s pending new design.

## Measured checks

100 checks: 96 passed, four failed for the actual first-fold fit defect. Exact date, no Register underline, actual ArrowRight, eight cluster dots/five diameter tiers, eighteen strip dots, mobile portrait strip hiding, hero strip containment, CTA/control clearance, compact sticky header/menu open/close, multi-dot pointer response, pause/offscreen/reduced transforms and responsive resize passed. All seven full entrance traces contain negative-to-home falling motion. The first/last-only entrance assertion initially gave false failures because both ends can be home; the corrected min/max assertion uses the retained complete trace, with the original result preserved in each check.

Real failures:

| Viewport | Header height | Hero bottom | Viewport bottom |
| --- | ---: | ---: | ---: |
| 1440x900 | 92.19 | 1013.33 | 900 |
| 1733x963 | 92.19 | 1101.78 | 963 |
| 1194x834 | 77.19 | 874.27 | 834 |
| 834x1194 | 77.00 | 1265.50 | 1194 |

Bottom circles are absent or mostly below the initial viewport at these approved sizes. No horizontal spill or CTA collision was observed. Short/narrow screens allow normal scrolling.

Existing lower diagnostics show four Rules entries and square organizer portraits, which do not implement the pending new variant. Mobile organizer scroll alignment can place the heading partly behind sticky navigation. Background visibility suspension was not separately exercised; actual offscreen, pause and reduced-motion behavior was checked. This is no hosted performance/capacity or real sign-in proof.

## Isolated fit correction

Source commit `9569a54` changes hero/navbar CSS only. Sticky header owns 80px desktop/64px compact layout space; hero uses remaining viewport with bounded desktop type/artwork width and a smaller tablet cluster. Short screens remain scrollable.

`hero-fit-candidate.json` records a temporary CSS-injection measurement, explicitly **not final-source acceptance**: complete hero/strip fit exactly at all four standard desktop/tablet sizes and 390x844, with CTA clearance and no horizontal overflow. 320x740 and 844x390 grow safely. Matching rebuilt-source captures remain required. `scripts/qa-v6-home.mjs` accepts HOME_QA_SOURCE/HOME_QA_WORKER for the coordinated follow-up and records failures without claiming acceptance.
