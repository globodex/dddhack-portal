# Venue access and rendered proof

Verified exact combined source:
`4a9c57e2171a4f2a08c59d6da3bea4c682221d4b`.
The local fixture uses **SYNTHETIC PRIVATE VENUE, Room TEST-201, Test Block**.
It does not contain the real private destination, real identities, credits or
keys. Published/live venue configuration remains unknown and was not queried.

## Where the venue appears

| Step | Surface | Result |
| --- | --- | --- |
| 1 | Home → Venue (`/#venue`) | Healthy. Everyone sees general IIIT Delhi/New Delhi. Anonymous and signed-in server-rendered Home HTML contain no exact fixture details. |
| 2 | Home → Venue, after existing authenticated refresh | Healthy. Exact published location, directions and Google Maps appear for personal Going/Checked in or current admin/owner only. No team is required. |
| 3 | Dashboard → Team | Healthy. “Your arrival details” also appears for an entitled Going person without a team, beneath the team controls. |
| 4 | Settings → Content → Private arrival details | Healthy. Owner or explicitly granted venue manager sees the location, directions and private Maps fields. Ordinary admin can read the published venue on Home without gaining this editor. |
| 5 | Status, account and logout changes | Healthy. Existing Home focus refresh removes Absent details/restores Going; account reload and accepted logout remove the prior private view. |

The editor's exact labels are “Exact room or entry location”, “Private
directions”, “Private Google Maps URL”, “Save draft” and “Publish saved draft”.
The browser proof checks its capability visibility and keyboard focus, not a
production publish. Existing content-save/publish domain tests remain separate.

## Role matrix

| Role or personal status | Public Home | Exact Home arrival | Exact Dashboard arrival |
| --- | --- | --- | --- |
| Anonymous | General | Omitted | 401 |
| Unregistered Viewer | General | Omitted | Minimal registration-required view |
| Registered | General | Omitted | Omitted |
| Registered in locked team | General | Omitted | Omitted |
| Going | General | Published details | Published details |
| Going without a team | General | Published details | Published details |
| Checked in | General | Published details | Published details |
| Non-staff Absent | General | Omitted | Omitted |
| Ordinary admin, Registered with no venue-manager grant | General | Published details | Published details |
| Owner, Registered | General | Published details | Published details |

Forty actual backend HTTP rows and ten actual browser Home role cases pass.
Four full frontend HTML requests, including authenticated Going/admin/owner,
contain neither the exact synthetic location nor its Maps destination. Default
root JSON omits `privateVenue`; only the existing client refresh with
`arrival=1` asks for authorized enrichment. Its responses remain private/no-store
and are bound to the fresh authenticated actor, not query identity claims.

Additional browser checks passed:

- Ordinary admin lacked the private configuration tab; an actual fixture owner
  grant enabled only that admin's private editor, then revocation removed it.
- Actual owner status changes made the already-open Home lose Absent details and
  regain Going details through the existing focus refresh.
- Replacing the cookie in the same browser context and reloading as the
  Registered locked-team member removed the former Going details.
- Mobile touch logout plus Escape cancelled safely. Confirmed logout cleared the
  local cookie and exact Home details.
- Maps uses the configured safe URL, `_blank`, keyboard focus and at least a
  44-pixel target. The external Maps destination was not opened.
- No JavaScript page errors occurred.

The first capture's initial tab click needed an explicit hydrated-control gate.
An account-switch test initially used the same hash URL, which performs no new
document request; a targeted reload supplement completed that check. These
capture-harness corrections are recorded without claiming product defects.
Two initial Dashboard pictures were rejected for disabled pre-hydration controls
and retaken after readiness. All nine final saved PNGs were then viewed.

## Screenshots

[Download nine synthetic screenshots](https://filebin.net/ddd-venue-d04da9fc956181fd41a1/venue-final-4a9-synthetic.zip)

Host-reported expiry: `2026-10-31T22:16:18.662356Z`.
ZIP SHA256: `687f25186e3839cffaa0dcafbd190c729fddfc08e9a29e72e514f0924136fa48`.
An ordinary HTTPS download with a cookie jar returned 200 and matched that hash.
This is the stable Filebin URL, not its temporary storage redirect.

The ZIP contains PNGs only:

1. Public Home, 1440×1000.
2. Going Home with synthetic exact details, 1440×1000.
3. Owner private configuration, 1440×1000.
4. Public Home, 390×844.
5. Going Home with synthetic exact details, 390×844.
6. Owner private configuration, 390×844.
7. Going without team Dashboard, 1440×1000.
8. Going without team Dashboard, 390×844.
9. Granted admin private configuration, 390×844.

All accepted files remain under
`/tmp/ddd-venue-proof-3fee/final-screens/`, outside Git. No source, logs, env,
database or manifest was uploaded to the temporary host. The
[screenshot manifest](../evidence/private-arrival-browser/screenshots.json)
records the viewed files and hashes without storing PNGs in Git.

The [verification](../evidence/private-arrival-browser/verification.json),
[API/SSR matrix](../evidence/private-arrival-browser/api-role-and-ssr.json),
[primary browser phase](../evidence/private-arrival-browser/primary-browser-phase.json)
and [targeted supplement](../evidence/private-arrival-browser/supplement-browser-phase.json)
bind the observations to source. Backend tests are documented separately in
[Private arrival access](PRIVATE_ARRIVAL_ACCESS.md).

No production access, actual private venue upload, credential read/change,
provider/paid AI call, deployment or push was performed. The owned browser and
ports 3031/8891 are stopped. This local development proof does not establish
deployed content, production performance or full accessibility compliance.
