# Authentication repair checkpoint

Local executor: `param302-linux`, checkout `dddhack-portal`, feature branch `feat/devday-exchange-v1`. This checkpoint does not change the public Site's audience, environment, deployment or data.

## Confirmed cause

The user reported `SITES_DISPATCH_NOT_CONFIGURED`. Read-only production Worker logs now confirm an anonymous landing request returned 200, an anonymous public-data request returned 503, and a later `/dashboard` request arrived through the production Dispatch namespace with identity headers and returned 503. Only presence of identity headers was inspected; their values are not recorded here. The runtime environment remains revision 0 with no entries. The app's explicit guard, rather than a missing platform OAuth route, produces this error.

The supported starter says Dispatch owns OAuth cookies, reserved auth paths and identity injection. The public documentation describes authenticated identity forwarding: <https://learn.chatgpt.com/docs/sites/data-and-connections>. Neither reviewed source explicitly documents production removal/replacement of client-supplied identity headers. The explicit stripping code in the installed starter is for development mock authentication only. Ordinary application flags do not prove this production boundary.

One narrowly scoped anonymous probe used synthetic `example.invalid` identity headers against a unique nonexistent path on this user's Site. It received HTTP 403, `Server: cloudflare`, with a Cloudflare request identifier, and produced no matching Worker event. The request was not retried. This locates rejection before the application Worker but does not distinguish Sites ingress, a Cloudflare security rule, or transparent egress filtering. It provides no evidence about header sanitization.

## Prepared source repair

Credit encryption is independent of ChatGPT sign-in. Request runtime creation no longer demands the credit key. The service validates it only before credit import previews/commits or recipient reveals, and the cryptographic helpers validate it again before encryption/decryption. Missing, empty, malformed and wrong-length values return `CREDIT_KEY_UNAVAILABLE` (503); no key is generated, substituted or stored. Credit previews cannot be created when the key is unavailable. All existing authorization, draft policy and unconfigured-Dispatch rejection remain in place.

The compiled Worker smoke harness deliberately has no encryption key and verifies participant profile access, anonymous rejection, owner/admin/judge authorization and credit-import rejection using isolated synthetic data. This is not live ChatGPT sign-in verification.

Validation completed: TypeScript typecheck, all 20 unit/D1 tests, official Sites production build, artifact reachability gate (117 files; no affected build modules or unresolved imports), and compiled Worker smoke tests. Existing full audit findings remain unsuppressed. The source patch has not yet been published to Sites.

## Remaining actions and approvals

1. Establish production identity-header sanitization/sole ingress through authoritative platform evidence or an authorized ingress test from a supported browser. No blind trust-flag activation is permitted.
2. Publishing this source repair requires a fresh short-lived credential limited to the existing Site's source repository. The original credential expired on 2026-10-22 at 11:08:23.602 UTC and was discarded. No renewal has been attempted. Prior GitHub commit/push authorization remains applicable.
3. Once the boundary is established, the requested auth repair needs only `PORTAL_RUNTIME=sites` and `PORTAL_TRUST_SITES_DISPATCH=true`, then deployment of the repaired saved version. A production credit key is a separate operation and is not needed for sign-in after this patch. It still requires its own approval before creation/configuration.
4. Keep event policy inactive/draft, imports empty and results unrevealed. Interactive sign-in and hostile-header rejection remain unverified.

## Reference screenshots

The browser inventory was rechecked once: only `Codex MCP Apps` with zero tabs is exposed; there is no IAB, Chrome or other web browser surface. No unsupported browser-control path was attempted. No screenshots or Library file IDs were created.

The documented setup is Settings > Computer Use > select the browser (expand More browsers if needed) > Install its plugin/extension > confirm Manage, then select that browser with an @-mention using the same profile. The Linux desktop documentation links this extension setup. See <https://learn.chatgpt.com/docs/chrome-extension> and <https://learn.chatgpt.com/docs/linux/linux-app>. Browser permission should be limited to the two reference sites and this portal for the requested tasks.
