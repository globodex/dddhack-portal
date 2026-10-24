# Public responsive alignment audit

final result: passed

This is the historical alignment matrix from source2b35d3e, before the user requested a smaller desktop organizer composition. That new target is implemented separately in9bb0c39 and still requires its own rendered verification.

Home content, sign-in, legal headers and public menus pass the recorded size and native zoom checks. The sign-in first-click hydration defect is fixed and verified. Resting menu images replace the rejected entrance frames. The latest smaller desktop organizer target is verified separately in [its QA](ORGANIZER_DESKTOP_REFINEMENT_QA.md).

The audit covers the real production Next.js Home hero, all four chapters, organizers, sign-in and Privacy/Terms headers. Long agenda/FAQ strings are explicitly labelled DOM-only fixtures and were never saved to application data.

## Source and confirmed fix

Before source: `2a6d865517e5903ef974ca198f073d27aaf39265`. After source: `2b35d3e7036a88cf84586dae02ef7b81e39ff9e6`; the surface fingerprint remained unchanged through the98-frame matrix.

At320x844, an unbroken agenda URL exceeded its column and panel. The native [before image](https://github.com/Param302/dddhack-portal/blob/bddb869f3209adcb6cc4ea6161014d51f340cd96/evidence/responsive-public-audit/before/dom-stress-agenda-320x844.png) preserves that clipping. Commit `d6f5138340a990532ea609b1f8b236152c900d95` adds `min-width:0` to the agenda text cell and `overflow-wrap:anywhere` to agenda headings/descriptions and FAQ questions/answers. It adds no overflow clipping. The [after agenda](https://github.com/Param302/dddhack-portal/blob/bddb869f3209adcb6cc4ea6161014d51f340cd96/evidence/responsive-public-audit/after/dom-stress-agenda-320x844.png) and [after FAQ](https://github.com/Param302/dddhack-portal/blob/bddb869f3209adcb6cc4ea6161014d51f340cd96/evidence/responsive-public-audit/after/dom-stress-faq-320x844.png) show the complete references within their columns.

## Steps and findings

| Step | Surface and observations | Health |
| --- | --- | --- |
|1|Home identity, original Delhi/Metro artwork, three-line compact title and date/host text fit at320,390,768 and1440. Headers and icon buttons retain their gutters. The desktop title has5px intrinsic overhang into the empty column gap; no text clips or collides.|Passed|
|2|Portal CTA stays clear at left/center/right hit points. Each of seven viewport groups produced two trusted pointer/touch/click and Enter activations with the intended href. Short screens scroll naturally to the CTA and settled dot pile.|Passed|
|3|Schedule, Venue, all eight Rules and seven FAQ questions remain readable. Long spaced titles and unbroken DOM-only references wrap. Keyboard toggling of the long first FAQ question works.|Passed after d6f5138|
|4|All four original organizer images decode and retain circular crops, colored rings, cylinders, names and roles. Native zoom and short screens have additional settled row captures.|Passed|
|5|Sign-in heading/dot, Google logo, email label/input and submit arrow align. Long input values stay within the field. On short and zoomed screens the submit action remains reachable by natural scrolling, with a clear hitbox.|Passed|
|6|Privacy and Terms headers, required draft labels, long two-line Terms heading and contents fit at320 and native200% zoom.|Passed|
|7|Public Home, sign-in and legal menus open on the first activation. Resting images, Escape/focus return and SignIn Enter/Back pass. A20.720s client-script hold keeps the menu disabled and hydration marker false; after release the first touch opens it. Native Terms last-link text and68px target are reachable.|Passed|

## Native zoom and viewport coverage

Captured320x844,320x480,390x844,390x480,768x1024 and1440x900. Actual native200% zoom uses `chrome.settingsPrivate.setDefaultZoom(2)` in a disposable Chromium profile, then a new app tab. Recorded metrics are outer1440x900, innerWidth720 and integer innerHeight378, DPR2 and visualViewport.scale1. The decimal visualViewport height is378.5 CSS pixels; CDP captures1440x757 native pixels. This is browser zoom, not CSS zoom, pinch or a reflow approximation.

The matrix contains98original PNGs across seven groups; the settled-detail follow-up contains7. Before evidence contains17images. All were inspected in native-size mobile sheets and selected raw native/desktop/tablet views; the7settled-detail files were opened individually. Each report records source revisions and image hashes. All runs have0uncaught page errors,0mutating/external requests and0document horizontal overflow after the fix.

## Final menu verification

The owned fix is `e4a8d9d258c4421c321f7896bf115bc608d34805`, integrated by the parent as94948d8. First-touch,20-second hydration and native menu evidence source is `73fb78dd80eac7635b247349be76610e95e44551`; decimal Terms verification source is `7c1103798170138d5ae696d9ce9bb3a985d7ee69`. The missing sign-in menu guard now disables the control until its handler attaches and focuses the trigger before opening. Method POST is preserved. Own-branch TypeScript passes.

The first Terms assertion compared the last link bottom378.5px against floored innerHeight378. The targeted read uses visualViewport.height378.5, finds full text ending363.5px and a68px visible target. Its center and four corners of a44px square all hit the link. No UI change was needed. The failed receipt is retained beside the passing decimal report.

[Final public-menu report](../evidence/responsive-public-audit/after/menus/report.json), [decimal Terms report](../evidence/responsive-public-audit/after/menus/terms-decimal-report.json). Account Workspace/Your profile route navigation remains a separate parent-owned verification.

## Capture corrections and limits

- The before report is a partial failing baseline. Its first DOM-only FAQ image retained the prior panel during smooth scroll; that frame is rejected for FAQ alignment. The final matrix uses instant scrolling.
- Direct CDP capture preserves finite animation timing. Early menu frames show their entrance rather than their resting position and are rejected for rest review. The final11-frame public-menu set is opened and accepted. Newly visible organizer-end frames are superseded by the settled follow-up.
- A raw bounds scan flagged organizer entrance transforms and the5px desktop title overhang. Settled photos/labels are inside their rows; the desktop title remains fully visible with a clear adjacent gap. These scans do not indicate a remaining clipping defect.
- Authentication sends and production mutations were not attempted. The browser blocks non-read requests and non-local destinations. Real Google login and SMTP delivery remain unverified.
- This local Chromium audit does not establish full WCAG compliance, screen-reader behavior, physical-device keyboards, hosted speed or capacity. Concurrent local browser load is not performance evidence.

[Evidence index](../evidence/responsive-public-audit/README.md), [before report](../evidence/responsive-public-audit/before/report.json), [matrix report](../evidence/responsive-public-audit/after/matrix-report.json) and [settled-detail report](../evidence/responsive-public-audit/after/rest-report.json).
