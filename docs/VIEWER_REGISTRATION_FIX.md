# Signed-in Viewer registration state

This local change follows validated checkpoint `d97d614ac7be2a657df91de42aaf00e9f3cfc336`. It is intended for the approved review branch only. Main, deployment and hosted data remain unchanged.

## Reproduced before the fix

An authenticated account outside both registration allowlists was already classified as a Viewer. The private-view roster guard nevertheless rejected `/dashboard` and `/profile` with `LUMA_EMAIL_MISMATCH`. The catch-all server page swallowed that failure, rendered an unresolved shell, and made the browser repeat the request and display an error. Personal Credits instead reported check-in required. Admin Participants incorrectly displayed this account as Registered.

Before screenshots and their accepted/rejected capture manifest are in `evidence/viewer-registration/before/`. All accounts and data in this evidence are synthetic.

## Intended interaction and permissions

- A normal Viewer gets one stable, server-rendered invitation to **Register on Luma**, followed by People, Teams and Projects links. The URL is the existing approved landing registration URL, `https://luma.com/6t5uk4lo`.
- Viewer navigation offers Discover, Projects and Rules. There is no profile, team creation, private credit or participation action. Visiting a known private entry URL still presents the registration invitation rather than an expected-access error.
- Registration means an existing imported/admin-added allowlist record in `registrations` or `luma_roster`. Authentication does not register anyone. Approval, profile completion and check-in retain their separate checks.
- The backend returns only `me` and `registrationRequired: true` for a normal Viewer's eight known private entry routes. Unknown private routes and private history retain denial. Removal remains an actionable denial and cannot be bypassed by re-registering.
- Vote, feedback, team creation/join/invite, private history, media and credit mutations retain server authorization. A Viewer cannot obtain a code by calling an endpoint manually.
- Expected registration absence is not retried as an error. Existing focus/navigation refreshes can discover an explicitly added registration without a new login. There is no polling or automatic Luma import.
- Real backend/session/network errors remain errors. A protected SSR failure is passed directly to the client, avoiding an immediate duplicate bootstrap retry. Retrying keeps a single error state visible and disables its pending button. New successful route data clears stale error/success text. A public landing refresh failure keeps the approved static content available.

## Admin visibility and privacy

Owner/admin Participants adds **Not registered** to Personal status. Selecting it resets Team status to All people so the existing Locked default cannot conceal the matching accounts. Counts and search use the complete filtered collection; this filter renders 25 rows per page. Viewer rows cannot be selected for attendance or approval updates. Registration remains the explicit Add participants workflow.

The list derives name/email and registration state from existing portal account records. It adds no table, column, identity storage or public directory fields. Only owner/admin projections receive these Viewer rows; volunteers and public discovery do not receive the new list. The export remains admin-only, uses the same filter and existing column allowlist. A registration-state change invalidates the actor-scoped presentation version even when the person's name stays the same.

The exact backend source used by the refreshed archive is recorded in `artifacts/neon/receipt.json`. The existing nine migration hashes are unchanged. The earlier release still requires the owner-run pending-only 0102/0103 upgrade before backend/frontend publication, as documented in `NEON_POPULATED_UPGRADE_PLAN.md`; this Viewer fix adds no migration.

## Validation

Final validation receipts and screenshot coverage are saved under `evidence/viewer-registration/`. Browser and full-suite results are finalized there when complete; do not infer readiness from this design note or a successful build alone. Actual hosted login, native Windows/ARM64 deployment and hosted database changes are outside this local verification.
