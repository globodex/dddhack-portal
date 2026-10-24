# Admin terminal deletion browser proof

The independent browser pass completed 15 checks with no page errors, using actual Next 16 webpack pages and the real portal API against a fresh synthetic SQLite database. No hosted data, actual credentials, provider requests, or production writes were used. Screenshot bytes remain outside Git.

## Source provenance

| Coverage | Local detached source | Root change |
| --- | --- | --- |
| Confirmation, cancellation, persisted cascades, bulk and quick check-in | `7e09d6c98bc5f64640a78c9950979d3ebee09b14` | `decaf6c6173195d05cd8a55c02c2a0550646e291` plus `53f417d33f2e01a5cdf581a55a3ea4a1c47aa16c` |
| Local error feedback, ordinary short-screen tap | `f6cd4137409dae6a721c6eb660b4615b9283d429` | `16484f57f0c9ab8223add6c71bcc010b7872a1ed` |
| Rapid confirmation clicks, pending menu guard, final mobile feedback and touch cleanup | `0d8929f49d29ddae5562df742c81e6e9e1272f80` | `d010c80a439af207d7df921467ae59a162a9fc31` |

The backend cascade was unchanged by the two later UI fixes. Those fixes were verified through focused browser checks without repeating committed deletion requests.

## Verified behavior

- The active leader menu and confirmation name the participant and their team, describe all-submission deletion and irreversibility, and start focus on Cancel. Cancel sends no POST; Tab cycles within confirmation, then focus returns through the nested menu to its opener.
- Staff and the current admin have no Delete control. A legacy removed participant retains one Delete bin alongside the separate Restore action. The selected-participant bulk controls have no Delete action.
- Bulk approval still requires confirmation. Cancel sends no POST; the subsequent confirmed synthetic approval persists. Quick check-in requires one click, sends one POST under double-click pressure, and persists in `check_ins` without a confirmation.
- Confirmed nonleader deletion sends one POST with an empty `expectedLeaderTeamIds` array. Its terminal marker persists, profile and registration disappear, and the existing team and its other members survive.
- Confirmed leader deletion sends one POST with `expectedLeaderTeamIds: ["fake_team5"]`. Its locked team, idea, project, all three committed versions, and memberships disappear. The other four members and profiles survive as teamless participants. The immutable submission-attempt ledger remains **3**.
- Separate team deletion sends no POST on Cancel and one on confirmation. Its project and both versions disappear, its member survives, and its attempt ledger remains **2**. Each actual deletion has exactly one audit row. SQLite integrity and foreign-key checks pass.
- At 390×844 and 320×480, rapid confirmation clicks send one intercepted request. While held, the underlying menu stays open, Close is disabled, and Escape cannot dismiss it. A simulated 503 then produces exactly one inline error, no global error toast, an enabled retry, and unchanged participant records. Retry confirmation Cancel restores focus.
- The 320×480 team menu fits within 381 pixels. Confirmation and nested Cancel/Escape return focus correctly. A genuine Chromium-emulated touch swipe after closure scrolls the page from 0 to 279 pixels, proving the background scroll lock is released. Checked dialog/page states have no horizontal overflow.

Participant terminal deletion intentionally retains the minimal `users` identity required by authentication and immutable audit foreign keys. Persistence checks assert erased portal data and terminal markers rather than physical removal of that identity row.

## Verified screenshots

[Download the PNG-only evidence ZIP](https://filebin.net/ddd-admin-deletion-20261024-0d8929f-b4c91e/admin-deletion-browser-proof-0d8929f-png-only.zip) (22 inspected screenshots, 1,119,478 bytes; Filebin expiry: 2026-10-31 22:25:36 UTC).

SHA-256: `3db266bb373984a87e859de3049e0c4eac4f31b8576dca9514da853c492eb4c6`.

The upload returned HTTP 201. A separate download returned HTTP 200 and matched the ZIP checksum and all 22 individual PNG checksums. ZIP entry names are scoped by source SHA. The archive contains only PNGs showing fake fixture identities; it excludes databases, logs, configuration, scripts, failed diagnostic captures, and superseded duplicate-error screenshots. The adjacent JSON records every included file's source, dimensions, and hash.

Full local evidence and QA harnesses remain in `/tmp/ddd-manage-qa-7e09d6c-final` and `/tmp/ddd-manage-*-qa.mjs`. Earlier harness assertions were corrected to reflect the command-owned `check_ins` table and retained audit identity; a read-only navigation retry completed persistence verification after a client-refresh race. Those diagnostics remain local.

Owned Next/backend processes were stopped and ports **3035** and **8895** verified closed. Restore/reversion semantics were not implemented. Browser coverage uses local fixture cookies and touch emulation; hosted authentication, physical devices, and browser Back during a pending operation were not tested. The container cannot launch Chromium with its OS sandbox, so recorded browser test contexts were restricted to the synthetic loopback origin with external requests blocked.
