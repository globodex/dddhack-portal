# Hackathon outage fallback

Source baseline: `7fd4016ce9a2156d13de4d600818ae0aad9e7ff5`. This is an operating guide, not a capacity or readiness guarantee. It does not authorize production exports, external services, new credentials, deadline changes or scoring changes.

## While the portal works

Use **Participants** to add roster entries, approve **Going**, and record verified attendance with **Check in**. V7 derives availability from actual prerequisites and does not require operational-readiness checkboxes. A team **Locked** label is separate from personal approval and attendance. The bulk attendance action does not itself allocate credits.

Use **Teams** for membership and lock checks. Use **Credits** to review and explicitly publish the intended credit batch. Participants access their own assigned credits in Dashboard. Never put credit values in screenshots, paper attendance sheets, ordinary exports or audit notes.

The personally checked-in team leader submits through Dashboard during the configured window. Confirm the committed version in history. Only three committed versions are allowed; a saved draft is not a submitted version.

Use **Submissions → project → Review** for version-specific eligibility, private feedback and manual scores. Every admin can score directly without an assignment; separately appointed judges/mentors retain their assigned access. Use **Settings → Results visibility** only when its actual prerequisites are satisfied. Follow the existing scoring baseline in [v7-scoring-baseline.md](v7-scoring-baseline.md); this guide changes no weights.

## Start fallback deliberately

The designated admin records the outage start, affected action and a single reconciliation owner. Tell the desk and team leaders which actions are paused. Keep one controlled local or paper ledger; do not create a new live personal-data export or introduce another online service.

Use event IDs already available to the authorized desk. Record the minimum evidence needed. Do not copy phone numbers, private ideas, voucher values, credentials or full account profiles into the fallback ledger. If identity or approval cannot be verified, mark the entry **pending verification**.

Assign a stable receipt ID, such as `EVENT-DESK-000123`, to each accepted offline item. Record its type, event/team or participant ID, recorder, received timestamp with UTC offset, evidence reference and reconciliation state. Give the sender the same receipt ID on every acknowledgment of that item.

**Accepted offline** means received into this ledger. It does not mean a portal write, approval, check-in, submission or credit allocation succeeded. Receipt IDs are an offline deduplication convention; current submission and attendance APIs do not accept them as universal idempotency keys.

## Attendance and credits

Physically verify the attendee against the already authorized information available at the desk. Record receipt ID, event participant ID, arrival time with offset, operator and verification state. Do not mark someone Going or promise admission from an unverified offline name.

Pause digital credit distribution while its outcome is uncertain. An attendance receipt is not a redeemable voucher. Preserve existing allocation ownership. Do not promise revocation of redeemed codes, recovery of exposed values, automatic reissue or provider-side cancellation; these are not established recovery capabilities.

## Submission collection

Accept the package from the team leader through the locally announced collection desk. Record team/leader IDs, receipt ID, the leader's known committed-attempt count, declared attempt, received timestamp with offset, repository URL, exact commit SHA and a checksum of any locally received file. Keep the submitted bytes unchanged in restricted local storage.

Record the clock source. If the desk clock or network time is uncertain, record that uncertainty beside the original timestamp. Preserve the original receipt and all revisions. Do not backdate a portal record, rewrite repository history, or silently treat a late package as on time.

Maintain one history per team with at most three accepted submission versions across confirmed portal history and offline receipts. An identical retransmission with the same receipt ID is the same item, not another attempt. Any changed payload must be a separately recorded revision, subject to the same three-version limit. If the prior count is uncertain, collect provisionally and resolve the count before accepting another version.

Use the announced submission window. An outage does not automatically extend it. If restoration occurs after the cutoff, retain the evidence for an explicit owner decision under the announced fallback or appeal policy. Do not bypass the leader check, borrow an account, change server time or alter the deadline to force a commit.

## Uncertain writes and restoration

After a timeout, interrupted confirmation or lost response, mark the outcome **uncertain**. Check the existing participant state, submission history/version ID or batch publication record before retrying. A spinner, a clicked button, an offline receipt or an absent success message is not proof that a write failed.

The reconciliation owner matches each receipt to existing portal records first. Record the confirmed portal ID, action and evidence against that receipt. If the write already exists, acknowledge it and close the receipt without submitting again. If the outcome remains unknown, keep it pending; do not repeatedly click or issue a replacement allocation.

For a demonstrably uncommitted item, use the authorized current workflow once. The checked-in leader must perform a permitted submission; an admin receipt is not a proxy submission grant. Preserve the original offline time separately from the later server commit time. Do not overwrite all participants, projects or scores from a spreadsheet.

Have a second staff member compare the reconciled receipt, target identity, version/attempt count and resulting record. Close the receipt only after that check. Keep unresolved conflicts and missing evidence visible to the designated admin.

## Manual judging and results

Give assigned, non-conflicted judges the same immutable version and evidence for each team. Record reviewer ID, team/version or receipt ID, manual mark **1 to 10**, private notes, time with offset and recorder. Use the existing portal scale; do not invent weights or redistribute missing AI points.

An unavailable AI service is unverified evidence, not zero and not an automatic false-claim penalty. Preserve the submitted work. Keep manual marks and proposed rankings private until the announced fallback, required reviews and result prerequisites are resolved. A fallback sheet is not a frozen portal snapshot or a published result.

After restoration, reconcile each authorized review against the exact committed version before entry. Preserve any earlier review history. Resolve discrepancies with the assigned reviewer and designated admin; do not bulk overwrite marks or reveal winners from an incomplete calculation.

## What the old local load result proves

The recorded workload used a synthetic dataset of **300 participants and 90 teams**, with **1,986 requests**, zero unexpected errors and at most **16 simultaneous requests**. Those population counts do not mean 300 simultaneous users were tested.

That run used a disposable local compiled Worker and local D1. Its improved read p95, approximately **283 ms** at concurrency 16, is not hosted capacity, venue-network resilience or a guarantee for today's build. See [the exact source-bound report](load-300-after-public-batching.json). Do not run live load against production as part of fallback preparation.
