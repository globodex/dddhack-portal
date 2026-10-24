# Owner admin access: final rendered proof

Application source: `ad96baf40f411af984e5987fd58352a82c0f66f6`. Feature source is `771fe2045d75dd8c130ace88d482c7206e6a519c`; the real Escape-focus defect is fixed by `fd6d03905abf4ac89527622682b9993b36795ab5`. Both author and committer are Parampreet Singh `<rubercuber.30@gmail.com>`.

This ran against the actual Next.js application on localhost3000 and the disposable synthetic backend8834, `/tmp/ddd-admin-window-invite-8834.sqlite`. Only `fake_admin` was revoked and restored through the UI. No hosted service, credentials, provider setting, production record, participant status, team or project was changed. The browser and API context are closed. All five runtime file fingerprints remained unchanged throughout the run.

Six checks passed, with zero browser page errors:

1. The owner receives only names, emails, IDs and a protected owner flag. The ordinary admin's `/admin/access` response is403. The real list fits desktop1440, mobile390 and short mobile320 without horizontal overflow. The owner has no Revoke control.
2. Keyboard Enter opens the exact-target confirmation. Escape cancels with zero POSTs and returns focus to Revoke.
3. An explicitly injected local503 leaves the admin row enabled for retry and renders exactly one persistent, complete error. This rejection is synthetic transport evidence, not a production failure or performance measurement.
4. A real confirmed revoke persists after reload. The same previously authorized admin API client receives403 from `/admin/participants`, while `/dashboard` remains200 with `me.id=fake_admin` and role participant. The owner email field receives focus when the deleted row cannot receive it.
5. The existing normalized Add form and its real confirmation restore `admin@portal.test`; the same admin client again receives200 from `/admin/participants`.
6. Read-only Event inspection verifies both saved datetime inputs are hydrated and editable, with values `2026-10-24T08:00` and `2026-11-01T20:00` IST. It sends no date publication request. Its screenshot still contains the preceding Add success toast, which normally dismisses automatically.

The three recorded browser POST attempts are: one503-fulfilled `revoke-admin`, one real `revoke-admin`, and one real `add-admin`. Only two role mutations reached the synthetic backend. No other command was allowed by the browser route guard.

All eight original, unscaled PNGs were opened and inspected:

- [Desktop list](https://github.com/Param302/dddhack-portal/blob/6fcb7d5be117d234ae60a4a4b04af966f9134af8/evidence/admin-owner-access-final-hydrated/owner-list-1440.png)
- [Mobile list](https://github.com/Param302/dddhack-portal/blob/6fcb7d5be117d234ae60a4a4b04af966f9134af8/evidence/admin-owner-access-final-hydrated/owner-list-390.png)
- [Short narrow list](https://github.com/Param302/dddhack-portal/blob/6fcb7d5be117d234ae60a4a4b04af966f9134af8/evidence/admin-owner-access-final-hydrated/owner-list-320.png)
- [Exact target confirmation](https://github.com/Param302/dddhack-portal/blob/6fcb7d5be117d234ae60a4a4b04af966f9134af8/evidence/admin-owner-access-final-hydrated/revoke-confirmation-320.png)
- [Failed revoke with retained row](https://github.com/Param302/dddhack-portal/blob/6fcb7d5be117d234ae60a4a4b04af966f9134af8/evidence/admin-owner-access-final-hydrated/failed-revoke-row-retained.png)
- [Persisted revoked list](https://github.com/Param302/dddhack-portal/blob/6fcb7d5be117d234ae60a4a4b04af966f9134af8/evidence/admin-owner-access-final-hydrated/revoked-admin-list.png)
- [Restored admin](https://github.com/Param302/dddhack-portal/blob/6fcb7d5be117d234ae60a4a4b04af966f9134af8/evidence/admin-owner-access-final-hydrated/admin-restored-390.png)
- [Hydrated saved dates](https://github.com/Param302/dddhack-portal/blob/6fcb7d5be117d234ae60a4a4b04af966f9134af8/evidence/admin-owner-access-final-hydrated/dates-hydrated-read-only.png)

[Machine-readable results](report.json) and [reproducible guarded browser script](../../scripts/qa-admin-owner-access.mjs) accompany the originals. The script waits for actual form hydration before clicking the Access tab, and resets scroll before full-page screenshots so fixed navigation is captured at its real page position.

Independent API review by the reference lane passed16/16 checks across SQLite and PostgreSQL, including strict owner authorization, configured-owner/self protection, legacy users.role fallback, same-identity revocation, participant/profile/team/idea/allocation preservation, idempotency and concurrent grant/revoke ordering. The independent report and tests are delivered from that lane rather than duplicated here.

The earlier [focus regression report](../admin-owner-access/report.json) records the failed Escape-focus assertion on source19cb, zero POSTs, and unchanged source fingerprints. That folder is historical before evidence. Its mobile full-page list frames were captured while scrolled and have fixed-header positioning artifacts; use the final frames above for visual comparison. A separate warmup attempt clicked Access before hydration and timed out on its hidden panel. That harness issue caused no role write and is not counted as a product regression.
