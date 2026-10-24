# Results and private review evidence

All captures use a disposable SQLite fixture and local frontend3014/backend8859. No production records, provider calls or hosted writes were used. The synthetic banner is intentionally visible. Native PNGs are retained rather than replaced with rendered mockups.

## Source and final frames

- Before: `cde3ce4e5a69158eaf5a2b0f7ae489800740982c`; six actual before PNGs in `before/` were captured and viewed before edits.
- UI source: `c3edc12bb9df19b011c728c74939ffa8e4e1c8e8` and `2824c48a353cc7eb3e91e84bd143132f53c5780d`.
- Final narrow keyboard/status correction: `e787bbcb59717cc1999e05922c529da2612017ee`.
- Parent backend metadata `46afa8b` and exact history `0021ccd` were cherry-picked locally as `857fba2` and `077e668` solely for this preview. Integrate only the authored UI/evidence commits into a root that already has those contracts.

`final/report.json` binds fourteen final frames to `2824c48`: Review, collapsed Results and populated Judging setup at1440×900,768×1024,390×844,320×480, plus score/AI viewport frames at390×480. All fourteen actual images were viewed. There is no horizontal overflow or clipped judging input. All ten rating targets are at least44×44CSSpixels; the narrowest measured44.59×44 at320.

`native-history/report.json` binds five further images to exact `e787bbc`: historical version1 and actual native200% browser zoom. Browser metrics were CSS720×378, DPR2, visualViewport.scale1; direct CDP screenshots are1440×757physical pixels with no full-page clip substitution. Top and lower score/judging-field frames were viewed. The final source changes only keyboard focus and non-final job status; the current pending/unconfigured state and geometry in the fourteen-frame matrix are unchanged.

Useful review files:

- `final/review-1440x900.png`
- `final/review-390x844.png`
- `final/review-320x480.png`
- `final/results-1440x900.png`
- `final/results-390x844.png`
- `final/judging-1440x900.png`
- `final/judging-320x480.png`
- `native-history/historical-version1-390x844.png`
- `native-history/review-score-native200.png`
- `native-history/judging-fields-native200.png`
- `error-readback/settings-error-short390x480.png`

## Functional checks

`ui-tests.txt`:22/22 focused UI/policy/integration tests passed. `typecheck.txt`: final typecheck passed. Tests cover protected policy preservation, timestamp precision, IST validation/bounds, explicit scored-engagement qualification, owner/frozen controls, actual snapshot policy selection, manual final without invented AI requirement, private grade/version/state projection, saved answers and legacy unknowns, removal of the requested rubric/assignment UI and existing admin/mentor boundaries. Root owns the integrated production build and wider backend suite.

Actual UI persistence on the disposable fixture passed:

- Settings POST200 and fresh GET: policy version1→2, saved judging values retained, all protected operational keys, weights, confirmations and operation scopes unchanged.
- Review POST200 and fresh GET:8/10 plus private feedback saved against the exact current version.
- Opening Versions sends no request. Viewing version1 sends exactly one GET, renders its stored description and hides current-only mutations. Returning to version2 sends one GET and restores its exact answers/actions. No write occurs.
- Keyboard Enter on View now focuses the new H1, independently asserted by the final capture runner. Touch rating9, native ArrowLeft to8, and Tab to feedback passed at390×480.
- Intercepted503: busy form disables its fieldset; local actionable error remains visible and Save enables retry. `error-readback/report.json` additionally proves one intercepted request and fresh server policy/version3 unchanged. No request in that final check reached the mutation backend.

`flows/report.json` deliberately preserves an early stopped harness run: three successful persistence checks precede an invalid Playwright `fieldset.isDisabled()` assertion. That early interrupted busy attempt is not accepted error-state proof. The final attribute-based, resolved503 and explicit fresh-readback checks supersede it. `history-error/` contains the successful bounded history/busy/error run; its first historical full-page image has the sticky-header scroll-capture artifact and is superseded by the top-of-page `native-history/` image. `first/` images are interim worktree renders, not final acceptance frames.

## Limits and remaining product conflict

The UI shows actual local AI-unconfigured state. No live numeric provider evaluation, public AI reveal, final freeze or award publication was performed. Native screen reader operation was not tested; semantic rendering and keyboard interaction were checked.

The user requested removal of the final-rubric and reviewer-assignment UI. Those controls are removed. Stored rubric records, score weights and server permissions are preserved. Final computation still requires recorded Codex and collaboration/diversity marks, so events missing those records cannot acquire a final snapshot through this UI. No substitute grades, invented defaults or eligibility shortcut was introduced. Parent was informed of this exact conflict.

Owned frontend3014/backend8859 and all browser contexts were stopped after verification. No push, merge, deploy, hosted migration, provider settings or credential changes occurred in this lane.
