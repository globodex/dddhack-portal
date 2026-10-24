# Manual migration and deployment runbook

This is the user-operated path. No plugin connection is required. These commands have not deployed the portal. Keep the live Sites branch, default branch setting, production records and DNS unchanged. The GitHub `main` branch is a migration branch descended from verified v7; it is not the repository default.

## 1. Local checkout and private files

Use Node.js 24 and install the official CLIs on your own machine if absent:

```sh
npm install -g neon vercel
git clone https://github.com/Param302/dddhack-portal.git
cd dddhack-portal
git switch main
npm ci
neon login
vercel login
```

If the repository already exists locally, fetch and switch to `main` after preserving local edits; do not clone over it or reset someone else's work. Browser login is performed by you. Never send tokens, passwords, env-file contents or CLI authentication files through chat.

Create gitignored `.env.backend.local` and `.env.frontend.local` privately with restrictive permissions. On macOS/Linux, `chmod 600 .env.backend.local .env.frontend.local`. Copy variable names from `.env.example`, not secret values from Sites. Backend file:

- Required: `APP_ORIGIN=https://dddhack-portal.vercel.app`, `BETTER_AUTH_SECRET`, `PORTAL_PROXY_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, `SMTP_SECURE=true`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`.
- `SMTP_FROM` may be the plain Gmail address. The app also supports a named address. `SMTP_PASS` is the privately generated Gmail app password.
- Generate distinct authentication/proxy secrets privately, for example with `openssl rand -hex 32` for each. The same proxy value goes in both backend and frontend configurations. `AUTH_SECRET` and `SMTP_PASSWORD` are compatibility aliases; do not create duplicate values. `AUTH_BASE_URL` is optional and defaults to APP_ORIGIN.
- `DATABASE_URL` and `DATABASE_URL_UNPOOLED` must both target the empty/synthetic **development** branch. Postgres URLs and storage keys are pulled from Neon below; do not copy production values.
- `NEON_MEDIA_BUCKET=project-media` is the default. Legacy `CREDIT_ENCRYPTION_KEY` is optional and only needed for already encrypted legacy credits, which are not transferred in this migration. Do not extract a Sites key.
- OpenAI remains opt-in. The reused `OPENAI_API_KEY` belongs only in backend configuration. `OPENAI_MODEL` must be an actual available model selected/configured explicitly, and approved snapshot selection is required. No Astra API model ID is assumed. Real evaluation is not activated by deploying alone.

Frontend file contains only `APP_ORIGIN`, `NEON_API_ORIGIN` (after the Function exists) and `PORTAL_PROXY_SECRET`. No NEXT_PUBLIC secrets or database/provider credentials.

## 2. Link and inspect the development target

Obtain the project ID from your existing Neon project and substitute it below; it is an identifier, not a password:

```sh
neon link --project-id <project-id> --branch development --no-env-pull
neon env pull --file .env.backend.local
node --env-file=.env.backend.local --import tsx neon/scripts/migrate.ts
neon config plan --env .env.backend.local --branch development
```

Confirm the linked branch is `development`, region is Singapore (`aws-ap-southeast-1`), and the existing bucket is private `project-media`. `env pull` adds enabled branch-managed DATABASE_URL/DATABASE_URL_UNPOOLED/AWS_* values and preserves other env lines. Do not print or commit that file. The migration command above only prints migration names/checksums. The config plan must show only the reviewed API Function/private bucket changes, without unexpected service/branch/production changes. Do not use automatic overwrite/protected-branch flags.

## 3. Apply reviewed schema and deploy the backend

After separately approving the inspected development target and reviewed schema/deployment:

```sh
PORTAL_SYNTHETIC_DATABASE=1 node --env-file=.env.backend.local --import tsx neon/scripts/migrate.ts --apply-synthetic
neon deploy --env .env.backend.local --branch development
neon functions get portalapi --branch development
```

The schema runner is versioned/checksummed and defaults to inspection; it transfers no production rows. Do not run the fixture seed against a hosted branch. The Function config declares `externalPackages: ["sharp"]`; Neon's official bundler stages the ARM64 native package and CommonJS interoperability banner. A plain one-file esbuild output is insufficient for deployment. The validated archive is close to the compressed size cap, so recheck package size after backend dependency growth.

Record the Function's public invocation **origin** as `NEON_API_ORIGIN`; do not share a credential-bearing URL. Neon injects enabled database/storage credentials automatically at Function runtime. SMTP outbound connectivity from this deployed runtime must be verified; Cloud SMTP port failures do not establish Neon runtime behavior. No test email has been sent by this implementation task.

## 4. Configure and build Vercel

Use `vercel link` interactively to choose the intended project. Confirm the project name/domain is available; no availability is assumed. Do not change the GitHub repository's default branch, connect an unintended live branch or enable an automatic deployment as a side effect. Configure server-only Vercel variables in its UI or its interactive `vercel env add` prompts:

- `APP_ORIGIN=https://dddhack-portal.vercel.app`
- `NEON_API_ORIGIN=<public Function origin>`
- `PORTAL_PROXY_SECRET=<same private proxy secret>`

Never put database URLs, Google client secret, SMTP password, storage keys or OpenAI key on Vercel. Build and review first:

```sh
npm run typecheck
npm test
npm run build
```

The final public deployment/promotion is a separate user-approved step. When explicitly approved, the user may run `vercel --prod` from this reviewed `main` checkout. This sends the frontend source to Vercel; it does not migrate production data or republish Sites. If an alternate/preview origin is chosen, configure that exact APP_ORIGIN and register its exact Google callback before testing authentication.

## 5. Verify actual flows before switching users

Google's exact callback is `https://dddhack-portal.vercel.app/api/auth/callback/google`; localhost callback is `http://localhost:3000/api/auth/callback/google`. Browser API/auth calls stay same-origin through the Next proxy with host-only HttpOnly Secure SameSite=Lax cookies. Direct Function calls without the proxy secret fail closed.

Verify Google login/logout, verified email-to-existing-user linking, role boundaries, a bounded private image upload, and authenticated read/write on synthetic data. The user approved **one** test login email to the owner address; send it only after connectivity/configuration are verified and avoid duplicate sends. Do not send it from an unverified environment.

Verify submission attempt races, check-in, credits instructions/mappings/deletions and staged score disclosure using isolated synthetic targets. Local native PostgreSQL and offline/provider fixtures are already tested; they do not prove hosted SMTP, OAuth, Object Storage or latency. Preserve cache/motion/image budgets and reduced-motion behavior. No production-data transfer or DNS/Sites cutover is included.

Queue processing remains an explicit bounded request using durable job leases/retries; automatic cron activation is separate. Before enabling any scheduler, verify worker authentication, current-admin authorization, model configuration, approved snapshot payloads and idempotency. Never rely on process memory or waitUntil alone for durable jobs.

## Codex Cloud environment note

The current Cloud UI uses private **Envvars** for direct Postgres/SMTP clients. Network secrets are HTTPS proxy placeholders and do not substitute for raw TCP client credentials. Save/Republish, then start a fresh task to inherit updated values; the current process does not gain them automatically. Check presence only and never print values. No broad network setting authorizes unrelated private-data transfers.

Official references: [Neon install/login](https://neon.com/docs/cli/install), [Neon config/deploy](https://neon.com/docs/compute/functions/deploy), [Neon injected variables](https://neon.com/docs/compute/functions/environment-variables), [Vercel CLI login](https://vercel.com/docs/cli/login).
