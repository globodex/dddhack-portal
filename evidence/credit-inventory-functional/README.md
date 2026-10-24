# Credit inventory functional evidence

Frontend source: `8875a3c4f3867910abf6a6f750e782c35de75040` (final visual fixes). Initial waiting/repair captures use `6f891f080ee4dd78c1753bbbf3155eeb7e54de04`. The reports bind backend revisions independently:7e15030 initial, a8f608f late check-in/restock,0a0b30b exhausted supplement. These are synthetic local databases only; no provider, real code, send, or production mutation.

## Actual completed sequence

- Legacy existing stock50/9/41/1; personally checked-in Admin has a pending teammate and sees Waiting for a code without a fake mask, Reveal, or Copy. Explicit Assign waiting succeeds50/10/40/0 and refreshes the already-open allocation table. Private self page uses its SSR payload without a duplicate mount GET. Stock is not requested before View stock; first open issues one bounded request, no polling.
- Ten late check-ins allocate immediately50/20/30/0. Allocation table is masked, searches the Admin recipient, supports explicit reveal, busy state, clipboard copy, hide and a visible503 retry error without exposing an unrevealed code. Icons measured18x18 after the scoped padding fix.
- Same original CSV header adds100 new rows and skips2 duplicates through the existing confirmation dialog. Heading and Markdown are read-only and preserved. The pool remains active150/20/130/0;20 existing recipient/inventory mappings are unchanged.
- Personally checked-in Admin reveals and copies only their own allocation; browser blur remasks it.
- Separate exhausted fixture5/5/0/5 shows Out of stock, no irrelevant controls, and no Assign waiting button when availability is zero. Actual restock100 produces105/10/95/0 and makes the previously waiting Admin's credit available. Available stock page2 contains25 masked rows.
- Non-checked-in self route returns403 with recovery navigation. Real screen reader testing is not claimed.

## Reviewed deliverable screens

All PNGs committed in this checkpoint were opened and inspected as pixels. Desktop,768px,390px,320px and short480px states are represented. Native200% verification of the new inventory remains for integrated QA; no claim is made for root's separately fixed shared navigation from this older isolated base.

Start with `stage2/restocked-stock-active-1440x900.png`, `stage2/restocked-stock-mobile-390x844.png`, `stage2/restock-count-confirmation-short-390x480.png`, `stage2/admin-code-reveal-error-390x480.png`, `checked-in-admin-waiting-mobile-390x844.png`, `exhausted/admin-out-of-stock-1440x900.png` and `exhausted/personal-out-of-stock-recovered-390x844.png`.

The first exhausted harness ended after a successful real restock because it searched an obsolete button label `Next page`. The corrected independent supplement uses the actual `Next stock page`, passes pagination and personal recovery, and closes its browser. This was a harness lookup failure, not a refused server operation. No retry of the restock was made.

Cold capture artifacts are deliberately excluded from the committed visual deliverables: initial desktop legacy overview, one refreshed counter frame, a short390px frame and the inline restock frame with stale compositor counter positions. Their reports are retained for request/flow timing; they are not visual acceptance evidence. Settled native-CDP overview replaces the initial desktop frame.

Reports preserve status/counts and request key names; CSV/reveal values are omitted from logs. Explicitly revealed PNG values are visibly synthetic test strings. No claim of backend-wide release readiness follows from these sequential UI cases; independent backend tests belong to the backend lane.
