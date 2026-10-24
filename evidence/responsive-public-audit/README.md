# Public responsive alignment evidence

This98-frame matrix and7-frame detail set predate the user’s smaller desktop organizer target. They remain valid historical alignment evidence for their recorded source. The9bb0c39 organizer change requires a separate before/after set; do not present the older desktop organizer image as the final selected size.

Before source `2a6d865517e5903ef974ca198f073d27aaf39265`; after source `2b35d3e7036a88cf84586dae02ef7b81e39ff9e6`. The only source change for this audit is the scoped URL wrapping fix `d6f5138340a990532ea609b1f8b236152c900d95`, already integrated by the parent. These are original local browser PNGs with synthetic-only data. No generated or painted replacement screenshots are used.

- [320px mobile Home](after/home-rest-320x844.png)
- [320px short mobile CTA and settled dots](after/home-cta-rest-320x480.png)
- [390px short mobile CTA and settled dots](after/home-cta-rest-390x480.png)
- [Tablet Home](after/home-rest-768x1024.png)
- [Desktop Home](after/home-rest-1440x900.png)
- [Before: long URL clipping](before/dom-stress-agenda-320x844.png)
- [After: long agenda URL at320px](after/dom-stress-agenda-320x844.png)
- [After: long FAQ question and URL at320px](after/dom-stress-faq-320x844.png)
- [Native200%: lower CTA and pile](after/home-cta-rest-native-zoom-200pct-1440x900.png)
- [Native200%: complete long agenda URL](after/dom-stress-agenda-url-detail-native-zoom-200pct-1440x900.png)
- [Native200%: long FAQ question and URL](after/dom-stress-faq-native-zoom-200pct-1440x900.png)
- [320px organizer portraits and cylinders](after/home-organizers-320x844.png)
- [320px short: final organizer rows](after/home-organizers-end-settled-320x480.png)
- [Native200%: final organizer and partner text](after/home-organizer-4-settled-native-zoom-200pct-1440x900.png)
- [320px sign-in](after/signin-320x844.png)
- [320px short: reachable sign-in submit](after/signin-submit-reachable-320x480.png)
- [Native200%: reachable sign-in submit](after/signin-submit-reachable-native-zoom-200pct-1440x900.png)
- [320px Privacy header](after/privacy-header-320x844.png)
- [320px Terms header](after/terms-header-320x844.png)

Expanded public-menu resting-state capture passes in the final set below. The matrix's menu frames were captured during their280ms entrance and are rejected as final menu evidence. Original files remain for traceability. The settled-detail report supersedes organizer-end frames that caught a newly triggered entrance. See the [full QA](../../docs/PUBLIC_RESPONSIVE_ALIGNMENT_QA.md) for the numbered steps, findings, exact native zoom metrics and limitations.

[Before17-frame report](before/report.json), [98-frame matrix](after/matrix-report.json), [7-frame settled-detail report](after/rest-report.json). Native200% uses a1440x900 outer window,720x378.5 CSS visual viewport (innerHeight floors378), DPR2, visualViewport.scale1 and1440x757 native PNGs. Ordinary images use the dimensions in their filename. Long references and input values are explicitly reported DOM-only fixtures and were never saved to data. Only the local fixture marker and Next development overlay were hidden in normalized images.

Final public-menu evidence, source73fb78d; targeted decimal Terms source7c110379:

- [20-second disabled hydration state](after/menus/signin-hydration-held-20s-320x480.png)
- [First-touch sign-in menu320](after/menus/signin-menu-rest-320x480.png)
- [Privacy menu320](after/menus/privacy-menu-rest-320x480.png)
- [Terms menu320](after/menus/terms-menu-rest-320x480.png)
- [Native200% sign-in menu](after/menus/signin-menu-rest-native200.png)
- [Native200% Terms last-link proof](after/menus/terms-native200-decimal-viewport-confirmed.png)
- [Final menu report](after/menus/report.json)
- [Decimal viewport and44px hit-target receipt](after/menus/terms-decimal-report.json)

The legacy integer-edge failure is preserved and resolved by the decimal viewport read; the entire text and68px link target are visible. All11final native images were opened. TypeScript passed. No real auth sends or production mutations were attempted.
