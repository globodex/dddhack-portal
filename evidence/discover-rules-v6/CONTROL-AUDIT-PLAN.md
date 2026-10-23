# Discover / Rules action inventory

Prepared only; no browser or mutation has run. `qa-discover-rules-controls-v6.mjs` waits for root's matching-artifact release and `--preview-ready`. Environment overrides are the same DISCOVER_QA_SOURCE, DISCOVER_QA_WORKER, DISCOVER_QA_ARTIFACT_ROOT as the clean screenshot runner.

Input matrix: desktop1440x900 mouse, desktop1440x900 keyboard, tablet834x1194 touch, phone390x844 touch and narrow320x740 touch. Touch contexts set both isMobile:true and hasTouch:true and use tap(), then real keyboard text entry. Pointer/coarse state and maxTouchPoints are asserted, not inferred from viewport width.

Each case repeats for named synthetic member fake_alice, teamless eligible fake_pending and signed-in viewer fake_stranger. Inventory rows include source-scoped route, role/actor, input mode, viewport, control ID, observed action result and checked/untested/error/disabled state. A checked row requires an actual action plus an asserted result. Hidden controls with confirmed role/full/lock gates are disabled with availability:not-rendered, not falsely marked clicked. Missing fixture states and budget-excluded rows stay untested.

| Scope | Actual actions prepared |
| --- | --- |
| Tabs and searches | Activate People/Teams and assert URL/active state; type and clear both searches; assert empty/restored rows; keyboard Tab from search |
| People | Activate all row name and chevron openers up to24rows; assert safe native modal content; close with X/Escape and verify opener focus; test profile hash link |
| Social links | Outbound navigation remains untested due network boundary; not claimed checked by element existence |
| Teams | Activate own-team Dashboard link; open every applicable View team dialog, close with X and Escape and verify focus; verify full/locked/member/viewer gates; check pending disabled state when present |
| Membership request | Open actual confirmation and Cancel; re-read safe API to verify no request persisted; confirm/write remains untested |
| Create team | Expand/collapse, empty required-name validity through actual submit interaction, name/bio text entry, initials preview, all eight palette choices and selected fill, valid form confirmation then Cancel, values retained and no team persisted |
| Rules | Open/close each of all five summaries by the applicable input method; assert native state/list visibility, reflow, then activate Back to Dashboard |

All non-GET/HEAD and external requests are blocked. No write allowlist is implemented in this runner. Actual request/create approval, persistence/error paths and any missing pending-request fixture remain untested until root explicitly coordinates clean screenshots, disposable fixture reset and a separately bounded write phase. Cancel-only behavior is checked without approving a confirmation. The shared shell, admin, dashboard and projects inventory remain root/other-lane responsibilities.
