# Owner setup after the core release

This is an instruction/checkpoint document only. No live policy, roster, venue, role or credit was changed. The public release remains the independently frozen source `f1a4b3d`; this export follow-up has not been deployed.

## Registration and teams do not require judging activation

1. Sign in using the existing authenticated owner account and open **Participants**.
2. Open **Add emails or import a roster**. Paste authorized emails, upload email-only CSV, or map actual headers from the full registration CSV. Review new/existing/invalid counts, then confirm the add-only import. Existing profile/status/check-in values are preserved and removed accounts are not restored. This document does not authorize importing any real rows.
3. Roster-matched people can complete the three profile steps, then create/join a team, save the private idea and lock it. An unlisted signed-in person remains a Viewer. Teams can form/lock before individual Going approval. Locking does not approve members.
4. Admins review the **Registered + Locked** participant view, then explicitly approve individual attendees to Going. No automatic Luma update or role grant is part of this flow.

Unresolved AI/rubric/diversity/Codex/feedback-point definitions do **not** block profile completion, registration or team/idea flows. They continue to block dependent final scoring/reveals.

## Submission/check-in setup: exact current UI and its gap

1. Open **Settings → Submission window** as owner. Default public window is1 November2026,08:00–16:00IST. Verify the opening and closing values, preview the exact IST dates, enter the reason and confirm publication only when intended. The backend stores UTC and requires open<close. This initializes an inactive draft when none exists. Testing uses real attempts; the separate repository cutoff stays strictly after1 November08:00IST.
2. Read **Operational and scoring readiness**. Submissions require only submissionOpen, submissionCutoff, deploymentRule and privacyRetention confirmations, a nonempty retention notice and a valid window. Check-in requires only lumaPolicy and privacyRetention confirmations, a nonempty retention notice and portal Going rather than Luma approval. Scoring flags are a separate gate.
3. Once each scope is configured, its **Enable submissions** / **Enable check-in** button appears. The owner enters an enablement reason and confirms the custom dialog. Each scope is independent; enabling one must not enable scoring or the other scope. This document does not authorize enabling either live scope.
4. Submission writes still require a personally checked-in leader, the configured server window, valid project fields and fewer than3 immutable committed attempts. Any teammate check-in can unlock team project reading; it does not authorize another member to submit. Check-in applies the individual portal approval rule.

**Current UI gap:** `f1a4b3d` has no owner form for setting the required operational confirmation flags/retention notice. Defaults already contain the confirmed window, optional deployment rule and portal-only attendance rule, but deliberately do not auto-confirm privacyRetention. Thus on a fresh event, publishing the window alone will not make the enable buttons available. There is also no separate Initialize event button; the window publication creates the inactive draft. The owner-authenticated backend supports explicit draft initialization/settings and independent activation, but there is no honest click-only Settings procedure for the missing policy confirmation step yet. A small owner-only operational-confirmation form is a follow-up; do not use all-policy activation or mark unresolved judging choices confirmed to work around it. This gap does not block the registration/team steps above.

The approved retention decision is indefinite retention until authorized manual removal, with private fields access-controlled and secrets excluded from logs/ordinary exports. There is no90-day automatic purge.

## Private venue entry

1. Open **Settings → Private arrival details**, using the existing owner session or an already specifically authorized operational venue admin. Ordinary admins without this permission cannot manage the field.
2. Fill **Exact room or entry location**, **Private directions** and **Private Google Maps URL** using the user-supplied private values in the trusted conversation, including the latest floor correction. Do not put room, entry instructions or the private Maps link into **Public event content**, source files, migrations, metadata or a public screenshot.
3. Enter the reason, choose **Save draft**, and confirm the exact private target. Saving a draft does not publish it.
4. After the saved revision reloads, choose **Publish saved draft** and confirm. Unsaved edits must be saved first; the button is disabled while local fields are dirty. The revision check prevents publishing a stale version.
5. Published private arrival details are returned only to personally Going/Checked in people with current approval, plus the owner/specifically authorized operational admins. Registered people, Viewers, public home/SSR, sitemap, ordinary exports and public metadata never receive them. Revoking personal approval/access removes disclosure on the next server request.

The current executor has no supported browser/owner application session. A Site source-write credential only pushes source; it cannot authorize an owner application-data request. Consequently the actual supplied venue values remain unset. The private fields and publishing controls exist; this is an authenticated data-entry limitation, not a missing value or a request to supply it again.
