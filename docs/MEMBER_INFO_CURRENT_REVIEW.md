# Current-base member-info review checkpoint

This isolated detached checkout is based on published `c4bc4508a6ab095da2d75a29df6d4b9172138e09`. It cleanly cherry-picks the preserved member-info source and tests as `191ee1c`, `7e8e581` and `3c42340`. The original `55505ba` checkout remains clean and unchanged. Nothing here is integrated, pushed, deployed or applied to hosted data.

The bounded response-hardening follow-up is `01c5907265c91e304d1f468a7e63df16c4f5b9d0`. It changes only the selected-profile component and focused tests. HTML401 is handled from its status before JSON parsing. Malformed/nonobject response bodies produce concise retry feedback; legitimate JSON authorization explanations retain their status and message. One15-second abort/race bounds headers and body loading, clears its timer/listener, and keeps cancellation/stale responses silent. No other application, backend projection, permission, schema or analytics change was made after the clean cherries.

## Verification

- Current-base focused suite:34/34 passed, including the6-count PostgreSQL gate with one serial disposable PGlite engine, closed afterward.
- Post-hardening affected suite:35/35 SQLite/component/mock cases passed. New tests reproduce the original HTML401/503 parser failures and verify malformed JSON recovery, exact14999/15000ms timeout behavior, stalled headers/body, abort-ignoring transport, cancellation, timer cleanup and fresh retry.
- Typecheck and optimized Next.js production build using `next build --webpack` passed both before and after hardening. A full application suite was not rerun or claimed for this isolated checkpoint.
- Pre-hardening actual browser:10/10 grouped gates,19 native screenshots,0 page errors at source `3c42340bb3b2ed543de81f3ab1ba23877136898d`. These remain explicitly pre-hardening; they were not relabeled as the later source.
- Post-hardening actual browser:3/3 checks, exactly two390×480 PNGs,0 page errors at source `01c5907`. Controlled HTML401 shows Sign in; controlled HTML503 shows concise Retry. Retry sends exactly one fresh selected GET and reaches the authorized profile. Timeout itself uses focused mock-clock tests, not a new browser wait or timing claim.

Screenshots and SHA manifest are outside Git at `/tmp/ddd-member-info-current-evidence`. Frontend/backend ran from the same respective source at capture. Native key desktop/mobile originals and both post-hardening states were viewed. The initial top-of-page submission frame does not show its below-fold member block; explicit1440/390 member-block captures close that documented framing gap. The parent owns native Library delivery; this lane uploaded nothing and made no ZIP.

The browser verified owner/admin selected org/contact facts, public/Viewer gender boundaries, current-teammate phone access, anonymous SSR without private sentinels, one selected request per open,44px info targets, stable loading/loaded frame, Escape/Back/outside dismissal and focus return, background touch lock/internal scrolling, retry/sign-in states and account-cookie switching through the existing focus refresh. All browser requests were restricted to loopback GET/HEAD against a new synthetic SQLite fixture. This is Chromium touch emulation, not physical-device, real OAuth, hosted, performance or native multi-connection PostgreSQL proof.

Both browser jobs and the narrow two-state follow-up closed. Owned Next3012 and backend8852 were stopped and listeners verified absent. Generated development-only next-env paths were restored. No screenshot, database, log, environment file or credential is tracked by this checkpoint.

## Roster remains deferred

No roster-removal implementation or migration is included. A dedicated normalized-email removal table in a future additive migration using a then-unused number is the engineering plan. The earlier0107 proposal was never implemented;0107 is now assigned to `0107_admin_team_lock.sql`. An email-keyed table avoids arbitrary external user-ID namespace collisions. Existing user-ID tombstones remain supported, and explicit authorized restoration must clear the relevant revocations without login/session/CSV reimport silently restoring access. Accounts/history/team records and the leader-successor block remain protected.

The only pending product decision is whether removal retains the occupied team seat and pauses active approval, or detaches the person, frees the seat and restores them teamless. This note does not request an additional broad schema-approval step and does not change current readiness, saved approval, membership, credit, identity or historical submission data.
