# Authentication repair checkpoint

## Dashboard follow-up published, 2026-10-23

**Version 3 is deployed successfully** at <https://dddhack-portal.param3021.chatgpt.site>. Published source: `67e05772e63d43031ccd1913d0d8691d4b955895`; deployment: `appgdep_6adb2fad68cc81919724ac6aa70ac8f1`; saved version: `appgprj_6ad9ec4bea6c8191b2bb155de7fe00ed~appgver_302476e84448819189b22c93c96929b6`. The official source helper published tested repair `7f0db37322e34131e8cef3d9f7e97c00c6d27d6d` with refreshed build evidence. The exact HTML and Site display title is **DevDay Exchange Community Hackathon: New Delhi**.

Public visibility and runtime revision 1 are unchanged. The only runtime entries are the two Sites auth confirmations. Native read-only checks confirm that event settings, registrations, credit inventory/allocations and result snapshots/publication remain empty. No bootstrap row, credit secret, policy activation, data reset or permission grant was introduced.

Validation: all 21 unit/D1 tests and typecheck passed for the repair. The publication workflow reran the official production build, the 117-file artifact gate and compiled Worker smoke checks with no event-settings row and no credit key. Dashboard/profile return 200 in that isolated harness, while anonymous/private API and role restrictions remain effective. Native saved-version/deployment reads confirm successful version 3 publication. No live authenticated dashboard success is claimed: the local task has no supported browser; earlier direct HTTP checks were blocked by Cloudflare 403, and those denied routes were not retried. The latest native Worker log query returned no recent events, not evidence of an interactive success. Evidence: `evidence/sites-dashboard-repair-publication.json`.

The user approved one additional short-lived source credential for this bounded dashboard publication. It was used through hidden stdin/session memory and was not persisted. It is discarded once this workflow is complete; no standing approval exists for future credentials.

The sections below retain the chronological diagnosis and earlier preparation state.

## Published authentication configuration, 2026-10-23

Version 2 is published successfully at <https://dddhack-portal.param3021.chatgpt.site>, source `92a82e22ef32dd79860ab501bbb1edcaafff8178`, deployment `appgdep_6adb2a1359f08191bf321bc1b5bd4582`. Environment revision 1 contains exactly `PORTAL_RUNTIME=sites` and `PORTAL_TRUST_SITES_DISPATCH=true`; no credit key exists. The exact requested Site display title is now **DevDay Exchange Community Hackathon: New Delhi**. The source HTML title correction is included in the follow-up patch below.

The official source helper rebuilt, passed the artifact gate and compiled Worker smoke checks, pushed the exact source and packaged 117 verified files. The approved replacement credential was discarded after use and was never persisted. Direct anonymous sign-in verification returned a Cloudflare-served HTTP 403 and stopped; no redirect was followed or denied route retried. No browser is currently exposed. Native deployment success is verified; interactive sign-in success is not claimed.

## Fresh-database follow-up

After version 2, native production logs show `/api/portal` still returning 503. The user reports `DATABASE_NOT_INITIALIZED` on their signed-in dashboard. Read-only Sites database inspection confirms all 27 expected tables under `DB`, but zero `event_settings` rows. This is missing event bootstrap/configuration, not a missing DB binding or migration schema. `PortalService.view()` called strict `settings()` before every view, including profile and dashboard.

The prepared follow-up uses inactive, unconfirmed draft policy **only for read views** when no settings row exists. It does not persist that fallback, seed users, activate policies, alter data, grant roles or create secrets. Commands retain strict initialization checks; the existing owner-only audited initializer remains explicit. The exact corrected HTML title is included, with no visual redesign.

Typecheck, all 21 unit/D1 tests, official production build/artifact gate and compiled Worker tests pass. The compiled harness deliberately has no credit key and no event-settings row: dashboard/profile 200, anonymous private API 401, participant admin/export 403, judge credit denial, and credit import 503. Unit tests confirm no event-settings row is created by reads and initialization-dependent operations remain blocked.

This follow-up is not yet published. Its Site source push needs another short-lived credential: the one approved for version 2 was used and discarded, and the read-only Site response does not return it for reuse. No additional credential was minted. GitHub commits/pushes remain authorized.

## Historical preparation notes

