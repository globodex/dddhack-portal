# User-operated deployment handoff

The user handles all deployment. No agent provider connection, token sharing, CLI sign-in, account provisioning or automatic deployment is required by this handoff. The reviewed source is GitHub branch `main`; the repository default and live Sites branch remain unchanged. No production records or DNS are moved.

## Non-secret details to share

1. Target project `mute-mud-82135883`, development branch `br-divine-tooth-azx4j4md` (user supplied; verify the actual target before writes).
2. Public `portalapi` Function invocation URL after deployment.
3. Final frontend URL after the user deploys it to Vercel.

Never share passwords, API keys, connection strings, auth/proxy secrets, session cookies or env-file contents in chat. These identifiers are deployment selectors, not application runtime credentials. Singapore (`aws-ap-southeast-1`) and private `project-media` are the intended configuration; inspect the actual target before applying anything.

## Deployment files

- `neon.ts`: Node.js 24 Function `portalapi`, entry `neon/api.ts`, private bucket declaration, explicit backend environment allowlist and `externalPackages: ["sharp"]`.
- `artifacts/neon/portalapi.zip`: locally built official Neon archive, including native ARM64 sharp/libvips and the required CommonJS banner. Its receipt records the runtime source revision and SHA-256. It contains no env files, credentials, test fixtures or production data. Unmodified ARM64 execution still requires hosted verification.
- `neon/migrations/0000*` through `0004*`, plus `neon/auth-migrations/0001_auth.sql` and `0002_approved_evaluation.sql`: reviewed schema/invariants, ordered by `neon/migration-plan.ts` in one checksum ledger. They create schema only and transfer no production rows.
- Next.js frontend: repository `main`, Node.js24, `npm ci`, `npm run build`, Next.js framework preset. Deploy this reviewed branch/checkout without changing the GitHub default branch or publishing Sites.

Neon's official deployment API accepts a ZIP source part plus an environment JSON map on the branch/function deployment endpoint. A plain single TypeScript file or one-file bundle without native dependencies is insufficient. Console source-editor/upload capabilities have not been verified here; do not assume a particular menu exists. The user may use their own supported deployment method. [Official Function deployment contract](https://neon.com/docs/compute/functions/deploy)

## Exact runtime environment map

| Variable                                | Neon Function                                                     | Vercel                                                    |
| --------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------- |
| APP_ORIGIN                              | Exact final frontend origin                                       | Same origin                                               |
| PORTAL_PROXY_SECRET                     | Private random value, minimum32characters                         | Exact same private value                                  |
| BETTER_AUTH_SECRET                      | Private random value, minimum32characters                         | No                                                        |
| GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET | Existing Web OAuth client values                                  | No                                                        |
| SMTP_HOST                               | smtp.gmail.com                                                    | No                                                        |
| SMTP_PORT / SMTP_SECURE                 | 465 / true                                                        | No                                                        |
| SMTP_USER / SMTP_PASS                   | Gmail address / private app password                              | No                                                        |
| SMTP_FROM                               | Plain sender address is simplest; named address also supported    | No                                                        |
| NEON_MEDIA_BUCKET                       | project-media (default)                                           | No                                                        |
| NEON_API_ORIGIN                         | No                                                                | Public Function **origin**, without a trailing path/slash |
| OPENAI_API_KEY                          | Manually reused key, backend only                                 | No                                                        |
| OPENAI_MODEL                            | Explicit available Responses/Structured Outputs model; no default | No                                                        |
| PORTAL_OPENAI_EVALUATION_APPROVED       | false by default; enable only for approved snapshot processing    | No                                                        |

`AUTH_BASE_URL` is optional and defaults to APP_ORIGIN. `AUTH_SECRET` and `SMTP_PASSWORD` are compatibility aliases for BETTER_AUTH_SECRET and SMTP_PASS, so duplicate secrets are unnecessary. This implementation uses custom auth with jose/nodemailer, not a managed Auth service. `CREDIT_ENCRYPTION_KEY` is optional for legacy encrypted credits; no legacy data/key is transferred. `JOB_RUNNER_SECRET` is reserved and unused; no separate scheduler is configured.

Neon automatically injects enabled `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `NEON_BRANCH`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_ENDPOINT_URL_S3` and `AWS_REGION`. Do not redundantly copy these into a deployed Function or put them on Vercel. Local reproductions may use gitignored `.env.backend.local` and `.env.frontend.local` with restrictive permissions. Codex Cloud Envvars are a separate test environment and do **not** configure the deployed Function/Vercel runtimes. [Injected environment contract](https://neon.com/docs/compute/functions/environment-variables)

## Authentication and storage contracts

Google callback: `https://dddhack-portal.vercel.app/api/auth/callback/google`; localhost callback: `http://localhost:3000/api/auth/callback/google`. If the final frontend origin changes, register its exact callback and configure APP_ORIGIN consistently before testing. Browser API/auth calls stay same-origin through Next's trusted proxy, with host-only HttpOnly Secure SameSite=Lax cookies. Direct Function requests without proxy proof fail closed.

The preserved UI posts bounded PNG/JPEG data URIs; the backend stores immutable private bucket references. Public lists fetch no object bytes; each eligible published image route retrieves and verifies only its requested image. Optional signed-upload APIs require exact bucket CORS before a direct browser client uses them. Neither anonymous bucket access nor public project-list access exposes drafts, team ideas, phones or scores.

## Reviewed schema operation and verification

Node.js24 is required. In an existing checkout, preserve local edits and inspect before switching/fetching; do not reset others' work. The migration runner's default is **file inspection only**, with no database connection:

```sh
node --env-file=.env.backend.local --import tsx neon/scripts/migrate.ts
```

There is no `--dry-run` flag. Applying the reviewed empty/synthetic development target requires both the explicit `--apply-synthetic` flag and `PORTAL_SYNTHETIC_DATABASE=1`. This has not been run against the user's hosted database by this task. Do not run the fixture seed against a hosted branch. Never use `drizzle-kit push`: it would omit required invariant/immutability triggers.

After the user deploys, verify Google login/logout, verified-email identity linking, roles, one bounded private image upload and authorized synthetic writes. SMTP connectivity from **Neon Functions** remains unverified; a refused Cloud SMTP connection does not establish Neon runtime behavior. The user approved one test login email to the owner; none has been sent by this implementation task. Avoid duplicate sends.

Jobs use durable Postgres leases/retries and explicit authenticated portal requests. Provider batches are capped at one and awaited within that invocation. No cron, fire-and-forget loop or automatic data export is configured. The selected snapshot must be approved against current published repository evidence; input excludes credentials, voucher codes, phones and unrelated profiles. Reports remain unscored and need human review; accepted scoring/reveal requirements are unchanged.

A separately approved one-request **synthetic-only** OpenAI smoke is available in `neon/scripts/evaluation-smoke.ts`; it requires a present key, explicit model and `PORTAL_OPENAI_SMOKE_APPROVED=1`, permits at most one outbound request, reads no repository/user records and prints metadata only. This task's environment has no key, so no provider call has run.

Hosted OAuth, SMTP, object access, ARM64 execution and latency still need verification. Local tests/screenshots are supporting evidence, not a hosted capacity claim. No production-data transfer, scheduler activation, purchases or DNS/Sites cutover is included.
