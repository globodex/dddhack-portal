Final layout update: source `12de812a11b3109c96beebddc1dedc1fe204334f`, verified in integrated root `667222d5cd2680ec872860b971f32ecb7be42249`. [Stable geometry report](stable-geometry.json) records exactly zero outer-dialog movement during busy and 503 error states at desktop, full mobile and both short mobile widths. [320 px final-line error state](https://github.com/Param302/dddhack-portal/blob/6fcb7d5be117d234ae60a4a4b04af966f9134af8/evidence/create-team-repair/geometry-short/create-team-320x480-error.png) and [390 px final-line error state](https://github.com/Param302/dddhack-portal/blob/6fcb7d5be117d234ae60a4a4b04af966f9134af8/evidence/create-team-repair/geometry-short/create-team-390x480-error.png) show the focused end of the 993-character intro, with 20 px clearance above the footer. CTA hit testing and Tab/Shift+Tab passed. Captured Chromium AX trees expose Team intro/value and required Team name semantics; actual screen-reader use remains unverified. All browser sessions are closed.

# Team creation dialog repair

Final runtime source: `c8f42a5f91aa6414cf11be4bd8c51f7329e769ad`. Normal viewport screenshots were refreshed on this source after the first checkpoint. `b472b4fb390f96763816fc98ef17270efeb54f5d` restores POST, inert and busy hydration guards; `c8f42a5` focuses the close control once those guards unlock.

The three native screenshots in `rejected-before/` are source `e1209bc` and are **rejected evidence**, including the disturbed 390 x 480 arrangement. They were viewed before changes. They are not a passed design target.

The replacement uses a single header, scrolling body and action footer. The title and 44 px close control share an in-flow row. One initials preview and eight hidden accessible radios are grouped together; the radio labels retain at least 44 px touch targets, including at 320 px. The public Team intro remains optional and is separate from the private saved idea.

First rendered after screenshots:

- [Desktop 1440 x 900](https://github.com/Param302/dddhack-portal/blob/6fcb7d5be117d234ae60a4a4b04af966f9134af8/evidence/create-team-repair/create-team-after-1440x900.png)
- [Mobile 390 x 844](https://github.com/Param302/dddhack-portal/blob/6fcb7d5be117d234ae60a4a4b04af966f9134af8/evidence/create-team-repair/create-team-after-390x844.png)
- [Short mobile 390 x 480](https://github.com/Param302/dddhack-portal/blob/6fcb7d5be117d234ae60a4a4b04af966f9134af8/evidence/create-team-repair/create-team-after-390x480.png)
- [Short mobile after internal scroll](https://github.com/Param302/dddhack-portal/blob/6fcb7d5be117d234ae60a4a4b04af966f9134af8/evidence/create-team-repair/create-team-after-390x480-scrolled.png)
- [Narrow mobile 320 x 480 with 80-character team name](https://github.com/Param302/dddhack-portal/blob/6fcb7d5be117d234ae60a4a4b04af966f9134af8/evidence/create-team-repair/create-team-after-320x480.png)
- [Narrow mobile after internal scroll](https://github.com/Param302/dddhack-portal/blob/6fcb7d5be117d234ae60a4a4b04af966f9134af8/evidence/create-team-repair/create-team-after-320x480-scrolled.png)

The desktop, 390 px full-height and short states, short scrolled state, and narrow 320 px rendering were inspected as actual pixels. `first-capture-report.json` records viewport, header/body/footer geometry and source. These screenshots use local synthetic fixture data on localhost:3002, with no production requests. The CTA remains inside the viewport while the form body scrolls; horizontal document overflow was checked. This checkpoint records the replacement and does not claim user acceptance.

## Focused validation

Typecheck and nine relevant Node tests passed. The final browser run passed eleven checks, with zero page errors, external requests or automated WCAG A/AA violations in the creation dialog. [Controls report](controls-report.json) records required-field validation, keyboard focus and trap, Escape, browser Back, close, optional intro, touch color selection, cancellation, retry, and persisted creation.

The browser submitted one injected 503 and then one real successful HTTP 200 create against `/tmp/ddd-create-repair.sqlite`. A fresh API read verified the 80-character name, 993-character public URL intro, violet initials identity and one leader membership. Cancel sent no request. The final run reads persistence without racing a redundant route navigation against Next's refresh.

Additional pixels inspected:

- [320 px with long name and URL](https://github.com/Param302/dddhack-portal/blob/6fcb7d5be117d234ae60a4a4b04af966f9134af8/evidence/create-team-repair/create-team-320x480-long-name-and-url.png)
- [320 px contextual retry error](https://github.com/Param302/dddhack-portal/blob/6fcb7d5be117d234ae60a4a4b04af966f9134af8/evidence/create-team-repair/create-team-320x480-retry-error.png)
- [Native 200% desktop browser zoom](https://github.com/Param302/dddhack-portal/blob/6fcb7d5be117d234ae60a4a4b04af966f9134af8/evidence/create-team-repair/create-team-after-desktop-browser-zoom200.png)
- [Native 200% after internal scroll](https://github.com/Param302/dddhack-portal/blob/6fcb7d5be117d234ae60a4a4b04af966f9134af8/evidence/create-team-repair/create-team-after-desktop-browser-zoom200-scrolled.png)

The native zoom uses Chromium's own default zoom setting in a disposable profile: outer width 1440, CSS inner width 720, DPR 2, visual viewport scale 1. Native PNGs are 1440 x 757 and captured directly with CDP to avoid Playwright's cropped screenshot at browser zoom. [Zoom report](zoom-report.json) distinguishes the HEAD at capture from the identical runtime patch subsequently committed as `c8f42a5`. [Final QA](final-qa.json) records hashes of both runtime source files, verified against that commit.

The read-only final normal-viewport recapture used a separately seeded `/tmp/ddd-create-final-capture.sqlite`. Owned Next 3002 and backend 8792 were stopped after capture, and all browsers closed. Full integrated build and broader application checks remain with the parent agent. No provider, production data or published state changed.
