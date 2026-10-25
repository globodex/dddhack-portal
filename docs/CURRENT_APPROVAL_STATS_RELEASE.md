# Current approval and basic statistics release

This release includes the previously reviewed CSV normalization, actual admin unlock, responsive canvas/hero placement, gender presentation and team preparation card. It adds the finalized basic statistics, durable sign-in evidence and the confirmed locked-team approval workflow. Advanced analytics, demographic breakdowns, scores cards, scoring changes, winner reveals and homepage additions are excluded.

## Team approval and lifecycle

Only an owner/admin can open the private team approval preview. It contains the current team, member identity/contact links/chosen profession/gender and private idea. A digest binds the confirmation to that snapshot. Atomic transaction guards reject stale authority, membership, crown, lock, profile, idea, attendance or frozen-state changes.

Only Registered members become Going. Existing Going, Checked-in and Absent states are preserved. A non-Registered member with an unapproved registration is an unresolved condition: the whole approval is blocked, rather than changing attendance or falsely approving the team. No attendance receipt, team lock, idea, project, committed version, attempt or frozen result is reset.

The derived lifecycle is Forming, Locked, Approved, Yet to submit, Submitted. Approval requires a real nonempty team whose member registrations are all approved. The lifecycle additionally requires an actual lock. Approved becomes Yet to submit when a valid saved submission window has opened; it stays unsubmitted after the window closes until a real submission exists. Existing submission/access checks still control editing and committing. Submitted remains Submitted despite display overrides. Admin unlock restores Forming without revoking personal approval. No stored window or actual cutoff is changed by these derivations.

## Whole-collection statistics

- Added manually: normalized union of the current registrations and Luma roster, including CSV and individual additions, excluding removed/terminal people. It is not a historical manual-versus-CSV split.
- Signed-in: active portal people, including Viewers, with actual session-issuance/authenticated-request evidence. This does not grant roster membership, approval, engagement, venue or credit access. Profile completion is irrelevant.
- Going and Checked-in are separate effective-status groups. Checked-in requires attendance evidence. Reconciled absence and manual-status precedence remain intact.
- Pending people: only unapproved current roster members of pending teams. Approved teammates and teamless people are excluded. Approved Absent people are not pending.
- Teams formed/locked/approved/pending: current extant teams; approval uses the existing member registration flags and is independent of lock. Thus all-approved unlocked teams count in the approval card while their lifecycle remains Forming. Empty teams are pending and excluded from the Solo/2/3/4/5 size bins.
- Projects: distinct active projects. Submissions: visible committed versions. Drafts: active projects with neither any committed history nor a positive durable attempt. Editing a submitted project's working copy is not another never-submitted draft.

## Sign-in history limitations

Auth-user rows alone are not proof of issued sessions. A deterministic immutable audit marker is written atomically with new session issuance, or from an actually authenticated verified request. Existing retained matching sessions, including expired ones, are provable evidence. Their evidence is retained before session cleanup, rotation or logout deletes it. Markers contain only an existing user ID, evidence kind/version and observation time; no raw token, email, provider response or IP is logged. Observation time is not a fabricated first-login timestamp. Marker writes are idempotent.

Previously logged-out or cleaned-up accounts may have no recoverable evidence. Their existence is not silently counted as a successful sign-in. The card reports a confirmed lower bound when some evidence exists, and an unavailable historical count when none can be proven. A genuinely empty matching population displays zero. No new tracking table, schema migration or provider permission is introduced.

## Owner-operated rollout

Keep the currently working APP_ORIGIN, NEON_API_ORIGIN, private environment file, linked Neon context and credentials. This release does not request DNS or provider changes. The browser source derives public URLs from configured APP_ORIGIN.

The earlier append-only0106 unlock migration is still required where pending. Use the existing strict procedure in NEON_POPULATED_UPGRADE_PLAN.md: verify source, independently verify the intended direct target, retain a current verified backup/restore checkpoint, obtain a fresh private receipt, apply only pending migrations, then inspect again. Nine entries need0104/0105/0106; ten need0105/0106; eleven need0106; twelve need no apply. Preserve historical ledger rows and checksums, including recognized exact legacy CRLF history. Never use a synthetic flag, reset, checksum edit or backup bypass.

After publication and the schema check, from the existing linked Windows repository:

```powershell
$portalApiBuild = .\scripts\prepare-backend-windows.ps1 -ArchivePath .\artifacts\neon\portalapi.zip
neon functions deploy portalapi --src $portalApiBuild.SourceDirectory --no-bundle --runtime nodejs24
```

The final archive/helper hashes must match the release receipt. Do not run npm install inside the extracted ARM64 package. Do not use a deployment --env argument or replace the current configuration. The owner runs all hosted migrations and backend deployment; the coding worker does neither. New stats and approval features require the matching backend, so frontend publication alone is not completion of backend rollout.
