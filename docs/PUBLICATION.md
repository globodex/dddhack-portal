# Sites publication record

## Current authentication repair publication

Version **2**, source **`92a82e22ef32dd79860ab501bbb1edcaafff8178`**, was successfully published on 2026-10-23 as deployment **`appgdep_6adb2a1359f08191bf321bc1b5bd4582`**. Runtime revision **1** contains only `PORTAL_RUNTIME=sites` and `PORTAL_TRUST_SITES_DISPATCH=true`. No credit key was created. Site access remains public and URL unchanged. The Site display title is **DevDay Exchange Community Hackathon: New Delhi**.

The production database has its schema but no event-settings row; the user's subsequent dashboard error is `DATABASE_NOT_INITIALIZED`. A tested read-only inactive draft fallback and corrected HTML title are prepared but not yet published; see `AUTH_REPAIR.md`. Direct HTTP login checks remain blocked by 403 and no interactive browser is available. Evidence: `sites-auth-repair-publication.json` and `sites-auth-repair-live-http.json` under `evidence/`.

## Initial version 1 record

- Title: **DevDay Community Hackathon: New Delhi**
- Live URL returned by Sites: **https://dddhack-portal.param3021.chatgpt.site**
- Project: `appgprj_6ad9ec4bea6c8191b2bb155de7fe00ed`
- Audience: **public**, confirmed by native access read
- Deployment: `appgdep_6ad9ed142bb081919f086fe6fa155a55`, **succeeded**
- Saved version: `appgprj_6ad9ec4bea6c8191b2bb155de7fe00ed~appgver_693760cb07c88191a6bfb353fef5d511` (version 1)
- Published source revision: `8811d58af2f9079405f359c02ad3034ed967e890`

The official Sites source workflow rebuilt the project with its persisted project ID, passed the artifact gate and compiled Worker tests, pushed the exact source to the new Site's managed `main` branch, and packaged all 117 reviewed files. Native saved-version metadata confirms the published source revision and deployment identity. GitHub's existing feature branch also contains that source revision. Later documentation/evidence commits do not change which revision version 1 published.

## Verification limits

Later diagnosis: production Worker logs now confirm the user's anonymous landing returned 200 and their signed-in `/dashboard` request returned 503 with identity headers present at Dispatch. The error is the app's unset runtime configuration guard. This does not establish production header sanitization. The prepared, unpublished source repair separates credit encryption from sign-in; see `AUTH_REPAIR.md`. Earlier executor checks and the original version 1 deployment record below remain historical evidence.

Native deployment and public access succeeded. Direct anonymous HTTPS checks from `param302-linux` returned **403 for every attempted route**, including `/`. Therefore the live landing, asset loading, private API responses, Dispatch header stripping and interactive sign-in are **not HTTP/browser verified**. No alternative origin, forged browser user agent, access-control workaround or security-warning bypass was attempted. Native Worker log queries returned no events for these checks; the available data does not establish the exact source of the denial.

The compiled local production tests pass: public landing 200 with the exact title; unconfigured protected routes/APIs 503; fixture route 404; configured synthetic Dispatch tests preserve anonymous/participant/admin/judge/export restrictions. Those are local results, not substitutes for live HTTP evidence. See `evidence/sites-live-http.json` and `evidence/sites-publication.json`.

## Database and runtime

Native database inspection confirms binding **DB** and all **27 expected tables**. Users, registrations, credit inventory/allocations, event settings and result snapshots/publication are empty. The single structural scoring revision row is 0, consistent with the custom migration's invariant initialization. The migration ledger and all 72 hosted triggers cannot be directly inspected with the available read tools, so that finer-grained state is not claimed as independently verified. The native deployment reported migration/publication success.

No production roster, fake accounts, real credits, published results or API spending was introduced. The event is **uninitialized/inactive**; draft policy code is unchanged. No policy was activated.

The hosted environment has **no configured runtime entries** (environment revision 0). No production credit-encryption key was generated or stored, and Sites Dispatch trust flags were not enabled. The code retains its fail-closed protected-data response until those are correctly configured; observed live requests are currently blocked at 403 before that behavior could be verified.

Enabling private functionality needs a separately approved operation: generate a fresh 32-byte production encryption key, store it as this Site's secret, and configure the two Sites Dispatch trust confirmations only within the verified managed Dispatch boundary. Do not reuse the synthetic test key or expose the header-trusting adapter on another origin. Actual sign-in/anonymous/spoofed-header tests and owner-only draft initialization remain necessary after that setup. No such secret/trust action was attempted under the source-write credential approval.

## Approved source credential

The user approved creation/use of one short-lived repository-scoped write credential for this new Site. It was used through the official helper's hidden stdin and transient process/session memory only. It was not put in a file, Git remote, commit, report, chat or log, and was not renewed.

No supported secure persistence mechanism was installed (`secret-tool`, libsecret and Git Credential Manager were unavailable; no credential helper was configured). The credential was therefore **not saved persistently**, and its value was discarded from the session store after publication. The platform-reported expiry is **2026-10-22 11:08:23.602 UTC**. Future source updates requiring another credential must follow applicable action-time approval; no long-lived replacement or lifetime extension was created.

The six high/four moderate build-install findings remain documented with artifact-specific mitigations in `DEPENDENCY_REACHABILITY.md`. They were not suppressed or claimed patched.
