# DDD Hack portal: Next.js and Neon migration

The unpublished redesign is on `feat/portal-experience-rework`. See the [24 October review and screenshot index](docs/PORTAL_REDESIGN_REVIEW_2026_10_24.md), [backend artifact](artifacts/neon/README.md), and [populated-database incremental upgrade plan](docs/ADMIN_OPERATIONS_AI_WINDOWS_ROLLOUT.md). Publication remains the owner's manual action; never seed or use synthetic apply flags on the populated hosted database.

The `main` branch migrated verified v7 (`dc92672c`) to real Next.js App Router frontend/rendering on Vercel and a separate Node.js 24 Neon Functions backend. The retained Sites source is historical. This redesign work has not deployed, transferred production data or changed provider settings.

Browser requests stay on the frontend origin: `/api/*` proxies to Neon with a server-only trust secret. Neon verifies sessions and permissions, runs the existing portal services against Postgres through a Drizzle-defined schema and transactional adapter, and stores project images in the private `project-media` bucket. Custom SMTP magic links and Google OAuth run in the backend. No database, SMTP, Google secret, storage key or OpenAI key belongs in Vercel browser variables.

See [setup contract](docs/migration/SETUP.md), [secret destinations](docs/migration/ENVIRONMENT.md) and [parallel ownership](docs/migration/OWNERSHIP.md). Existing SQLite migrations, Sites wrappers and historical release evidence remain available for comparison; they are not the new production frontend runtime.

Local synthetic UI rehearsal uses two processes: `PORTAL_LOCAL_TEST=1 APP_ORIGIN=http://localhost:3000 node --import tsx neon/local-server.ts`, then `PORTAL_LOCAL_TEST=1 APP_ORIGIN=http://localhost:3000 NEON_API_ORIGIN=http://127.0.0.1:8788 PORTAL_PROXY_SECRET=local-synthetic-proxy-secret-for-nextjs npm run dev`. The local fixture adapter binds loopback and refuses production mode. Use `/local-test` to switch disposable accounts. Run `npm run build` for the real Next.js artifact.

Keep backend credentials in gitignored `.env.backend.local` and frontend values in `.env.frontend.local`; never paste secrets into chat or commands. Remote database tests must target an explicitly approved synthetic branch. Versioned Postgres migrations are reviewed separately before application. OpenAI evaluation and private data egress remain gated; fixture execution does not call a provider.

---

## Historical Sites documentation

# DevDay Exchange Community Hackathon: New Delhi

