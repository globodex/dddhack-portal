# Final development diagnostics and loading evidence

Numerical source `405387286eee7a5a8b1034af6cf5df81369766ef` is runtime-identical to root `2657f26254ed323ca84a167a2f220f05f4ec7cbf`. This lane changes evidence only. This is a **development Webpack diagnostic**, not the separately requested production performance gate or a hosted speed claim.

[Raw final report](report.json), [comparison](comparison.json), [method](methodology.json), and the unchanged `scripts/measure-redesign-browser.mjs` retain all 28 samples: seven routes, three fresh-cache-disabled desktop contexts and one mobile context per route. The original before source is `696b125f9711a4fd6e02c3ece3adadb18b83cba7`, report `evidence/redesign-rich-before/report.json`. The earlier `evidence/final-performance` report at ae2b027 is historical. Final timing waited until all parent builds/tests/browser jobs stopped. The server was warm from required loading captures; baseline's first Dashboard compile outlier is retained.

## Results

Desktop medians, three observations per route. Bytes include completed browser responses at the sampling point. Timing is milliseconds.

| Route | Requests before/after | Bytes before/after | Change | TTFB before/after | FCP before/after |
|---|---:|---:|---:|---:|---:|
| Dashboard | 15 / 16 | 4,108,767 / 4,259,383 | +3.67% | 299.6 / 551.4 | 688 / 1,624 |
| People | 14 / 13 | 4,119,819 / 4,240,643 | +2.93% | 460.1 / 272.0 | 1,188 / 848 |
| Teams | 12 / 11 | 4,117,204 / 4,238,070 | +2.94% | 368.5 / 274.5 | 824 / 728 |
| Admin participants | 11 / 11 | 4,104,302 / 4,244,606 | +3.42% | 404.9 / 595.7 | 1,188 / 1,132 |
| Admin teams | 12 / 12 | 4,121,121 / 4,257,019 | +3.30% | 1,162.4 / 372.0 | 2,080 / 1,144 |
| Admin submissions | 11 / 11 | 4,104,275 / 4,239,731 | +3.30% | 815.6 / 443.2 | 1,644 / 1,664 |
| Settings | 12 / 12 | 4,107,017 / 4,242,908 | +3.31% | 535.8 / 395.4 | 1,540 / 976 |

All28 HTTP responses200; zero initial browser API requests, page errors, blocked external/mutation requests or horizontal overflows. All20 original final PNGs were viewed. Tall directories/tables were additionally read at native top/bottom crop scale. Dashboard's additional request is DM Sans900 (14,595 encoded bytes). Timing is mixed: Dashboard TTFB/FCP increased and admin participant TTFB increased. This evidence does **not** establish a general speed improvement, production capacity, field Core Web Vitals or hosted latency. Mobile has one observation per route, no useful percentile. Admin participants changed from an empty default filter to All44, so DOM240→3054 compares different displayed content. Request arrays can include later screenshot/tab navigation events; numeric totals are fixed at the sampling point.

[Production asset inventory](production-assets.json) was copied from the parent's successful final default Turbopack build:14JS files985,688 raw /297,122 gzip; CSS339,079 raw /55,752 gzip. These are **all-route build inventory**, not per-visitor transfer; gzip is an estimate. Production timing remains a separate pending gate.

## Actual pending-state screenshots

`capture-loading.mjs` activates existing prefetch=false navigation links and delays only the existing destination RSC GET, then captures the actual RouteSkeleton inside the stable shell. No DOM replacement, app-style injection, extra API request or mutation. The accepted nine-frame set is:

- Studio desktop: [1440](https://github.com/Param302/dddhack-portal/blob/bddb869f3209adcb6cc4ea6161014d51f340cd96/evidence/final-performance-current/loading/studio-1440x900.png).
- Studio corrected mobile: [390](https://github.com/Param302/dddhack-portal/blob/bddb869f3209adcb6cc4ea6161014d51f340cd96/evidence/final-performance-current/loading-studio-final/studio-390x844.png), [320 short](https://github.com/Param302/dddhack-portal/blob/bddb869f3209adcb6cc4ea6161014d51f340cd96/evidence/final-performance-current/loading-studio-final/studio-320x480.png).
- Stock inventory: [1440](https://github.com/Param302/dddhack-portal/blob/bddb869f3209adcb6cc4ea6161014d51f340cd96/evidence/final-performance-current/loading/inventory-1440x900.png), [390](https://github.com/Param302/dddhack-portal/blob/bddb869f3209adcb6cc4ea6161014d51f340cd96/evidence/final-performance-current/loading/inventory-390x844.png), [320 short](https://github.com/Param302/dddhack-portal/blob/bddb869f3209adcb6cc4ea6161014d51f340cd96/evidence/final-performance-current/loading/inventory-320x480.png).
- Personal credits: [1440](https://github.com/Param302/dddhack-portal/blob/bddb869f3209adcb6cc4ea6161014d51f340cd96/evidence/final-performance-current/loading/personal-1440x900.png), [390](https://github.com/Param302/dddhack-portal/blob/bddb869f3209adcb6cc4ea6161014d51f340cd96/evidence/final-performance-current/loading/personal-390x844.png), [320 short](https://github.com/Param302/dddhack-portal/blob/bddb869f3209adcb6cc4ea6161014d51f340cd96/evidence/final-performance-current/loading/personal-320x480.png).

All accepted frames were viewed. Seven unchanged frames bind f7c8620 (root venue CSS5b926d2); the two final Studio frames bind4053872/root2657. Later changes affect only Studio placeholder tabs, so other seven frames remain valid. Origin sidebar context stays during the pending transition. Actual skeleton geometry now follows the Studio header/roster/60:40 idea and Next panels, inventory counters and dedicated personal credit card. Each navigation held one RSC GET and no API request.

Historical evidence remains intact: `loading-gate-harness-attempt` used a full-document Workspace anchor so the RSC waiter never fired (harness error, no app bug). `loading` retains two superseded wrapped Studio mobile frames. `loading-studio-nowrap-overflow` and `loading-studio-overflow-pixels` preserve the first nowrap fix's real320px regression,342px document width. Root2657 made tab blocks flexible; final320/390 frames have one row, no clipping or overflow.

## Private arrival card

`pre-venue-fix` preserves the complete original ba95728-sample run and20screenshots. Pixel review exposed the private arrival description compressed into single-character lines, despite the horizontal overflow assertion passing. Root5b926d2 fixed only the mobile arrival grid. [Venue report](venue/report.json) and five viewed originals cover320,390,390short,768 and actual native200% Chrome zoom (outer1440,CSS720,DPR2,visualViewport.scale1; CDP PNG1440×757). Directions remain readable and Maps target44px high. Later placeholder-only changes do not alter this card.

## Fixture integrity and cleanup

The preserved synthetic backend8789 was never seeded, migrated or modified. No HTTP mutation, credential/provider setting, production data or source application edit was attempted. Read-only64-table logical hashes in [before](fixture-before.json) and [after](fixture-after.json) match exactly: `bf01ef3f41c8ffced1c2d7d9109a3c4f43de014427c8da40d672e946cbd06d45`. The intermediate after hash also matches. This is schema plus ordered content verification, not a WAL checkpoint. Synthetic actors, local fixture banner, old fixture dates and solid green fixture project artwork are intentional; they are not proposed production content.

All capture browsers are closed and the isolated3004 frontend was stopped. Original8789 remains untouched/running under its owner. Root-owned full-suite/build results are recorded separately; this lane adds no implementation-mirroring tests. Native Library upload was previously unavailable; original PNGs are preserved as accessible repository evidence.
