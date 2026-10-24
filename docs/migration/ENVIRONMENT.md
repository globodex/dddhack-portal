# Secret and variable destinations

The intended public browser origin is `https://dddhack-portal.vercel.app`; name availability and deployment are unverified. Use one same-origin proxy from Vercel to Neon. The Google callback is `https://dddhack-portal.vercel.app/api/auth/callback/google`.

| Destination | Variables | Secrets |
| --- | --- | --- |
| Vercel frontend | APP_ORIGIN, NEON_API_ORIGIN | PORTAL_PROXY_SECRET |
| Neon API Function | APP_ORIGIN, AUTH_BASE_URL, GOOGLE_CLIENT_ID, SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_FROM, NEON_MEDIA_BUCKET=project-media | AUTH_SECRET, PORTAL_PROXY_SECRET, GOOGLE_CLIENT_SECRET, SMTP_USER, SMTP_PASSWORD, CREDIT_ENCRYPTION_KEY |
| Codex Cloud synthetic tests | PORTAL_LOCAL_TEST=1, APP_ORIGIN=http://localhost:3000, NEON_API_ORIGIN=http://127.0.0.1:8788 | None |
| Codex Cloud future approved backend integration | Same backend configuration, restricted to a dedicated synthetic database and object prefix/bucket | Same provider credentials only if user supplies them securely; never live-data targets |

Neon automatically injects `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `NEON_BRANCH` and enabled storage `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_ENDPOINT_URL_S3`, `AWS_REGION`. These need no manual runtime copy. Managed Better Auth, AI Gateway and Realtime are not required for this custom backend.

Local files are gitignored `.env.frontend.local` and `.env.backend.local`, with restrictive local permissions. The frontend file contains only the frontend row. The backend file contains the backend row and local-only Neon variables pulled from an approved synthetic branch. Never place secrets in NEXT_PUBLIC variables, screenshots, terminal history, logs, source files or chat. The root `.env.example` is documentation, not a deployable secret file.

The user chose manual reuse of the existing OpenAI key. Its sole future destination is the Neon backend, and its model must be configured explicitly using `OPENAI_MODEL`. No API value is stored in this repository; provider code/real evaluation stays paused until its destination and private-data scope are approved. Never retrieve the Sites key. A model name was not invented.

When deployment is separately approved, the supported file-loading route is `neon deploy --env .env.backend.local`; `neon.ts` forwards only declared nonempty user-managed variables. Do not put secret values into command-line arguments. Neon docs confirm this `--env` takes a file path, while `neon functions deploy --env` takes KEY=VALUE and therefore has different semantics. Deployment sends source to Neon and requires separate approval; it has not run here.

Official references checked 24 October 2026: [environment variables](https://neon.com/docs/compute/functions/environment-variables), [configuration](https://neon.com/docs/reference/neon-ts), [deploy](https://neon.com/docs/compute/functions/deploy). The parent guides setup one step at a time; this file is the complete reference, not a request to perform every step now.
