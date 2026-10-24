# Confirmed regression inventory

All reproductions use isolated synthetic data. No production writes or provider changes were performed. Scope is the existing release workflows; concerns that were not reproduced are not listed as confirmed bugs.

| Finding | Evidence before | Repair and verification | Current status |
| --- | --- | --- | --- |
| Admin hidden rows retain selection after status/filter changes | `evidence/admin-selection-before`; Registered+Locked moves Dave to Going, zero rows but1selected remains |4733a1d integrated740df7; selection intersects visible records, success clears, failure keeps valid selection, pending actions deduplicate | Native after-checks pending |
| Admin mutation uses self-directed Going notice | Same before capture |6180023 maps participant-bulk to Status updated and keeps success notices transient; focused feedback checks pass | Integrated |
| Legacy check-in retry uncovers old Absent override while attendance remains checked in | Independent8bfceb0, both SQLite/PGlite fail for same P2 |331d1dc integrated0ef07fa updates effective status while preserving history;27 combined cases pass | Fixed |
| Reissuing declined invitation hits unique constraint | `evidence/team-role-states/report.json`, actual409 |e9f9ae7 integrated48c041c gives fresh invitation identity and rejects stale IDs; role/lock/capacity/concurrent checks pass | Server fixed; native reissue followup pending |
| Long project name expands320px viewport and breaks touch targets | `docs/PROJECT_SUBMISSION_CREDITS_QA.md` |beac8fc wraps the dynamic field legend; actual320px Next/error/focus screenshots inspected | Fixed |
| Create-dialog error content moves outer frame; short intro needs safe footer clearance | `evidence/create-team-repair/geometry` |12de812 fixed bounded frame; final native before/busy/error and last-line checks pass | Fixed |
| Midwidth profile crosses incompatible mobile/tablet breakpoints | `evidence/responsive-profile-discovery-667222d` |cf7c222 uses consistent740/741 boundary; actual720native200 and tablet captures pass | Fixed |
| Sign-in menu accepts a pre-hydration tap without handler | `evidence/responsive-public-audit` |e4a8d9d integrated94948d8 disables menu until hydration | Delayed-chunk native after-check pending |
| Mobile admin Workspace account link returns to old route | `ddd-credit-inventory/evidence/credit-inventory-before`, actual first-tap failure |7cb01dc uses app navigation for account destinations | Native regression verification pending |
| Submission window warnings force a second Publish before confirmation | Source `app/owner-submission-window.tsx`; separate baseline diagnosis verified settings on reload | Remove intermediate review UI, retain fresh server token/version and both IST times in confirmation | In progress |

The new credit requirements address confirmed prior limitations: same-heading imports reject, later check-ins/restocks do not continuously fill the pool, and staff personal presentation can hide their own credits. Their broader approved repair has separate schema, privacy, concurrency and UI gates in `docs/CREDIT_STOCK_DESIGN.md` once integrated. No claim of a complete release is made here.
