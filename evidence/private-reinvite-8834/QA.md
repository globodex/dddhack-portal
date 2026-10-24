# Local invitation decline, fresh resend and acceptance

Source: `dccfdc2a692fde35e77434050b0d03c305d7fd1c`. Actual root Next frontend `http://localhost:3000`, disposable synthetic backend **8834**. Captured at **390×844**, October 24, 2026. Original PNGs are preserved; all six outcome screenshots were opened and visually inspected. Both browser contexts are closed.

The four actions used the existing visible form/buttons and their native confirmation dialogs. Each returned actual HTTP **200** and was followed by a fresh persisted dashboard GET:

| Action | Persisted outcome |
| --- | --- |
| Bob sends invitation | `073ad027-2754-4f68-ba58-f0450ba5132e`, pending |
| Pending declines | Recipient remains teamless; no pending invitation |
| Bob resends | New ID `ed48ba9d-aeac-407a-8325-656e47b23f2c`, different from first |
| Pending accepts fresh invitation | Both actor views show Bob, Carol, Dave and Pending; team count **4/5** |

The report contains 12 passing checks, including the two baseline checks repeated after the safe continuation (10 distinct checks), exactly four invitation POSTs, zero blocked requests and zero page errors. A request allowlist required exact actor/action/payload for each mutation. Source fingerprint comparison confirmed the frozen app/lib/neon source before and after this flow. No Alice, project, scoring, team-lock or external/provider actions occurred. No extra stale-ID UI POST was attempted; independent SQLite/PGlite regression tests cover rejecting old invitation IDs.

One existing `admin-status` Going setup returned200 in each of two earlier setup attempts. Those are recorded separately; the final four-action report performed no status setup because the dashboard registration was already approved. These were disposable local fixture writes authorized by the parent. The fixture invitation response explicitly reports no email sent.

## Original outcome screenshots

- [Invitation sent, Bob](01-bob-first-invitation-sent.png)
- [First invitation available, Pending](02-pending-invitation-before-decline.png)
- [Declined, recipient remains teamless](03-pending-declined-teamless.png)
- [Fresh invitation sent, Bob](04-bob-resend-success.png)
- [Fresh invitation available, Pending](05-pending-fresh-invitation.png)
- [Accepted, four current team members](06-pending-accepted-team-members.png)

The two pending-invitation images show the panel after scrolling into view; its top edge is beneath the sticky header, while the team name and both actions are visible. These are outcome evidence, not a new complete responsive audit. Synthetic member phone/social details become visible only after current membership in the final frame. The final toast overlaps a portion of the last member's social row, but the full fourth member and 4/5 count are visible.

## Harness failures preserved, not product failures

- `../private-reinvite-8834-setup-attempt/`: uninitialized permit assertion stopped before invitation trigger. Its blank PNG is the unused recipient tab, inspected and rejected as UI evidence. The dashboard profile-vs-dashboard status lookup was corrected; no uncertain invitation mutation was retried.
- `../private-reinvite-8834-selector-attempt/`: actual dialog correctly read **Send team invitation?** / **Send invitation**. The harness incorrectly expected generic **Confirm change**. Its screenshot was viewed; no invitation POST occurred.
- [FAIL-current-ui.png](FAIL-current-ui.png): after the first invite and decline had both committed200, the harness unconditionally tapped an already-open disclosure, closing it before email fill. The screenshot was viewed and confirms a closed Team settings panel, not an unavailable invitation action. The script resumed only resend/accept after checking persisted teamlessness and the two committed responses. It now checks the disclosure's `open` state before tapping.

The response waiter catches its own rejection so it cannot mask an earlier interaction error by closing the browser. None of these harness failures is counted as a passing screenshot or an application defect. The final report keeps their classification and original source. Native Library upload was unavailable in the parent workflow; these accessible original repo files are the delivery fallback.
