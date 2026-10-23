# Owner setup after the core release

This is an instruction/checkpoint document only. No live policy, roster, venue, role or credit was changed. The public release remains the independently frozen source `f1a4b3d`; this export/operational-setup follow-up has not been deployed.

## Registration and teams do not require judging activation

1. Sign in using the existing authenticated owner account and open **Participants**.
2. Open **Add emails or import a roster**. Paste authorized emails, upload email-only CSV, or map actual headers from the full registration CSV. Review new/existing/invalid counts, then confirm the add-only import. Existing profile/status/check-in values are preserved and removed accounts are not restored. This document does not authorize importing any real rows.
3. Roster-matched people can complete the three profile steps, then create/join a team, save the private idea and lock it. An unlisted signed-in person remains a Viewer. Teams can form/lock before individual Going approval. Locking does not approve members.
4. Admins review the **Registered + Locked** participant view, then explicitly approve individual attendees to Going. No automatic Luma update or role grant is part of this flow.

Unresolved AI/rubric/diversity/Codex/feedback-point definitions do **not** block profile completion, registration or team/idea flows. They continue to block dependent final scoring/reveals.

## Submission/check-in setup in this follow-up

The currently live version5 does not yet contain this new control. These are the exact steps once this tested follow-up is published; no live operation has been performed.

1. Sign in as the existing owner and open **Settings → Operational setup**. Choose **Submissions** or **Check-in**. Review the displayed rules for that scope and the shared indefinite-retention/private-field notice. The confirmation checkboxes start unchecked.
2. Explicitly check both statements, then choose **Preview operational setup**. Preview is read-only. Changing the scope or checkboxes discards the preview.
3. Review the exact operation/window/notice and choose **Review and save confirmations**. The accessible custom dialog defaults safely to Cancel; confirm **Save these confirmations** only when intended. A fresh event is initialized as an inactive draft. Existing enabled scopes, dates, scoring definitions and weights are preserved. Saving never enables an operation.
4. In **Operational and scoring readiness**, the selected configured scope now exposes **Enable submissions** or **Enable check-in**. Confirm that separate operation-specific dialog. To configure/enable the other scope, repeat with its current policy version. Enabling one never cross-enables the other or confirms judging rules.
5. If dates need changing, use **Submission window** to preview/publish opening and closing values in IST. Defaults stay1 November2026,08:00–16:00IST until explicitly changed; backend stores UTC and requires open<close. Real testing consumes real immutable attempts; repository creation AND first commit must still be strictly after1 November08:00IST. Record removal cannot reset attempts or waive that rule.

Submissions require only confirmed submissionOpen/submissionCutoff/deploymentRule/privacyRetention, a nonempty retention notice and valid opening/closing window. The setup form applies the user-confirmed optional deployment rule. Check-in requires only lumaPolicy/privacyRetention, the notice and individual portal Going approval; Luma is registration only. The form accepts neither arbitrary confirmation flags nor scoring-policy/weight/activation fields. False or missing acknowledgements, stale/mismatched previews, non-owner requests and cross-origin mutations are rejected server-side.

The actual submission write still requires a personally checked-in leader, the enabled server window, required project fields and fewer than3 committed versions. Another teammate checking in unlocks team project reading, not submission authority. Unresolved judging/AI/scoring definitions remain unchanged and separately gated. Profiles, teams and ideas do not require these operation scopes to be enabled.

The retention notice is the confirmed indefinite retention until authorized manual removal, with private fields access-controlled and secrets excluded from logs/ordinary exports. There is no90-day purge. This closes the known owner confirmation UI gap; it does not activate live settings by deployment or by rendering Settings.

## Private venue — protected configuration still pending

The latest user instruction removes the private-arrival and venue-permission editors from Settings. The data and existing server authorization remain intact. The supplied private values, including the floor correction, have not been put in source, migration defaults, metadata, screenshots or live settings.

A supported authenticated owner/scoped-operator setting route is still needed to enter/publish these values without restoring rejected UI clutter. The executor has no supported browser or owner application session. A Site source-write credential cannot authorize application-data writes. Do not ask for the values again or substitute a source push for an authenticated setting change.