The revised core is **published as public version 4** at [dddhack-portal.param3021.chatgpt.site](https://dddhack-portal.param3021.chatgpt.site). Read [the publication record](docs/CORE_PUBLICATION.md), [session/reveal/policy behavior](docs/SESSION_AND_REVEALS.md) and [visual QA limits](design-qa.md). Typecheck, 41 regression tests, official production build/artifact gate and compiled Worker smoke pass. Interactive browser/device QA remains unverified.

The latest UI provides private team customization, an eligible upvote-ordered public project list, required self-reported private gender, role-scoped review/admin tools, and owner-managed public/private event content. Event policies remain draft; no real data, grants, API calls or new credentials were introduced. AI evaluation remains Not configured.

## Run locally

Node 24+, npm and Git are required. No credentials or external API calls are needed.

```sh
npm ci
npm run db:local
PORTAL_LOCAL_TEST=1 npm run dev
```

Open `http://127.0.0.1:5173/`; use `/local-test` to select a clearly fake account. The owner fixture is `owner@portal.test`, not the production owner's email. Fake users, 1/3/5-person teams and `FAKE-NOT-REDEEMABLE-*` credit inventory are seeded into ignored `.local/portal.sqlite`. Data survives process restarts. Existing databases are preserved. Set `PORTAL_LOCAL_DB` to a fresh path for a new rehearsal. Do not place real data in this adapter. To disable it, omit `PORTAL_LOCAL_TEST`; production builds exclude the local runtime. The Worker requires explicit Sites Dispatch trust and D1. Profile/dashboard access works without a credit key; credit operations fail closed until a production key is configured.

Portable shell equivalents: Windows PowerShell uses `$env:PORTAL_LOCAL_TEST='1'; npm run dev`. All previews are loopback only.

## Validate

```sh
npm run typecheck
npm test
npm run build
npm run test:production  # built Worker + isolated synthetic Dispatch/D1 harness
PORTAL_LOCAL_TEST=1 npm run dev  # retained terminal for browser tests
CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e
npm run test:load
npm exec -- tsx scripts/backup-local.ts
```

Browser testing uses an installed Chromium; set `CHROMIUM_PATH` for your machine. Server tests include a real **local Miniflare D1 binding**, not just the SQLite adapter. Load tests use 200 distinct fake HTTP sessions plus independent WAL worker threads. They do not establish hosted Sites capacity or real ChatGPT sign-in. Test evidence is under `evidence/`; screenshots are delivered through Library (see `docs/DELIVERY.md`). Build warnings from Vinext's chunk layout are recorded and are not test failures.

The test command disables WebAssembly code GC to avoid the documented [Node24/PGlite native crash](https://github.com/nodejs/node/issues/66366). This flag affects only the test process; production commands, database guards and test assertions are unchanged.

## Architecture and security

- Vinext App Router, React, TypeScript; public and protected screens call a server API. SQLite is only the named local adapter. The domain service accepts the D1 interface and uses parameterized, one-statement `prepare()` calls and atomic `batch()` writes.
- Schema/migration: `db/migrations/` (ordered additive migrations; see the current revision checkpoint). Constraints and triggers enforce one membership, five-person cap, idea lock, three submission versions, credit uniqueness, vote limits and immutable audit/results. Race-sensitive limits are checked in SQL. Scoring revision checks reject a snapshot if its inputs changed while it was computed.
- The request-scoped Sites handler consumes **server-injected** `oai-authenticated-user-id` and email behind Sites Dispatch. `connectwithparam.30@gmail.com` is owner only when derived from that verified identity. No client email or requested role establishes ownership. Staff access is re-read on each request. Judges cannot access credits.
- `.env.example` contains names/placeholders only. Fake inventory uses AES-256-GCM with an explicitly non-secret local test key. Production requires a new server-side key configured through Sites secrets. Codes are never in safe exports, audit values, public queries or frontend source. There is intentionally no bulk secret export.
- Mutation API requires same-origin JSON, bounded request bodies, server RBAC and per-account throttling. CSV previews expire after 15 minutes; imports revalidate and preserve existing approvals. CSV exports neutralize spreadsheet formulas. React escapes user text. No arbitrary repository code is executed and no external URLs are fetched by this v1.
- Profiles start private. Required self-reported gender includes prefer not to say and remains private even when a profile is public. No demographic inference or automatic demographic scoring exists.
- Luma is manual: import roster → review/approve → export safe emails → manually approve in Luma → mark confirmed. No email delivery, provider credits, account provisioning or production role grants were performed.

## Before live use

Read `docs/PUBLICATION.md`, `docs/SITES_INTEGRATION.md`, `docs/ROUTE_MATRIX.md`, `docs/OPERATOR_RUNBOOK.md` and `docs/SECURITY.md`. The installed official Sites 1.1.1 starter supplies the maintained `sites()` plugin, Cloudflare Worker, request-scoped connector handling, auth helpers and build tooling. The Worker captures D1/identity per request, and protected pages use the official server auth helper with server-side permission checks. The manifest declares logical `DB`, persists the approved new Site ID, and leaves unused R2 null. Native Sites publication and DB provisioning succeeded; see the publication record for verification limits. Never enable Dispatch trust on an independently exposed Worker. Hosted sign-in, ingress header stripping, storage and capacity still require a real authorized Sites rehearsal. The public landing can render without private runtime configuration.

The original design references could not be opened through the supplied network or web reader. Reference screenshots and verified official dot assets remain blocked. The UI uses original dot artwork, explicitly described as such, with no endorsement claim. Fontsource Manrope and DM Sans are bundled locally under their included licenses.

Dependency auditing still reports inherited framework/tooling findings. Available `fflate`, Miniflare `sharp`/`undici`/`ws` and plugin `ws` fixes are pinned; remaining findings and their reachability limits are recorded in `docs/SECURITY.md`. No forced downgrade or unsupported replacement was used. The production artifact mitigation and remaining build-environment risk are documented in `docs/DEPENDENCY_REACHABILITY.md`. The artifact gate must pass for each release; hosted identity/runtime setup and owner policy activation remain separate requirements.


Latest local implementation and pending release gates: [23 October checkpoint](docs/OPERATIONAL_RELEASE_2026_10_23.md). This supersedes historical team-Going, optional-sex and artwork-blocker notes. Public v4 remains unchanged until a separately authorized deployment.

Latest late-call corrections: [three-step onboarding, imported-roster gate, symbolic avatars and same-team phone privacy](docs/LATE_PROFILE_ROSTER_2026_10_23.md). This supersedes participant photos and geometric team badges in the earlier checkpoint; it remains unpublished with explicit input/visual gates.
