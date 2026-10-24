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

Idea editor/saved/lock and current role variants continue in the next checkpoint. Functional test results are not a substitute for those missing native screenshots.
