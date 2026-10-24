# Mobile landing stack and Cerebras co-partner

Application source: `7fe857b5e063f81b6883240be162c85e9851ae88`. Before source: `212b1cc2dc1ffde574a5bc5d8ebf51929a879f5a`. All captures are actual local Next.js renders against an owned synthetic SQLite fixture. No hosted state changed.

The before screenshots confirm that mobile stacking was absent. `stackGeometry` required a width of at least 768px, and the mobile CSS forced every chapter to `position:relative`. At 390px, all four cards had `data-enhanced=false`; their natural heights were 319.39px Schedule, 265.38px Venue, 711px Rules and 620.17px FAQ. The sticky header was 64px tall.

The agreed interaction uses native CSS sticky positioning, with no scroll listener or scroll hijacking. Normal-height mobile cards pin at header+14/22/30/38px. A taller card uses `min(layerOffset, viewportHeight-cardHeight-16px)`, so all of its content can pass naturally before its bottom pins. Content height is never clipped or shrunk. The existing ResizeObserver remeasures expanded FAQ content. Reduced motion, pause and very small available viewports retain ordinary document scrolling. The desktop geometry function remains unchanged.

The co-partner row sits immediately below Hosted by Codex Ambassadors. Its actual Cerebras wordmark comes from the [official press kit](https://www.cerebras.ai/company/press-kit), is locally hosted at its natural aspect ratio, and displays 26px high. The lossless 360×159 WebP is 15,820 bytes. [Source receipt](../../public/brand/CEREBRAS-SOURCE.json) records the exact archive/member URL and hashes. The organizer label now says “Co-partner: Cerebras”; all organizer names, ambassador roles, original portraits and animations remain unchanged.

Accepted browser evidence contains 57 passing checks: 9 accepted normal-height checks from the first run and 48 from the corrected continuation. There are zero page errors. Nine focused Home, geometry and organizer unit tests also passed. Root owns final integrated typecheck/build/full-suite checks; they were not repeated in this lane.

- At 390×844 and390×480, paired 120px scroll measurements prove that the outgoing card stays pinned while the incoming card moves over it with the correct stacking order.
- Native CDP touch gestures scroll the document in both sizes. Every Rules row is visible and hittable before the FAQ covers it; the short-screen last row is visible at 355–405px.
- Expanded FAQ height recomputes its pin. Its last keyboard-focused summary remains visible and hittable in both sizes. Keyboard Continue to portal reaches `/signin?returnTo=%2Fdashboard` without an authentication send.
- Reduced-motion and pause captures show ordinary readable flow. Desktop 1440×900 and tablet 768×1024 captures verify the actual co-partner placement, logo aspect, contrast, gutters and CTA clearance.
- A clearly labelled temporary six-row long-agenda fixture, including long URLs, proves that every row can be read and hit before the next card covers it, at both mobile heights. No application agenda, approved event time or rule text changed. The owned fixture's original absent `event_content` row was restored and independently read back as absent.

Selected native captures were viewed, including each mobile transition, Rules last row, expanded FAQ focus, reduced/pause fallback, first/last long-agenda rows and desktop/tablet/mobile heroes. Native PNGs remain separate files; no mockup replaces them.

Useful screenshots:

- [Current desktop hero](verified/1440x900-hero.png)
- [Current mobile hero](after/390x844-hero.png)
- [Normal mobile stack](verified-normal-first-run/390x844-schedule-to-venue-overlap.png)
- [Short mobile stack](verified/390x480-schedule-to-venue-overlap.png)
- [Short Rules last row](verified/390x480-rules-last-row-visible.png)
- [Short expanded FAQ focus](verified/390x480-faq-expanded-last-focused.png)
- [Long synthetic agenda last row](verified/390x480-synthetic-long-agenda-row-6.png)

Evidence boundaries: `before/` contains 16 complete before captures. `after/` contains 16 initial exploratory captures; the old anchor algorithm produced unreliable incoming-section filenames after sticky positioning, so those progress frames are excluded from overlap proof (its hero pixels remain valid). `verified-normal-first-run/` contains accepted native normal-height frames and nine passing checks, followed by a harness-only URL-regex timeout: it incorrectly rejected the successful sign-in URL's returnTo query. The continuation uses a pathname predicate and proves the intended navigation. `verified/` contains 21 captures and 48 passing checks. The earlier zero-capture network-idle/lazy-image-decode harness failures remain preserved and excluded from application findings.

All browser contexts are closed. Owned Next 3009 and synthetic backend 8854 processes are stopped and both listeners verified closed. No push, deploy, provider setting, hosted migration or production-data action occurred. Development timings under concurrent root tests are not performance evidence.
