# Current project submission and Credits verification

The complete existing production-app flow was exercised on a disposable local backend at port 8821, using only fake Alice and a clearly non-redeemable allocation. This is not a hosted login, deployment or production-data test. The feature branch is `feat/projects-rules-experience`.

## Result and source

The final responsive matrix uses root runtime `667222d5cd2680ec872860b971f32ecb7be42249`. It passes **15 checks across five cases**, with zero page errors. The final fake Credits reveal/copy test passes at that same runtime. Final submission uses root HEAD `244d68febfea4a7ba7ff5966001310db107c7828`; the entire intervening diff contains Team evidence and documentation only, and the runtime file fingerprints match. Exact native-file hashes are retained in the receipts and delivery manifest.

The one application correction owned by this lane is `beac8fcfe849436abc7a47b3e08e856d5a2e8467`: an 84-character unbroken project name made the dynamic Cerebras question overflow, expanding the mobile layout viewport from 320 to 578 pixels and breaking subsequent touch targeting. The scoped legend now wraps, and the unused right header column is removed at widths of 360px or less. Actual 320px screenshots show the title/dot together on one line, the entire question contained, and Next working. No server permission, validation requirement, policy, data model or dependency was changed. Root separately implemented the reported visible Copy success state.

## Actual completed flow

| Action              | Verified outcome                                                                                                                                                     | Evidence                                                    |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Three-step editor   | All three steps, populated fields, required errors, first-invalid focus, long names/URLs, tool selections, attestation error, touch/keyboard Next and Back           | `project-credit-current`, `project-credit-responsive-final` |
| Save draft          | Real POST 200; revision 2→3; committed attempts remain 2; success toast actually rendered and viewed                                                                 | `project-credit-positive-retry`                             |
| History after draft | Exactly two immutable committed versions remain; Escape closes                                                                                                       | `project-credit-followup`                                   |
| Credits             | Dashboard projection omits the raw fake value; one reveal returns 200; actual clipboard exact-match; Hide remasks and disables Copy                                  | `project-credit-followup`                                   |
| Final Copy UI       | A separately authorized fake reveal verifies visible CircleCheck, green success stroke, live announcement, 320px touch and desktop keyboard copying                  | `credit-copy-final`                                         |
| Final submission    | Exactly one authorized `submit-project` POST 200; response version ID matches the real SQLite receipt; revision 3→4; committed count 2→3                             | `project-final-submit`                                      |
| Third-attempt lock  | `canCommit=false`, `locked=true`, three history versions; old two version hashes unchanged; Update/Submit unavailable on desktop and 320px; no fourth request issued | `project-final-submit`                                      |

The final receipt is `a80d2618-0310-4c3f-99e6-278766e02bc8` for `visual_project_alice`. A separate **read-only** SQLite check of `/tmp/ddd-create-team-revised-root.sqlite` confirms the receipt, three versions and revision 4. This fixture is now intentionally locked at 3/3; do not rerun editable-flow tests against it or issue another submission.

Legacy `/submission` is deliberately canonicalized to `/dashboard` in `Portal`. The extra direct-route check first expected a standalone editor and timed out. After reading the actual canonical mapping, the GET-only alias check verified the real Dashboard→Project surface at desktop and 320px: Versions 3/3 and no Save draft, Submit or Update controls. No route behavior was changed.

## Responsive and interaction coverage

The five cases are 320×720, short mobile 390×480, tablet 768×1024, desktop 1440×900, and **actual native Chromium 200% browser zoom**. The latter uses a disposable persistent profile, `viewport:null`, an outer 1440×900 window, `chrome.settingsPrivate.setDefaultZoom(2)` on the browser settings page, then a fresh app tab. Recorded metrics are inner width 720, inner height 378, DPR 2 and visual viewport scale 1. CDP captures preserve the full native **1440×757** web-content pixels. This is not CSS scaling or a pinch-zoom substitute. Earlier unpacked-extension attempts failed; the verified settings-page method supersedes that initial limitation.

Each case covers Rules, Projects, project detail, leaderboard, history, all editor steps and errors, confirmation cancellation, Credits masking, and the shared menu when present. Checks compare document width against **clientWidth** and require the requested mobile innerWidth, because comparing scrollWidth only with innerWidth missed the mobile overflow. The tests also verify heading/dot alignment, the 320px title, minimum 44px footer controls visible after normal scrolling, first-invalid focus/ARIA, Escape, browser Back, opener focus, and ordinary wizard Back navigation.

Native public captures include initial disabled-header loading snapshots and additional post-hydration ready snapshots. The latter explicitly wait for the Projects hydration marker and enabled menu. The additional ready detail uses the unchanged Eve fixture after Alice's final commit. Ordinary full-page captures reset scroll to the top, avoiding displaced sticky-header artifacts. Native 200% images are viewport captures; normal document scrolling remains available for longer forms.

Selected real pixels were inspected across every viewport, including the long-name fix, all three 320px/short-mobile/tablet steps, native zoom fields/menu/dialogs, Copy feedback, submit toast, locked dashboard and three-version history. This is scoped Chromium fixture evidence; physical devices, other browsers and the real Google login remain outside this lane's proof. Full typecheck, repository-wide tests, production build and comparable frontend performance measurements belong to the root integration gate. No speed improvement is claimed.

## Execution corrections preserved honestly

The first draft-save attempt exceeded a 15-second browser wait. Both the direct fixture backend and SQLite read-only checks confirmed revision 2, two versions and no saved marker; the request response was not observed. Root authorized one retry after those checks and reduced browser concurrency. That retry returned 200 and persisted correctly. The initial timeout cause is unproven. No duplicate save or submission was hidden.

After the successful save, an automation navigation to the identical hash URL retained the editor, so the harness incorrectly expected a Project tab. A fresh-context followup verified history and Credits without repeating Save. The reports preserve both this expectation error and the successful write. The responsive flow now exits through the actual wizard Back controls.

All screenshots are original PNGs. Clipboard comparisons use the known fake fixture value internally; raw allocations are not logged in JSON receipts. External requests are blocked. Permitted POSTs are narrowly guarded to the authorized fake actions and actors. Production credentials, settings, databases and storage are untouched.
