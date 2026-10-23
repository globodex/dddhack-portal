# Dashboard matching-build comparison

Source: `e0fbc27c87449ff499427589108b201ab7829365`.
Worker SHA-256: `cd37903033f7f01ca7bb19aa6c33c79fcdf0552727b434b7bf26b76949f54241`.
Reference: `/home/param302/Dev/DDEHack-portal/design-research/2026-10-23/main-pages-v3/02-dashboard-team-credits-project.png`.

The exact reference board and all 13 matching-build core originals were opened. The additional tablet scroll diagnostic was also opened. The reference was displayed beside the core desktop/mobile originals for direct visual comparison.

Current result: core tab states and all 17 grouped functional checks pass; final Dashboard visual clearance is held for the confirmed tablet sticky-header opacity defect below. This is not user acceptance, publication approval or a whole-site visual pass.

## Verified comparison

- Desktop has the full-width 64px white brand/header bar, 232px sidebar below it, green current navigation, separate main gutters and compact bottom account row with its actual expression avatar and logout icon.
- Team, Credits and Project are functional tabs with one visible panel. Actual clicks, fragment loading, ArrowRight, Home and End passed at 1440×900, 390×844 and 834×1194.
- Team shows one expression avatar per member; initials are reserved for the team badge. The duplicate initials plus expression in the generated reference was deliberately not copied.
- The name/Leader alignment correction is visible in the new desktop and tablet captures. The mobile arrival location has readable width and its Maps link sits below it. Neither earlier finding remains in these captures.
- Credits uses the real provider heading, actual admin instructions and a masked value with named icon controls. The local data has one fake provider; the reference has two. No provider, allocation or redemption text was invented to fill the layout.
- The Project tab has a read-only vote count, actual project summary, Versions control and distinct private feedback. Alice has two versions and retains the authorized Update action. Eve has three and no update/save/commit controls, matching the reference's read-only state.
- The plain green project banner is an actual valid synthetic fixture image, not a missing production photograph. Names, chosen personal colors/expressions, contacts, instructions, version count and feedback intentionally reflect real fixture data rather than copying mockup identities or private text.

## Remaining P2: transparent tablet sticky header

`06-tablet-sticky-header-scroll-834x1194.png` is an original actual scroll capture. At scrollY=64 the header remains at top=0 but its computed background is `rgba(0, 0, 0, 0)`. The underlying Dashboard title and status visibly show through and overlap the brand/menu. `sticky-header.json` preserves those measurements. Root identified the shared 1199px navigation rule as missing its white background/border, and owns that bounded correction. A targeted matching-build scroll capture is required after rebuilding. No extra full Dashboard functional run is needed for that isolated style change.

The phone header measured 65px including its border, versus 64px desktop/tablet. The prepared core runner accepts 64–65px; no horizontal overflow was observed.

## Functional and privacy evidence

`report.json`: 17/17 grouped checks passed; 13 original viewport captures; zero browser JS errors; zero blocked requests; source artifact hash unchanged. All browser contexts and the sandboxed Chromium process closed.

The checks include desktop sidebar hide/show and matching ARIA, mobile/tablet menu disclosure, hash and keyboard tabs, one expression per member, two immutable versions in the native history dialog and focus return, read-only votes, third-attempt editing denial and unallocated-voucher reveal denial. Registered Bob received no private arrival card, personal credit field or private project summary.

Traffic: 79 loopback GET requests and nine explicitly allowed local `reveal-credit` requests for fake Alice's `fake_credit`. No other mutations, external requests, Clipboard writes, hosted traffic or AI calls occurred. The revealed fake allocation was never photographed or written to evidence. Reveal responses were no-store; hide, tab change and a dispatched browser blur event masked it. Every screenshot assertion required masked allocations.

The earlier preview 503 was traced to an invalid optional synthetic map URL. Root corrected and validated the fixture, then restarted the same compiled source. This setup diagnostic remains separately preserved and is not classified as an application Dashboard defect.

## Suggested user batch

1. `01-team-locked-desktop-1440x900.png`: desktop Team and shared shell.
2. `02-credits-masked-mobile-390x844.png`: actual personal voucher controls.
3. `05-project-third-attempt-readonly-mobile-390x844.png`: three-version read-only Project state and private feedback.

All three tabs at all three sizes are retained. The three `04-project-version-history-*` images are supplemental diagnostic originals. Images are visible viewport captures, not stitched/full-section exports; long Team and Project content can continue below the frame. No Library upload or user approval is claimed in this report.
