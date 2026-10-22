# Event operator runbook

This is a **local rehearsal runbook**, not permission to launch. Live use is blocked by `SITES_INTEGRATION.md` and `SECURITY.md`.

## Before October 28

1. Resolve the submission cutoff: **15:45 / 16:00 / 17:30 IST** are conflicting drafts, not implemented defaults. Confirm event-day open time, engagement windows, appeal and judging close, non-sensitive diversity rubric, vote normalization, feedback rules, Codex reviewer, AI fallback, penalties, tie procedure, deployment alternatives, Luma requirements and privacy/contact/retention notice.
2. Save the complete draft in owner settings, explicitly confirm each decision and review the remaining blocker list. Do not activate until the owner has announced uniform rules. Activation makes the policy immutable in v1. Tested fixtures use separately labelled synthetic policies; never copy them into a real event unchanged.
3. Use fake `.test` accounts for rehearsal. Production owner/admin/judge access must come from verified ChatGPT identities through Sites. Do not promote an email supplied in a form to owner. Appoint minimum necessary staff and assign judges; use two independent judges per eligible team unless a higher confirmed minimum applies.
4. Preview the registered-email CSV (single `email` column). Fix duplicates and invalid rows. Commit the preview within 15 minutes. Existing approvals are preserved; unknown imported emails start pending. Verify which signed-in accounts matched the roster.
5. Review/approve portal accounts. Export the safe list, apply changes manually in Luma, then mark Luma confirmation separately. No automatic email or Luma action occurs.

## Team preparation

Each approved builder creates or joins one team. Teams of one through five work; a sixth concurrent acceptance fails atomically. Invites appear in the invited account's portal. Leaders submit title/core/description before **28 October 23:59 IST**. Title/core become immutable at that instant; description revisions remain audited. Membership changes stop **29 October 23:59 IST**. Public ideas remain withheld until the configured November 1 reveal. No inferred or mandatory demographic fields are used.

## Credit desk

1. Add a credit type and clear redemption instructions. Use fake values only in this rehearsal. Preview a single-column `value` CSV; values stay masked. Fix duplicates rather than reimporting blindly. No secret inventory export exists.
2. Search the approved attendee, verify physical attendance and check in using their account ID and a reason. If Luma confirmation is configured as required, check it first. A repeated tap is safe.
3. Check allocation counts. Empty inventory leaves a visible pending allocation; it never invents a credit. Add validated inventory and run allocation retry for affected users. Existing allocations are preserved, including when a new credit type is added.
4. The participant reveals only their own credit. Judges cannot open credit views. Staff do not copy codes into audit notes, screenshots or support messages.
5. **Reversal/reissue is not implemented.** Stop and escalate a mistaken check-in or issued code. Do not delete allocations or change ownership directly. A separate, audited recovery workflow must be implemented and rehearsed before live operations.

## Submission desk and evaluation outage

Leader commits a complete revision; exactly three committed versions are allowed. Invalid forms and rolled-back writes do not consume an attempt. Server time governs the exclusive cutoff boundary. Latest committed version is judged; history remains private. Revisions queue their own review records independently of evaluation success.

After cutoff, staff runs final-version jobs. Default evaluator records `UNKNOWN`/`needs_review` without external calls. A failed or invalid evaluation becomes `failed_retryable`; submissions remain saved. Do not convert outages to zero, fabricate GitHub evidence, execute repositories or infer deception. Use only the owner-approved consistent fallback. Running-job crash recovery is not automated in v1; escalate rather than silently resetting a lease.

For GitHub, review public repository creation and first commit in IST on November 1, including history/import ambiguity. Preserve evidence and appeal decisions. Metadata timestamps are not proof of code originality. Staff review is bound to the latest version. An API deduction requires an actual claimed API, human confirmation, evidence and approved penalty policy; AI reports cannot deduct points.

## Judges and reveal

Judges open only assigned teams, check conflicts, inspect the project and evidence, and enter one overall rating out of ten. All judge roles have equal weight. Notes are private. Check coverage and missing reviews. Complete feedback moderation and close engagement before final computation. Ineligible teams receive no ranked score.

Use the private result preview. If totals tie, the owner must record the complete tied group in approved rank order with policy/evidence; changes to that group's score breakdown invalidate the old resolution. Freeze only after all windows close and reviews/coverage are complete. Snapshot creation rejects concurrent scoring changes; retry review rather than guessing.

Owner freezes a private immutable snapshot, inspects/export-checks it, then explicitly publishes that snapshot. The public API cannot see staging data. After freeze, ranking writes are blocked. Publication is one-way in v1; a correction/retraction flow is not implemented, so resolve disputes first.

## Offline fallback and recovery

- Print/export safe roster, team membership and judging assignment lists before venue Wi-Fi gets busy. Record check-in on paper with staff initials/time; pause digital credit distribution while offline to prevent unaudited reissues.
- Use a restricted offline judge sheet with `team_id, judge_id, rating_0_to_10, notes, recorded_at_IST, recorder`. Never include credit codes, gender or API keys. Two staff independently reconcile it when service returns. No automatic sheet import is implemented; enter reconciled ratings through the authorized portal.
- Preserve successful participant submissions even if GitHub/AI is unavailable. Follow the announced extension/fallback policy; do not edit active deadlines directly. Keep rankings private while unresolved.
- Local synthetic backup rehearsal: `npm exec -- tsx scripts/backup-local.ts`. It refuses non-`.test` user accounts, uses SQLite `VACUUM INTO`, opens the copy and checks integrity. Hosted D1 backup/restore must use the future authorized Sites workflow and be rehearsed separately.
- After the event, export safe audit/results, limit access and apply the announced retention/deletion policy. Actual personal-data deletion and key-rotation tooling need the hosted integration work; the append-only audit/snapshot guarantees are intentional.
