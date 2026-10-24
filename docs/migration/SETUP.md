# Next.js / Neon migration setup contract

Prepared before migration dependencies on 24 October 2026. Source baseline: dc92672c0e9a50ebcfe458f2e7c692058a1483b7. No provider accounts, deployments, credentials, production records or DNS are changed by this checklist.

## Routing and authentication

Use one browser origin (`APP_ORIGIN=https://dddhack-portal.vercel.app`, availability unverified). The browser calls relative `/api/*`; Next.js forwards to the configured `NEON_API_ORIGIN`. Backend API and authentication run in Neon Functions. Google callback is exactly `${APP_ORIGIN}/api/auth/callback/google` (local: `http://localhost:3000/api/auth/callback/google`). Magic links return to `${APP_ORIGIN}/api/auth/magic/verify`. Cookies are host-only, HttpOnly, SameSite=Lax, Secure on HTTPS, Path=/; no third-party-cookie dependency. Backend verifies allowed origin for mutations and does not trust caller-supplied Sites identity headers. Redirects remain relative and validated. The proxy preserves separate Set-Cookie headers and strips unsafe hop/identity headers. Never put service credentials in NEXT_PUBLIC variables.

## Vercel frontend environment

- `APP_ORIGIN`: exact browser origin, no path/trailing slash.
- `NEON_API_ORIGIN`: exact deployed Neon Function origin; server-only.
- `PORTAL_PROXY_SECRET`: shared random secret for trusted proxy forwarding; server-only, same value on Neon.
- No database, SMTP, Google client secret, storage keys or OpenAI credentials belong on Vercel.
- Local synthetic rehearsal only: `PORTAL_LOCAL_TEST=1`, `PORTAL_LOCAL_DB=.local/portal.sqlite`; must be refused outside localhost/development.

## Neon backend environment

Automatically injected when services are enabled, do not redundantly copy/provision: `DATABASE_URL` (pooled), `DATABASE_URL_UNPOOLED` (direct for migrations/interactive transactions), `NEON_BRANCH`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_ENDPOINT_URL_S3`, `AWS_REGION`.

User-managed backend configuration: `APP_ORIGIN`, `AUTH_BASE_URL` (optional, defaults to APP_ORIGIN), `BETTER_AUTH_SECRET`, `PORTAL_PROXY_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `CREDIT_ENCRYPTION_KEY`, `NEON_MEDIA_BUCKET=project-media`, `JOB_RUNNER_SECRET`. Secrets are provisioned securely later, never in chat or Git. Preserve owner/participant identity linking by verified normalized email, no arbitrary role grant on login. Owner bootstrap remains explicit and controlled.

SMTP requires a selected provider, verified sending domain/address, SPF/DKIM and preferably DMARC. Use TLS (465 implicit or 587 STARTTLS), provider SMTP credentials, a From address allowed by that provider and deliverability testing. The user selected Gmail SMTP on smtp.gmail.com:465 with implicit TLS and a privately entered app password. No test email has been sent. Runtime outbound SMTP connectivity remains unverified. Google requires a Web OAuth client and the exact callback above registered; separate preview/local clients or exact callback entries, never wildcard callbacks.

## Neon configuration

Create a new empty/synthetic branch in an approved project/region after approval. Functions and Storage documented available regions: aws-us-east-2, aws-us-east-1, aws-eu-central-1, aws-ap-southeast-1. Singapore is a candidate for Delhi latency, subject to user selection and actual project availability. Node.js 24 API Function; Postgres/Drizzle versioned migrations; one private project-media bucket with logo/banner prefixes. The preserved UI submits bounded raster data URIs; the backend persists immutable bucket references and restores authorized API values. Optional signed PUT/finalize routes are implemented with ownership/size validation and require exact bucket CORS before a direct browser client uses them. Public lists validate metadata without fetching objects; each published image request reads only its selected raster. No production branch clone because branching also inherits data/objects.

Functions are request/response handlers, not durable background loops. Queue processing is an explicit authenticated request using durable leases, retries and idempotency. The Neon handler awaits bounded work in the same invocation (provider batch maximum one); no automatic scheduler is configured. A future cron/Function Trigger requires separately reviewed worker authentication and approval. Function waitUntil has a 15-minute cap and is not a job runner. Default account concurrency limit is 100; memory 2048 MiB; first-byte/idle-stream limit 15 minutes. Storage platform maximum single PUT 5 GiB/multipart 10 GiB, Free storage 5 GB/project, 503 SlowDown requires backoff. These platform caps do not replace application upload restrictions.

## OpenAI gate

No usable OPENAI_API_KEY was found in this Cloud environment. The user chose reuse and manual migration of the existing key into the backend. Agent credential extraction is not authorized; the user later approved bounded project descriptions, explicitly selected source files and commit metadata to OpenAI. Credentials, voucher values, phones and unrelated profiles remain excluded. Current task key presence remains no, so no real call has run. Never extract the Sites key. Future backend configuration must use an explicitly approved `OPENAI_MODEL` rather than an invented Astra model ID. No credentials or model calls are required for independent migration and synthetic offline fixtures.

## Verified official references (24 October 2026)

- https://neon.com/docs/compute/functions/overview
- https://neon.com/docs/compute/functions/environment-variables
- https://neon.com/docs/compute/functions/authentication
- https://neon.com/docs/compute/functions/reference/runtime-limits
- https://neon.com/docs/storage/overview
- https://neon.com/docs/storage/objects

Deployment, production-data movement, credential provisioning, purchases and DNS cutover require later approval. Live Sites and its default branch remain untouched.
