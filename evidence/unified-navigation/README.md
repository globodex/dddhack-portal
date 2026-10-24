# Unified navigation verification

Local synthetic fixtures only. No hosted database, provider, real Google sign-in, or production session was changed. All native PNG originals are retained, including requested Admin Submissions desktop and mobile frames.

## Sources and results

- Before: `f54306b`, recorded by `3c67986709bf281ae9617c8ba3c7a4335c7d4be0`. The before set contains 27 PNGs across 16 states.
- Header/menu visuals: `c56117a2dbc097e493bedd2439318bdb98ca3aee`. `after/report.json` records **56/56 passing cases** at 1440×900, 768×1024, 390×844 and 320×480, covering anonymous, Viewer, participant, incomplete profile, volunteer, judge, mentor, admin and owner, plus standalone privacy/terms/sign-in/credit access and Admin Submissions.
- Final behavior: `8f6db403a4f52ccb26c42def41a2ea7873eb2429`. `after/interactions-report.json` records **13/13 passing checks**, including first-touch role links, one Back, desktop resize, Escape/focus restoration, standalone navigation and one confirmed synthetic local sign-out. The intervening changes only preserve native top-frame sign-in navigation; the rendered header/menu is unchanged.
- Opening the menu added **zero projection/session requests** in every matrix case. Saved avatars cover staff as well as participants; a genuine absent-profile fixture shows the neutral placeholder. Standalone pages do not fetch an invented actor.
- Focused tests and final TypeScript checks pass. Logs are included under `checks/` and `after/`.

## Native evidence to review

- `after/owner-admin-participants-1440x900-closed.png` and `-menu.png`
- `after/owner-admin-participants-390x844-closed.png` and `-menu.png`
- `after/owner-admin-participants-320x480-logout-visible.png`
- `after/owner-admin-submissions-1440x900-closed.png`
- `after/owner-admin-submissions-390x844-closed.png`
- `after/dave-profile-1440x900-closed.png`
- `after/anonymous-privacy-320x480-closed.png`
- `after/first-tap-anonymous-signin-390.png`
- `after/menu-persists-after-desktop-resize-1440.png`

The desktop staff header/menu, anonymous Home, Viewer menu, absent-profile placeholder, mobile/short mobile staff views, Submissions desktop/mobile, successful Sign in, resized menu and short legal header were inspected as actual pixels. `after/native-screenshot-manifest.json` records all 106 after PNG dimensions and SHA-256 hashes; files also include transparent diagnostic checkpoints, rather than implying each is a separate accepted case.

## Confirmed defect and bounded correction

An anonymous menu Sign in link used native `target="_top"`. Closing the menu left its temporary history entry active; cleanup called Back and aborted the sign-in request. `after/anonymous-signin-race.json` preserves the actual push → cleanup Back → popstate → `net::ERR_ABORTED` sequence. The fix consumes that temporary entry while allowing the browser's native top-frame navigation. The positive first-touch and Back checks pass. No auth guard, route permission, provider or shared history helper was weakened.

## Limits and harness provenance

This is Chromium desktop/mobile emulation and real CDP touch, not a physical-device claim. Native Google/email authentication remains unverified. The logout screenshot uses this lane's existing confirmation component; a separate parent-owned confirmation redesign is outside this report.

Raw diagnostic JSON/logs retain harness corrections: SVG expression arrays versus strings, reserved-scrollbar viewport measurements, a menu whose rows already fit 844px without scrolling, and one unexpectedly closed Chromium process. The process failure's cause is uncertain; OOM counters were zero. One fresh browser resumed unfinished cases only. Some initial failed-attempt PNG paths were reused by a later attempt; the raw failure reports and current accepted originals remain. No DOM screenshot substitution or overflow masking was used.

`after/fixture-final-integrity.json` records a read-only check of the new isolated fixture: SQLite integrity is `ok` and foreign-key errors are empty. `after/cleanup.json` verifies all owned browsers closed and owned ports 3012/8857 and exact Node PIDs stopped. No push was performed by this lane.
