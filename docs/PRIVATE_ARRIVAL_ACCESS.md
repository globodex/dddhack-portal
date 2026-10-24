# Private arrival access

Base audited: `3fee26d8c5a352c9ef829929ee64f2576c4b3a22`.
All test locations are clearly synthetic. No live venue configuration or hosted
participant data was inspected.

The public Home venue remains general. Exact published arrival details are an
optional `privateVenue: { location, directions, mapUrl }` projection. A current
owner/admin may read them regardless of personal registration/status. Other
people need their own approved registration and personal Going/Checked in
status. Team lock, another member's status, query identity claims, and a complete
profile alone grant nothing. Removed participants receive no private venue.

Home enrichment is explicit: only normalized `view=/` plus `arrival=1` maps to
the internal `PortalViewOptions.includePrivateVenue` option. Default root reads
remain free of exact details even for an authenticated owner. This preserves
public SSR/bootstrap/metadata. The Portal owner adds the flag to the existing
client Home refresh and passes its optional `privateVenue` to Home; no extra
Home fetch is required. Anonymous enrichment returns the ordinary public view
without private details. Other routes ignore the flag. Responses retain private,
no-store and identity Vary headers.

Workspace uses the same helper and reuses its existing personal-status result.
Draft content is never in the published arrival projection. Edit/publish remains
owner or explicitly granted admin venue manager through the unchanged
`managesPrivateVenue` predicate. All-admin reading adds no editing privilege.
No migration or provider setting change is required by this projection change.

Four new actual HTTP tests pass on disposable SQLite and PGlite using the
production PostgreSQL adapter. They cover the role matrix, a Registered person
in a locked team, a Going person with no team, Checked in, non-staff Absent,
ordinary admin reading without an edit grant, public default SSR reads,
query/header tampering, unpublished draft exclusion, account/logout sequences,
status/approval changes, role revocation and participant deactivation. Sixteen
related existing experience/dashboard/team-flow tests and typecheck also pass.
These are fresh-response guarantees; final integrated browser account and
visibility checks remain a separate UI gate.

Baseline UI findings were captured and viewed at 1440 and 390 pixels before
implementation: Home showed only IIIT Delhi/New Delhi, Team showed the synthetic
arrival card for Going, and owner Content had no private-arrival editor. The
card sat inside the existing team branch, so no-team placement and the missing
configuration UI are coordinated with the Portal/Home owners, not modified in
this backend commit.

The six baseline PNGs are outside Git. Their PNG-only ZIP was uploaded through
the explicitly authorized temporary host and downloaded using ordinary HTTPS
with a cookie jar; its SHA256 matched. No source, logs, env, database or manifest
was uploaded. The baseline pictures are not final integrated UI proof:

- [Synthetic baseline screenshots](https://filebin.net/ddd-venue-d04da9fc956181fd41a1/venue-before-3fee-synthetic.zip)
- Host-reported expiry: `2026-10-31T21:59:03.198615Z`
- ZIP SHA256: `a549221e4187a16f9e5a11b6f822010251f58c028f3ce19b17a5c44e8d59d018`

No API or frontend deployment, push, hosted SQL, real private venue upload,
provider call or credential read/change was performed. PGlite is not evidence of
native PostgreSQL multi-connection concurrency. A fresh backend archive and
owner-operated rollout are required after all backend lanes are integrated.
