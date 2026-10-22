# DevDay Community Hackathon: New Delhi — v1 rehearsal

**A published Sites draft with the supported Worker/build integration. Native publication and public access succeeded; direct HTTP verification from this executor is blocked by 403. Private runtime configuration and real hosted ChatGPT sign-in remain pending.** This is the new `dddhack-portal` project, separate from `devday-recap`.

The portal covers registration review, private onboarding, teams/ideas, check-in and encrypted personal credits, three leader submission versions, review jobs, judges, votes/feedback, and owner-controlled result snapshots. Event: **1 November 2026, Asia/Kolkata**. The initial policy is deliberately draft; the submission cutoff, diversity rubric, vote formula and AI fallback are unresolved. Activation, scoring and publication fail closed.

## Run locally

Node 24+, npm and Git are required. No credentials or external API calls are needed.

```sh
npm ci
npm run db:local
PORTAL_LOCAL_TEST=1 npm run dev
```

Open `http://127.0.0.1:5173/`; use `/local-test` to select a clearly fake account. The owner fixture is `owner@portal.test`, not the production owner's email. Fake users, 1/3/5-person teams and `FAKE-NOT-REDEEMABLE-*` credit inventory are seeded into ignored `.local/portal.sqlite`. Data survives process restarts. Existing databases are preserved. Set `PORTAL_LOCAL_DB` to a fresh path for a new rehearsal. Do not place real data in this adapter. To disable it, omit `PORTAL_LOCAL_TEST`; production builds exclude the local runtime. The Worker requires explicit Sites Dispatch trust, D1 and a credit key; missing configuration returns 503 for protected data.

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

## Architecture and security

- Vinext App Router, React, TypeScript; public and protected screens call a server API. SQLite is only the named local adapter. The domain service accepts the D1 interface and uses parameterized, one-statement `prepare()` calls and atomic `batch()` writes.
- Schema/migration: `db/migrations/` (ordered `0001_portal.sql`, then `0002_tie_resolutions.sql`). Constraints and triggers enforce one membership, five-person cap, idea lock, three submission versions, credit uniqueness, vote limits and immutable audit/results. Race-sensitive limits are checked in SQL. Scoring revision checks reject a snapshot if its inputs changed while it was computed.
- The request-scoped Sites handler consumes **server-injected** `oai-authenticated-user-id` and email behind Sites Dispatch. `connectwithparam.30@gmail.com` is owner only when derived from that verified identity. No client email or requested role establishes ownership. Staff access is re-read on each request. Judges cannot access credits.
- `.env.example` contains names/placeholders only. Fake inventory uses AES-256-GCM with an explicitly non-secret local test key. Production requires a new server-side key configured through Sites secrets. Codes are never in safe exports, audit values, public queries or frontend source. There is intentionally no bulk secret export.
- Mutation API requires same-origin JSON, bounded request bodies, server RBAC and per-account throttling. CSV previews expire after 15 minutes; imports revalidate and preserve existing approvals. CSV exports neutralize spreadsheet formulas. React escapes user text. No arbitrary repository code is executed and no external URLs are fetched by this v1.
- Profiles start private. Optional gender includes prefer not to say and remains private even when a profile is public. No demographic inference or automatic demographic scoring exists.
- Luma is manual: import roster → review/approve → export safe emails → manually approve in Luma → mark confirmed. No email delivery, provider credits, account provisioning or production role grants were performed.

## Before live use

Read `docs/PUBLICATION.md`, `docs/SITES_INTEGRATION.md`, `docs/ROUTE_MATRIX.md`, `docs/OPERATOR_RUNBOOK.md` and `docs/SECURITY.md`. The installed official Sites 1.1.1 starter supplies the maintained `sites()` plugin, Cloudflare Worker, request-scoped connector handling, auth helpers and build tooling. The Worker captures D1/identity per request, and protected pages use the official server auth helper with server-side permission checks. The manifest declares logical `DB`, persists the approved new Site ID, and leaves unused R2 null. Native Sites publication and DB provisioning succeeded; see the publication record for verification limits. Never enable Dispatch trust on an independently exposed Worker. Hosted sign-in, ingress header stripping, storage and capacity still require a real authorized Sites rehearsal. The public landing can render without private runtime configuration.

The original design references could not be opened through the supplied network or web reader. Reference screenshots and verified official dot assets remain blocked. The UI uses original dot artwork, explicitly described as such, with no endorsement claim. Fontsource Manrope and DM Sans are bundled locally under their included licenses.

Dependency auditing still reports inherited framework/tooling findings. Available `fflate`, Miniflare `sharp`/`undici`/`ws` and plugin `ws` fixes are pinned; remaining findings and their reachability limits are recorded in `docs/SECURITY.md`. No forced downgrade or unsupported replacement was used. The production artifact mitigation and remaining build-environment risk are documented in `docs/DEPENDENCY_REACHABILITY.md`. The artifact gate must pass for each release; hosted identity/runtime setup and owner policy activation remain separate requirements.
