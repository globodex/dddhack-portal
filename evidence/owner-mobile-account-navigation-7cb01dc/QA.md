# Owner mobile account navigation: failure reproduced

Actual source HEAD: `7c1103798170138d5ae696d9ce9bb3a985d7ee69`, containing navigation change `7cb01dca612a279eee233f671937f546da6a1838`. Before launching, the exact shared dialog-history, mobile-navigation and client-router files, plus the account-menu/navigation slice of `portal.tsx`, matched the supplied fix. Those fingerprints are recorded in the [machine report](report.json). Unrelated publish-warning work shared the source tree; the captured navigation implementation is identified separately.

One synthetic owner context at 390×844 opened `/admin/credits`, opened the menu, and tapped Workspace **exactly once**. Expected `/dashboard`; actual URL remained `/admin/credits` throughout the 20-second check. No second tap was attempted.

## Actual trace

Times below are relative to the single Workspace click:

| Time        | Observed event                                                      |
| ----------- | ------------------------------------------------------------------- |
| −204.8ms    | Menu's dialog history marker pushed on Credits                      |
| 0ms         | One click on Workspace, `href="/dashboard"`, inside the menu        |
| +65.1ms     | Dialog cleanup calls `history.back()`                               |
| +73.2ms     | `popstate` returns to the unmarked Credits entry                    |
| +112.6ms    | History is replaced with `/admin/credits`                           |
| +20 seconds | Credits remains displayed; Dashboard was never committed to history |

A real GET fetch for `/dashboard?_rsc=…` was requested after the click, so the tap did initiate routing. The trace is consistent with cleanup's history Back interrupting the pending route. The exact framework-internal cancellation reason is an inference; the failed first-tap outcome and history sequence are directly recorded.

- [Before: owner Credits](https://github.com/Param302/dddhack-portal/blob/6fcb7d5be117d234ae60a4a4b04af966f9134af8/evidence/owner-mobile-account-navigation-7cb01dc/01-owner-credits-before.png)
- [Menu: Workspace visible](https://github.com/Param302/dddhack-portal/blob/6fcb7d5be117d234ae60a4a4b04af966f9134af8/evidence/owner-mobile-account-navigation-7cb01dc/02-owner-menu-workspace.png)
- [After one tap: still Credits](https://github.com/Param302/dddhack-portal/blob/6fcb7d5be117d234ae60a4a4b04af966f9134af8/evidence/owner-mobile-account-navigation-7cb01dc/workspace-FIRST-TAP-FAIL.png)
- [Final failure frame](https://github.com/Param302/dddhack-portal/blob/6fcb7d5be117d234ae60a4a4b04af966f9134af8/evidence/owner-mobile-account-navigation-7cb01dc/workspace-FINAL-FAIL.png)

All four original PNGs were opened and visually inspected. They show the expected source state, the actual link and the failure without hiding any application content. The development overlay alone is hidden in captures.

## Scope and next check

The `Link`/`onNavigate` change alone does not resolve this first-tap race. Root was notified immediately after the browser closed. No production code or shared history helper was changed by this audit lane.

The runner deliberately stopped at the real failure, so Your profile first tap, the subsequent normal Back path, and menu Escape/scroll/focus restoration remain **untested in this run**. They must be checked after the coordinator's next source change. This is a failure report, not a passing navigation audit.

There were no page errors, blocked requests or application mutation attempts. The request guard allowed only local GET/HEAD plus development source reads. No Save, reveal, import or Logout control was activated. All browser contexts closed before releasing the slot. This was emulated touch against a disposable local fixture, not production identity or a physical device.
