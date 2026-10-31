# Public repository evidence authentication — proposal only

Reviewed31October2026. No token, App, installation, secret or authenticated GitHub request was created/read/configured. Current code remains anonymous-only. Do not enable event-wide unattended evaluation on the assumption that setting a token already works.

## Recommendation for this event

Use a dedicated, short-lived **fine-grained personal access token with public read-only access**, subject to explicit owner approval and a separately reviewed transport patch. GitHub documents that fine-grained tokens retain read-only access to all public repositories. Keep the default public-only access and add no private-repository, write, administration, workflow, organization or account permissions. Do not select broad private/all-repository access merely to increase quota. This suits participant repositories spread across unrelated owners without participant installation onboarding. The token is tied to its creator; choose an event-duration expiry and revoke it afterward. [GitHub token guidance](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)

Proposed server secret: **PORTAL_GITHUB_PUBLIC_READ_TOKEN**. Store it only in the existing **portalapi Neon Function user-defined runtime environment**; an owner-managed private `.env.backend.local` may be its local source. Never use NEXT_PUBLIC, browser storage, chat, Library, Git, audit payloads or evaluation snapshots. No current implementation reads this proposed name.

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

## Approval and handoff

Proposed approval request: **Approve server-only public-read token support under PORTAL_GITHUB_PUBLIC_READ_TOKEN; I will create/store the token myself. Keep private repositories excluded, do not access credentials, and show tested code/package before deployment.**

After that approval, the implementation should attach authorization only to validated GitHub GETs, prohibit redirects, retain the public-repository check, sanitize errors, respect provider backoff and impose a clear candidate-fetch request budget. Six approved files is not itself a twelve-request upper bound: rejected candidates can require additional blob reads within the existing tree/time limits. Keep paid evaluation attempts bounded and never classify transport/rate-limit errors as ineligibility. Test fake-token non-disclosure, foreign-host refusal, public/private behavior, expiry and rate-limit recovery before any owner-run authenticated smoke check.

GitHub Settings → Developer settings → Personal access tokens → Fine-grained tokens is the documented owner creation path. The owner should enter the value only through their private secret-management workflow. Neon documents per-deployment runtime variables and preservation of omitted variables; an approved secret-addition handoff must preserve existing origins/keys. This review does not authorize using new --env flags or modifying the current deployment. [Neon environment documentation](https://neon.com/docs/compute/functions/environment-variables)
