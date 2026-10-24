# Discover and Projects refinement

Local synthetic fixture evidence only. No hosted database, credentials, provider settings or deployment changed. Source worktree: `/workspace/ddd-discovery-refinement`, branch `fix/discover-card-hierarchy`. No branch was pushed.

## Source

- `018724575d9500284be8eba90390c48e8285edf8`: saved-identity People/Teams cards, real member dialog, hydration guard, completed-directory footer removal.
- `b6efc6f53a3e1c4c494512fa5d1a9bb679a4da97`: Projects empty/list refinement, scoped left alignment, Home footer hashtags.
- `1f127f44ff9aadf1def53d3d6d5ae548dcd295a8`: full-width saved names below avatar/action on screens at most360px wide.
- `618cb98bdde1d03a9fe0c85e9a1eedc40f79d02f`: remove legacy66px mobile engagement gutter inside new project cards.

All four commits explicitly verified author AND committer as Parampreet Singh <rubercuber.30@gmail.com>.

The accepted Team Studio styles are the design reference: warm paper/ink, readable names, saved team washes, restrained panels,44px actions. Shared navigation, Dashboard, Admin, domain flows and server projections were not rewritten in this lane. The public-directory member contract is supplied by backend source `9e85133b6d8477b7b8bf9ee8ddb39d1508839817`, running against this lane's disposable database only. It adds no client fetch. Counts remain authoritative even when a member is ineligible for public identity projection.

## Read the current images first

- `final/1440x900-teams.png`, `final/1440x900-participants.png`, `final/1440x900-team-dialog.png`: source b6.
- `final/390x844-participants.png`, `final/390x844-teams.png`: source b6, unchanged by later narrow rules.
- `interactions/768x1024-participants.png`: source 1f.
- `final-supplement/768x1024-teams.png`: source 618.
- `final-supplement/320x480-team-card-name.png`, `320x480-person-card-name.png`: current full-width narrow names, source 618.
- `final-supplement/320x480-dialog-last-member.png`: internally scrolled last saved member reachable on short mobile.
- `interactions/390x844-loading.png`, `390x844-error.png`, `390x844-member-profile.png`: genuine loading geometry, injected503 and first member-link navigation.
- Projects: see `../projects-refinement/README.md`.

Native PNGs are retained individually. Selected desktop, tablet, mobile, short-mobile, modal and state pixels were actually opened and inspected. The old 320 images in `final/` predate the narrow-name fix and are superseded by `final-supplement/`. `after/` is the018 checkpoint, before pixel review corrected inherited centered alignment; it is historical, not final.

## Verification

- 33 focused unit/component/privacy tests PASS; exact output in `final-focused-tests.txt`.
- Typecheck PASS; `final-typecheck.txt` is empty because tsc exited0.
- 37 focused browser checks PASS in `interactions/report.json`, including touch arrows, authoritative members,44px controls, viewport fit, focus containment/return, Escape, Back, scroll lock without width shift, first member profile link, search/loading/error/Retry, membership filter, lazy append without duplicate IDs and no private directory text.
- 7 final supplement checks PASS, including narrow full-width names, last member access, real project touch and keyboard navigation, no Teams overflow and aligned mobile project engagement.
- Projects empty18 PASS plus19 completed populated/search checks; the populated run ended on a harness strict-selector failure after the actual detail navigation. The targeted supplement proves that transition using the exact article selector. No broad repeat was used to hide this receipt.

All browser requests in these scripts are restricted to GET/HEAD on the owned localhost origin.503 failures are explicit synthetic interceptions. Unit tests separately preserve participant capabilities, vote behavior, immutable projection and safe links. No frontend speed claim is made from concurrent development-mode capture.

## Raw failures and limits

`before-first-cold-click/` preserves the old UI's first-click-before-hydration no-op; new local controls are disabled until hydrated. `before-dialog-close-navigation-race/` preserves a harness navigation race with deferred dialog history cleanup; the harness now waits for the dialog history marker to clear. `before/` was intentionally bounded by the parent after enough actual baseline pixels; its final interrupted audit receipt is not an application failure.

`interactions-announcer-harness-failure/` preserves a test selector that accidentally matched Next's hidden route announcer rather than the directory's actionable error. The corrected directory-scoped selector completed 37 checks. `../projects-refinement/empty-tablet-pending-harness/` preserves an interrupted run with unbounded QA waits. The initially observed pause advanced through 1440/768/390 before interruption. That old harness also used `/home` for the footer, but the actual Home route is `/`; the dev server logged 404 for its `/home` API lookup. The corrected route and bounded waits completed 18 checks. This was a harness error, not a confirmed tablet hydration defect. `../projects-refinement/populated/report.json` preserves the ambiguous article selector and expected503 browser console message.

These images use the shared shell at the lane's f543 baseline. The profile agent owns the subsequent shared-header refinement; integration screenshots are the parent's responsibility. No real Google/email login was exercised. No public member phone, email, credit, private idea or display of member IDs was added. Project sharing/OG work is a separate lane, and no dead share control was added here.

Cleanup: owned Next3009 and synthetic backend8854 were stopped after capture; both listeners and recorded PIDs are absent. Browser runs are closed. The stopped incomplete capture's leftover Chromium process was explicitly terminated, then its PID disappearance verified. See `cleanup.json`. Full build/full-suite and screenshots with the newly integrated shared header are intentionally left to the coordinating parent, which owns integration.
