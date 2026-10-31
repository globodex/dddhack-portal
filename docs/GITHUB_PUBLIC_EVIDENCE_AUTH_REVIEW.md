# Public repository evidence authentication — local implementation, owner setup pending

Reviewed31October2026. No token, App, installation, secret or authenticated GitHub request was created/read/configured. The local candidate now supports optional server-only public-read transport; no hosted deployment has been performed. No token is required for anonymous fallback, but anonymous limits are unsuitable for event-wide unattended processing.

## Recommendation for this event

Use a dedicated, short-lived **fine-grained personal access token with public read-only access**, subject to owner approval of this reviewed candidate and private credential setup. GitHub documents that fine-grained tokens retain read-only access to all public repositories. Keep the default public-only access and add no private-repository, write, administration, workflow, organization or account permissions. Do not select broad private/all-repository access merely to increase quota. This suits participant repositories spread across unrelated owners without participant installation onboarding. The token is tied to its creator; choose an event-duration expiry and revoke it afterward. [GitHub token guidance](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)

Optional server secret: **PORTAL_GITHUB_PUBLIC_READ_TOKEN**. Store it only in the existing **portalapi Neon Function user-defined runtime environment**; an owner-managed private `.env.backend.local` may be its local source. Never use NEXT_PUBLIC, browser storage, chat, Library, Git, audit payloads or evaluation snapshots. Only the backend evaluation entrypoints consume this name. It is never part of client data or persisted evaluation input.

## Quota and alternative

Anonymous REST reads share60requests/hour by source IP. Personal authenticated requests generally share the creator's5,000/hour budget; a new token does not create an independent user budget. Installation tokens start at5,000/hour and can scale for eligible installations; enterprise cases differ. Secondary limits still apply, and403/429 recovery must respect rate-reset/retry-after headers. A credential increases capacity, not permission to retry aggressively. [Rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)

A **GitHub App** is preferable for a longer-lived service identity when its installation coverage is established. It requires an App ID/private key, installation selection and regeneration of one-hour installation tokens. GitHub limits installation grants to their installed repositories/permissions. Public endpoint exemptions exist, so we should not categorically claim arbitrary public reads fail; however, cross-owner public coverage has not been tested here. Do not promise an organizer-only installation is a drop-in solution for all participant repositories without that validation. An installation-per-repository design adds participant onboarding and repository-to-installation mapping. [Installation authentication](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/authenticating-as-a-github-app-installation)

## Exact endpoint coverage

All current requests are fixed-host GETs to api.github.com. The endpoint documentation supports fine-grained tokens and public reads without the listed private-resource permissions:

| Existing read | Documented private-resource permission |
|---|---|
| /repos/{owner}/{repo} | Metadata read |
| /repos/{owner}/{repo}/commits (head/history/page) | Contents read |
| /repos/{owner}/{repo}/git/commits/{sha} | Contents read |
| /repos/{owner}/{repo}/git/trees/{sha}?recursive=1 | Contents read |
| /repos/{owner}/{repo}/git/blobs/{sha} | Contents read |

Sources: [repository](https://docs.github.com/en/rest/repos/repos#get-a-repository), [commit listing](https://docs.github.com/en/rest/commits/commits#list-commits), [Git commit](https://docs.github.com/en/rest/git/commits#get-a-commit-object), [tree](https://docs.github.com/en/rest/git/trees#get-a-tree), [blob](https://docs.github.com/en/rest/git/blobs#get-a-blob). These are documented capabilities, not a completed credential-access test.

## Implemented safeguards and owner handoff

The optional token is read only by server runtime entrypoints and passed into a per-job reader. That reader permits only fixed api.github.com repository metadata/commits/tree/blob GET endpoints, forbids arbitrary query parameters and redirects, checks public visibility before source reads, and limits each job preparation to16 API requests including rejected file candidates. Private/unknown repositories do not reach source selection. No credentials are attached to model calls or other fetches. Upstream echoes of the configured token in JSON, headers or decoded blobs are rejected before snapshot selection. Missing token preserves anonymous behavior; invalid/expired/forbidden credentials become sanitized access failures, never an ineligibility verdict. We do not fall back anonymously after an authentication failure, which could conceal a bad configuration.

Rate-limit responses persist only a constant failure code and validated retry timestamp. Both own-job starts and native scheduled recovery wait until that time, without incrementing attempts or calling the provider. Retry-After/reset deadlines are not shortened. Errors, logs, audit entries, snapshots and participant projections never contain raw upstream response bodies, request headers or tokens. Participant copy says evaluation awaits retry/organizer attention; it does not leak credential configuration. Existing three-attempt and immutable-version safeguards remain.

Recommended owner setup, only after this candidate is approved for publication:

1. GitHub Settings → Developer settings → Personal access tokens → Fine-grained tokens. Choose a short event-duration expiry and the public-read-only/default public access; no extra private/write/admin/workflow/account/org grants. Never paste the value into chat, Git, screenshots or Library. A public-only token is important: the transport checks visibility, but a remote visibility change cannot be made atomic with GitHub source reads.
2. Store the value as PORTAL_GITHUB_PUBLIC_READ_TOKEN through the existing private server environment management for the EXISTING portalapi Neon Function deployment. An owner-managed ignored .env.backend.local may be the local source. The agent did not read/create/configure one. Never use NEXT_PUBLIC or browser settings. Omitted deployed values are preserved by the existing targeted deployment flow without --env; do not accidentally clear other secrets.
3. Verify the existing selected owner model (or OPENAI_MODEL fallback), OPENAI_API_KEY and PORTAL_OPENAI_EVALUATION_APPROVED=true through the owner's private workflow. An optional GitHub token does not enable or pay for AI by itself.
4. Separately configure a native Neon scheduled POST to /api/evaluation/automatic-tick and forward its exact ID as PORTAL_EVALUATION_TRIGGER_ID. Minimum native schedule interval is1minute. This route relies on Neon's stripping client-supplied X-Neon headers; do not substitute an arbitrary public cron request. No trigger was created/enabled here.
5. Owner-approved hosted verification is still needed for token endpoint coverage, provider access, scheduled invocation, database/ARM64 execution and final timing/privacy flow. Mock tests do not establish those. Revoke the event token afterward.

No new database migration is introduced by optional authentication/backoff; existing job error storage holds sanitized state. The underlying latest-spec19-entry plan still applies. Separate question-response weights/formula/caps/double-count rules, nondemographic contribution scoring and provisional feedback minimum30 remain unresolved; authentication changes no scoring formula.

Official server environment and scheduler guidance: [Neon environment documentation](https://neon.com/docs/compute/functions/environment-variables), [native schedules](https://neon.com/docs/compute/functions/triggers/schedule). Rate handling follows [GitHub REST best practices](https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api), except redirects deliberately fail closed to preserve the fixed-host credential boundary.
