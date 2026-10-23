# Common, Home, Profile and Dashboard controls

Built source: `8e90450443fd3dc61ddad88448ca4cec8395d494`.
Compiled Worker: `901580c960143319604987bfb37f67e336b5bd228c0d6d8244dcd87515daea13` before and after both runs.

Sandboxed Chromium used fresh synthetic contexts at mobile 390 × 844, tablet 834 × 1194 and desktop 1440 × 900. Mobile and tablet used touch and corresponding Android/iPad user agents. This is browser emulation, not physical Android/iOS testing. Browser closure is confirmed for both receipts.

The first run recorded 298 checks: 277 positive, 12 harness failures, six fixture-limited and three delegated. The focused Home recheck recorded 50 positive checks and resolved all 12 initial harness failures. The latest results are 289 positive, six untested and three delegated. There were no JavaScript page exceptions or unexpected mutation attempts. This is not an all-controls acceptance claim.

## Verified

- Exact anonymous “Continue with ChatGPT” tap reaches a locally intercepted sign-in boundary. Exact signed-in “Open your Dashboard” taps reach `/dashboard`; Alice, Bob, admin, owner and judge retain their named fake identity. Stranger, mentor and volunteer reach the expected Luma email access boundary.
- Public/drawer menu toggles; pause/resume; all seven FAQ details; Register external boundary; animated schedule cue by trusted touch/mouse coordinates with center hit testing.
- Dashboard Team/Credits/Project tabs and panel/hash state; desktop arrow/Home/End keyboard selection; private-data boundaries; Alice's three WhatsApp links, social links and Maps destinations blocked before external fetch.
- Fake allocation reveal, clipboard copy and clearing, Hide, tab-switch masking, controlled reveal failure/recovery, controlled clipboard denial. Nine actual POSTs were exclusively `fake_alice`, `reveal-credit`, `fake_credit`. No allocation value was logged or photographed.
- Versions history open/close, Escape, focus return, controlled history failure, read-only Dashboard vote boundary, controlled Dashboard error and Try again.
- Profile eight expressions and eight colors; required name/phone validation; read-only email; next/back retention; added social row, native platform selection and added-row trash removal; About selection and organization fields; external Find organization ID boundary; Save controlled 503 and retained values. No `complete-profile` request reached the backend.

## Corrections and limits

The animated scroll cue continuously moves, so Playwright's stable-element scroll helper timed out. A focused trusted coordinate tap succeeded in all three modes. This was a harness assumption, not evidence of a failed user tap.

The stranger, mentor and volunteer fixtures have no Luma roster entry. Their `/dashboard` access boundary is expected; mentor/volunteer authorized Dashboard controls remain untested with these identities. No roster was edited.

Individual drawer links, brand/skip links, Log out, Bob's WhatsApp links, original prefilled social-row deletion, Male/Female, and every native select option were inventoried but not exhaustively activated. Team-forming controls and project editor controls belong to other lanes. The inventory preserves these gaps. A positive inventory entry proves an action in at least one recorded state, not every state listed for that control.

## Evidence

Canonical machine-readable route/role/input/control inventory: `8e90450-control-inventory.json`.

Raw main receipt: `8e90450-5y2S6m/report.json`. Raw focused receipt: `8e90450-zf9qwL/report.json`. These preserved local receipts include state-by-state inventories. The 12 initial failures remain visible and link to their successful focused rechecks in the canonical receipt.

Nine main-run screenshots were inspected directly: Home, masked Alice Dashboard and original Profile at all three sizes. No clipping or overlay defect was visible in these captured viewports. Main screenshot directory: `8e90450-5y2S6m/`. PNGs remain local and are not committed. No screenshot upload or visual acceptance is claimed.
