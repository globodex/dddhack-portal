# Public responsive alignment audit

final result: blocked

This is the historical alignment matrix from source2b35d3e, before the user requested a smaller desktop organizer composition. That new target is implemented separately in9bb0c39 and still requires its own rendered verification.

Home content, sign-in and legal headers pass the current size and native zoom checks. One evidence item remains: expanded menus at rest. The first direct CDP captures caught their280ms entrance, so those frames are rejected for resting-state review. The shared browser slot is pending while other lanes finish. No source defect remains open in this lane.

The audit covers the real production Next.js Home hero, all four chapters, organizers, sign-in and Privacy/Terms headers. Long agenda/FAQ strings are explicitly labelled DOM-only fixtures and were never saved to application data.

## Source and confirmed fix

Before source: `2a6d865517e5903ef974ca198f073d27aaf39265`. After source: `2b35d3e7036a88cf84586dae02ef7b81e39ff9e6`; the surface fingerprint remained unchanged through the98-frame matrix.

At320x844, an unbroken agenda URL exceeded its column and panel. The native [before image](../evidence/responsive-public-audit/before/dom-stress-agenda-320x844.png) preserves that clipping. Commit `d6f5138340a990532ea609b1f8b236152c900d95` adds `min-width:0` to the agenda text cell and `overflow-wrap:anywhere` to agenda headings/descriptions and FAQ questions/answers. It adds no overflow clipping. The [after agenda](../evidence/responsive-public-audit/after/dom-stress-agenda-320x844.png) and [after FAQ](../evidence/responsive-public-audit/after/dom-stress-faq-320x844.png) show the complete references within their columns.

## Steps and findings

| Step | Surface and observations | Health |
| --- | --- | --- |
|1|Home identity, original Delhi/Metro artwork, three-line compact title and date/host text fit at320,390,768 and1440. Headers and icon buttons retain their gutters. The desktop title has5px intrinsic overhang into the empty column gap; no text clips or collides.|Passed|
|2|Portal CTA stays clear at left/center/right hit points. Each of seven viewport groups produced two trusted pointer/touch/click and Enter activations with the intended href. Short screens scroll naturally to the CTA and settled dot pile.|Passed|
|3|Schedule, Venue, all eight Rules and seven FAQ questions remain readable. Long spaced titles and unbroken DOM-only references wrap. Keyboard toggling of the long first FAQ question works.|Passed after d6f5138|
|4|All four original organizer images decode and retain circular crops, colored rings, cylinders, names and roles. Native zoom and short screens have additional settled row captures.|Passed|
|5|Sign-in heading/dot, Google logo, email label/input and submit arrow align. Long input values stay within the field. On short and zoomed screens the submit action remains reachable by natural scrolling, with a clear hitbox.|Passed|
|6|Privacy and Terms headers, required draft labels, long two-line Terms heading and contents fit at320 and native200% zoom.|Passed|
|7|Expanded menus open and Escape closes them. Their first screenshots caught the top-down animation; a resting-state recapture is pending. The pre-fix320 baseline contains earlier valid menu images, but those are not substituted for current final evidence.|Evidence pending|

## Native zoom and viewport coverage

Captured320x844,320x480,390x844,390x480,768x1024 and1440x900. Actual native200% zoom uses `chrome.settingsPrivate.setDefaultZoom(2)` in a disposable Chromium profile, then a new app tab. Recorded metrics are outer1440x900, inner720x378 CSS pixels, DPR2 and visualViewport.scale1. CDP captures the actual1440x756 content viewport. This is browser zoom, not CSS zoom, pinch or a reflow approximation.

The matrix contains98original PNGs across seven groups; the settled-detail follow-up contains7. Before evidence contains17images. All were inspected in native-size mobile sheets and selected raw native/desktop/tablet views; the7settled-detail files were opened individually. Each report records source revisions and image hashes. All runs have0uncaught page errors,0mutating/external requests and0document horizontal overflow after the fix.

## Capture corrections and limits

- The before report is a partial failing baseline. Its first DOM-only FAQ image retained the prior panel during smooth scroll; that frame is rejected for FAQ alignment. The final matrix uses instant scrolling.
- Direct CDP capture preserves finite animation timing. Early menu frames show their entrance rather than their resting position and are rejected for rest review. Newly visible organizer-end frames are superseded by the settled follow-up.
- A raw bounds scan flagged organizer entrance transforms and the5px desktop title overhang. Settled photos/labels are inside their rows; the desktop title remains fully visible with a clear adjacent gap. These scans do not indicate a remaining clipping defect.
- Authentication sends and production mutations were not attempted. The browser blocks non-read requests and non-local destinations. Real Google login and SMTP delivery remain unverified.
- This local Chromium audit does not establish full WCAG compliance, screen-reader behavior, physical-device keyboards, hosted speed or capacity. Concurrent local browser load is not performance evidence.

[Evidence index](../evidence/responsive-public-audit/README.md), [before report](../evidence/responsive-public-audit/before/report.json), [matrix report](../evidence/responsive-public-audit/after/matrix-report.json) and [settled-detail report](../evidence/responsive-public-audit/after/rest-report.json).