Local executor: `param302-linux`, checkout `dddhack-portal`, feature branch `feat/devday-exchange-v1`. This checkpoint does not change the public Site's audience, environment, deployment or data.

## Confirmed cause

The user reported `SITES_DISPATCH_NOT_CONFIGURED`. Read-only production Worker logs now confirm an anonymous landing request returned 200, an anonymous public-data request returned 503, and a later `/dashboard` request arrived through the production Dispatch namespace with identity headers and returned 503. Only presence of identity headers was inspected; their values are not recorded here. The runtime environment remains revision 0 with no entries. The app's explicit guard, rather than a missing platform OAuth route, produces this error.

The supported starter says Dispatch owns OAuth cookies, reserved auth paths and identity injection. The public documentation describes authenticated identity forwarding: <https://learn.chatgpt.com/docs/sites/data-and-connections>. The maintained production `getChatGPTUser()` helper reads those headers directly, with no application signature or trust flag. That is the supported platform identity contract. Native Sites publication records and matching production Dispatch Worker logs establish this deployment under that managed ingress. Requiring undocumented internal stripping implementation details was overly strict; no platform defect was demonstrated. Standalone Workers must still reject raw identity headers, and arbitrary caller headers alone never establish this boundary.

One narrowly scoped anonymous probe used synthetic `example.invalid` identity headers against a unique nonexistent path on this user's Site. It received HTTP 403, `Server: cloudflare`, with a Cloudflare request identifier, and produced no matching Worker event. The request was not retried. This locates rejection before the application Worker but does not distinguish Sites ingress, a Cloudflare security rule, or transparent egress filtering. It provides no evidence about header sanitization.

## Prepared source repair

Credit encryption is independent of ChatGPT sign-in. Request runtime creation no longer demands the credit key. The service validates it only before credit import previews/commits or recipient reveals, and the cryptographic helpers validate it again before encryption/decryption. Missing, empty, malformed and wrong-length values return `CREDIT_KEY_UNAVAILABLE` (503); no key is generated, substituted or stored. Credit previews cannot be created when the key is unavailable. All existing authorization, draft policy and unconfigured-Dispatch rejection remain in place.

The compiled Worker smoke harness deliberately has no encryption key and verifies participant profile access, anonymous rejection, owner/admin/judge authorization and credit-import rejection using isolated synthetic data. This is not live ChatGPT sign-in verification.

Validation completed: TypeScript typecheck, all 20 unit/D1 tests, official Sites production build, artifact reachability gate (117 files; no affected build modules or unresolved imports), and compiled Worker smoke tests. Existing full audit findings remain unsuppressed. The source patch has not yet been published to Sites.

## Remaining actions and approvals

1. Use the official managed Sites identity contract on this verified managed deployment. Preserve request isolation, standalone rejection and server authorization. Real hostile-header tests, revocation and interactive sign-in remain verification limits, rather than demonstrated defects in that contract.
2. The user approved one fresh short-lived credential limited to this existing Site's source repository for publishing the repair. The original credential expired on 2026-10-22 at 11:08:23.602 UTC and was discarded. Never persist or expose the replacement token. Prior GitHub commit/push authorization remains applicable.
3. The requested auth repair needs only `PORTAL_RUNTIME=sites` and `PORTAL_TRUST_SITES_DISPATCH=true`, then deployment of the repaired saved version. A production credit key is a separate operation and is not needed for sign-in after this patch. It still requires its own approval before creation/configuration.
4. Keep event policy inactive/draft, imports empty and results unrevealed. Interactive sign-in and hostile-header rejection remain unverified.

## Reference screenshots

The browser inventory was rechecked once: only `Codex MCP Apps` with zero tabs is exposed; there is no IAB, Chrome or other web browser surface. No unsupported browser-control path was attempted. No screenshots or Library file IDs were created.

The documented setup is Settings > Computer Use > select the browser (expand More browsers if needed) > Install its plugin/extension > confirm Manage, then select that browser with an @-mention using the same profile. The Linux desktop documentation links this extension setup. See <https://learn.chatgpt.com/docs/chrome-extension> and <https://learn.chatgpt.com/docs/linux/linux-app>. Browser permission should be limited to the two reference sites and this portal for the requested tasks.
