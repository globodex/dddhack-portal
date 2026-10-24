# Final Team role coverage

The completed independent Carol sequence is in [accepted-lock](accepted-lock/README.md), source `182c2bd2077d139a7b5f50b89e9730e5961e397c`: 22 inspected native PNGs covering removal, outgoing/incoming invitation, corrected accept/decline dialog target, acceptance, saved idea, lock confirmation, locked leader/member, full-team limit and registered-email gate. All five actual mutations returned200. [Private idea editor and saved member states](idea-saved/README.md) add four source-bound PNGs, including the 500-character editor on a short viewport.

The first checkpoint below preserves Pending's real decline outcome and subsequent409 conflict. Leave is N/A in the existing contract. These limitations were reported and were not bypassed.

# Team role visual states, checkpoint 1

Runtime source `244d68febfea4a7ba7ff5966001310db107c7828`. Real Next frontend on localhost:3000 and isolated synthetic API8821. Existing owner status action set `fake_pending` Going as local fixture setup because legacy invitation/response requires approval. No provider, original API8789 data or Alice project changed.

Captured and inspected actual pixels:

| State | Evidence |
| --- | --- |
| Unlocked leader | [Desktop](leader-unlocked-1440x900.png) |
| Outgoing invitation after successful send | [Mobile](outgoing-invitation-mobile-390x844.png) |
| Incoming invitation | [Mobile full page](incoming-invitation-390x844.png) |
| Decline confirmation | [Short mobile](decline-confirmation-short-390x480.png) |
| Declined outcome | [Mobile full page](declined-outcome-390x844.png) |

Actual responses: invitation 200, decline 200, then re-invitation 409 CONFLICT. The response states that no changes were committed. The unique `(team_id,user_id,kind)` constraint conflicts with the existing insert-only invitation path after a declined row. The re-invitation was not retried, and no invitation history was deleted. See [raw report](report.json). Bob/Common Ground remains unlocked with its three original members; Pending remains teamless. Acceptance and removal dependent on that invitation are not captured at this checkpoint.

There is no member Leave team UI/action in the existing application. `remove-workspace-member` authorizes only leader/admin/owner. A self-leave confirmation/outcome is therefore unavailable without a permission/domain change; no such action was invented or sent.

Two full-page captures from a scrolled position, `outgoing-invitation-1440x900.png` and `failure.png`, show fixed shell elements midway through the stitched page. They are preserved as **rejected capture artifacts**, not passed layout evidence. Subsequent full-page captures will scroll to the top first. The valid viewport/mobile evidence above does not have that artifact.

The independent Carol acceptance/removal and idea/lock visual states are now captured in the later checkpoints linked above. The Pending re-invite conflict remains separate from that successful path.
