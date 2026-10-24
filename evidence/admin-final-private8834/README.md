# Final private-backend admin proof

Root source, portal SHA-256, actual requests, geometry and outcomes are in [report.json](report.json). All **four interaction groups passed**, with **nine original PNGs** opened and inspected, no errors, and all browser contexts closed.

- [Idle](quick-idle-320.png) and [pending](quick-pending-stable-320.png) at320 x480 have identical CTA rectangles: x130.25/y294/width132/height44. A labeled1200ms transport delay exposed the pending state. Double click sent one quick-check-in request and opened no confirmation.
- [Persisted attendance](quick-persisted-checked-in.png) clears selection and replaces the action with the checked-in indicator. [Status menu](quick-fresh-status-dropdown.png) now defaults to **Checked in** after persistence.
- [503 failure](one-error-selection-retained.png) displays one full persistent error, keeps the selected row and filters, and allows retry. The local duplicate is gone.
- One Publish click obtained current guards and opened [the confirmation](date-first-click-confirmation.png), with both IST times and server warnings visible. No date write occurred before Confirm. Confirm sent one publish action, with `windowWarnings` excluded from the strict backend payload.
- Backend read and [reload](dates-persist-after-reload.png) show **24October2026,08:00IST →1November2026,20:00IST**. The reload PNG caught protected SSR before hydration, so its gray controls are not presented as a client-ready state. A read-only ready-frame retake remains planned.
- [Alice input proof](alice-project-input-editable-no-save.png): actual leader Project name input enabled, editable and focused. A fresh Alice context blocked every non-GET request. No Save/Submit occurred; attempts remained **2 of3**.

This job used root's private8834 SQLite copy only. Carol and Dave were restored to Going with null active attendance; their existing server-preserved history was retained. The requested private date window remains published for review. No identity, team, production data, provider setting, credential, main branch, merge or deployment changed.

For the original stale-selection defect, use [actual baseline](../admin-selection-before/README.md) and the earlier after-state screenshots in `admin-selection-after`. Those include the exact real Registered + Locked zero-row case. The new check-in indicator uses All statuses/All people because existing team semantics derive **Not submitted** on attendance, so a Locked filter correctly hides that team.
