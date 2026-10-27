# Review: missing admin stats/email and approval LIST_NOT_FOUND

Status: local review only, not pushed or deployed. Based on published frontend/source363fa35. No hosted data, settings, credentials or backend deployment changed.

## Observed and reproduced

The supplied screenshot was materialized through the Library helper and inspected at1812×410. It shows the compact filter button and participant info button but no statistics section. The private screenshot remains outside Git.

Read-only live checks returned health200 (`ok`, `runtime` only) and unauthenticated approval-preview401 `SIGN_IN_REQUIRED`. There is no exposed release identifier, and no authenticated live admin session was available in this executor. The precise active hosted backend version has NOT been verified.

A disposable synthetic fixture was exercised through the actual HTTP handlers from older0b5f130 and current363fa35:

| Request                                          | Older backend      | Current backend    |
| ------------------------------------------------ | ------------------ | ------------------ |
| Admin Participants                               | 200, stats absent  | 200, stats present |
| Selected admin profile                           | 200, email absent  | 200, email present |
| `/admin/team-approval?focus=...` via portal view | 404 LIST_NOT_FOUND | 200, valid preview |

This reproduces the entire reported symptom set with an older backend. It establishes the mismatch mechanism; it does not identify the exact live release. A volunteer intentionally lacks whole-collection stats, but the screenshot's Add participants/info controls are consistent with administrative UI.

## Root causes and local change

The frontend relies on server-projected aggregates and admin-only selected email; it cannot safely invent counts or reconstruct private fields. A backend without the approval-preview handler falls through to the generic admin list lookup, where `team-approval` raises LIST_NOT_FOUND.

The existing frontend silently omitted missing stats and selected email, and surfaced that raw legacy route error. This was a compatibility/error-handling gap. The local frontend-only change:

- Shows an explicit admin-only missing-statistics notice rather than no cards or fake zero counts.
- Shows an admin-only missing-email notice in the shared selected-profile modal.
- Maps only approval-preview404 LIST_NOT_FOUND to matching-backend deployment guidance. Real removed-team, authorization and other errors retain their original meanings.
- Keeps approval disabled when its authoritative preview cannot load. No client-side approval fallback or permission bypass is added.

The matched current backend already supplies all three features. Their earlier runtime implementation is unchanged by this review.

## Checks

- Focused UI/compatibility/profile run:27 passed,0 failed,0 skipped.
- Focused SQLite/PostgreSQL approval/profile run:36 passed,0 failed,0 skipped; two email tests overlap the first run (61 distinct tests).
- Production default Turbopack build and standalone typecheck passed.
- Actual local browser comparison1440×900 and390×844: matched backend provides stats/email/approval preview; legacy backend shows explicit notices and cannot approve; no horizontal overflow. No browser approval mutation was submitted.
- Backend tests cover Registered-only approval, attendance preservation, idempotence, role/crown/membership/profile/idea/attendance/freeze races and transaction rollback.
- Full repository regression was not rerun for this frontend-only diagnostic change.

[HTTP reproduction](../evidence/admin-backend-compatibility/reproduction.json), [browser checks](../evidence/admin-backend-compatibility/browser-checks.json). Synthetic screenshots remain at `/workspace/portal-live-regression/screens/`, outside Git.

## Rollout implications

The local diagnostic change needs no new ZIP, SQL or settings. The published backend archive remains unchanged:

`artifacts/neon/portalapi.zip`

SHA256 `6c94e2ccd8ad3baeccc326c7e87c49e0b0900657012becad36b97505f89d0542`

Runtime source6cb9b2862fb992135491fcadca5795b63a9ed3f9 contains stats, approval and admin email. If the active backend is older, the owner must deploy this exact archive using [the existing Windows guide](ADMIN_PROFILE_EMAIL_WINDOWS_ROLLOUT.md), preserving origins/secrets. That rollout and a signed-in live admin verification remain owner-operated and unverified here. Existing schema through0107 is the prerequisite; this review introduces no migration.
