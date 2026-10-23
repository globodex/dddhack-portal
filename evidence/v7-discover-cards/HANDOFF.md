# V7 Discover client evidence

Runtime source `05cd81f2dbecbb20f4ab722b571dd2e6c4f0fe48`; Worker SHA-256 `cc889d6f59c7d263b16f105c9a13578169d16c14921e3523abf0596e2c8f7c09`.

Final run: `05cd81f2-2026-10-23T20-34-21.634Z/report.json`, 33/33 named interactions, zero errors, sandboxed Chromium, one synthetic viewer role, localhost GET/HEAD only, mocked API, fresh disposable synthetic D1 for server-rendered route permission checks. Browser closed. The source-bound Worker fingerprint remained identical before/after.

Checked desktop1440x900, keyboard1440x900 with IntersectionObserver unavailable, and emulated touch390x844. Each mode checked bounded initial24, overflow, profile open/Escape/focus return, page append/dedup, final53/end, search beyond initial page, failed-query Retry, stale-response protection, search debounce, server membership query, and safe off-page hash lookup without appending an unrelated page or reopening after dismissal/refresh.

Touch scroll used explicit CDP touchStart/Move/End, not DOM scrolling for the final approach to the pagination sentinel. The two gestures moved scrollY4938→5473 while page size24→48 and10582→11117 while48→53. The runner first positions400px before the bottom to avoid thousands of preliminary swipes; the actual trigger was touch scrolling. This is emulation, not physical-device evidence.

Final actual viewport screenshots are `desktop-people.png`, `keyboard-people.png`, and `touch-people.png` in the final run directory. Desktop and touch originals were opened and visually reviewed: three desktop columns, one mobile column, intact labels/avatar/social controls and no observed horizontal overflow. This extends the existing Discover identity treatment into the user-requested people cards; it is not a newly accepted visual target. These images predate the separate full-screen hamburger-menu integration.

Earlier harness outcomes are retained: `05cd81f2/report.json` and `touch-gesture-failure/report.json` contain22 passed desktop/keyboard checks plus3 passed touch checks followed by a touch synthesizeScrollGesture timeout. Replacing that harness gesture with explicit touch events passed11/11 in `05cd81f2-2026-10-23T20-33-46.466Z/report.json`, followed by the final combined33/33 run. An initial empty-preview dispatch503 produced0 completed checks before the preview was corrected; no portal behavior fix was needed for either harness issue.

Unit/static scope:24/24 matching tests passed plus TypeScript. Production build/artifact review passed185 files. Backend real pagination/privacy and combined durable-flow verification are owned by integration/testing lanes. Client mock behavior does not prove real server pagination, hosted capacity, managed login completion, every role/control, or production writes. No public Site, real identity, external link, real AI provider, secret or durable browser mutation was exercised.
