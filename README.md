# DevDay Exchange Hackathon portal — v1 rehearsal

**A persisted, tested local implementation. Hosted ChatGPT authentication and Sites deployment wiring are not complete. Nothing is deployed.** This is the new `dddhack-portal` project, separate from `devday-recap`.

The portal covers registration review, private onboarding, teams/ideas, check-in and encrypted personal credits, three leader submission versions, review jobs, judges, votes/feedback, and owner-controlled result snapshots. Event: **1 November 2026, Asia/Kolkata**. The initial policy is deliberately draft; the submission cutoff, diversity rubric, vote formula and AI fallback are unresolved. Activation, scoring and publication fail closed.

## Run locally

Node 24+, npm and Git are required. No credentials or external API calls are needed.

```sh
npm ci
npm run db:local
PORTAL_LOCAL_TEST=1 npm run dev
```

Open `http://127.0.0.1:5173/`; use `/local-test` to select a clearly fake account. The owner fixture is `owner@portal.test`, not the production owner's email. Fake users, 1/3/5-person teams and `FAKE-NOT-REDEEMABLE-*` credit inventory are seeded into ignored `.local/portal.sqlite`. Data survives process restarts. Existing databases are preserved. Set `PORTAL_LOCAL_DB` to a fresh path for a new rehearsal. Do not place real data in this adapter. To disable it, omit `PORTAL_LOCAL_TEST`; production builds exclude the local runtime and return 503 for unwired APIs.

Portable shell equivalents: Windows PowerShell uses `$env:PORTAL_LOCAL_TEST='1'; npm run dev`. All previews are loopback only.

## Validate

```sh
npm run typecheck
npm test
npm run build
PORTAL_LOCAL_TEST=1 npm run dev  # retained terminal for browser tests
CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e
npm run test:load
npm exec -- tsx scripts/backup-local.ts
```

Browser testing uses an installed Chromium; set `CHROMIUM_PATH` for your machine. Server tests include a real **local Miniflare D1 binding**, not just the SQLite adapter. Load tests use 200 distinct fake HTTP sessions plus independent WAL worker threads. They do not establish hosted Sites capacity or real ChatGPT sign-in. Test evidence is under `evidence/`; screenshots are delivered through Library (see `docs/DELIVERY.md`). Build warnings from Vinext's chunk layout are recorded and are not test failures.

## Architecture and security

- Vinext App Router, React, TypeScript; public and protected screens call a server API. SQLite is only the named local adapter. The domain service accepts the D1 interface and uses parameterized, one-statement `prepare()` calls and atomic `batch()` writes.
- Schema/migration: `db/migrations/` (ordered `0001_portal.sql`, then `0002_tie_resolutions.sql`). Constraints and triggers enforce one membership, five-person cap, idea lock, three submission versions, credit uniqueness, vote limits and immutable audit/results. Race-sensitive limits are checked in SQL. Scoring revision checks reject a snapshot if its inputs changed while it was computed.
- The future Sites handler consumes **server-injected** `oai-authenticated-user-id` and email behind Sites Dispatch. `connectwithparam.30@gmail.com` is owner only when derived from that verified identity. No client email or requested role establishes ownership. Staff access is re-read on each request. Judges cannot access credits.
- `.env.example` contains names/placeholders only. Fake inventory uses AES-256-GCM with an explicitly non-secret local test key. Production requires a new server-side key configured through Sites secrets. Codes are never in safe exports, audit values, public queries or frontend source. There is intentionally no bulk secret export.
- Mutation API requires same-origin JSON, bounded request bodies, server RBAC and per-account throttling. CSV previews expire after 15 minutes; imports revalidate and preserve existing approvals. CSV exports neutralize spreadsheet formulas. React escapes user text. No arbitrary repository code is executed and no external URLs are fetched by this v1.
- Profiles start private. Optional gender includes prefer not to say and remains private even when a profile is public. No demographic inference or automatic demographic scoring exists.
- Luma is manual: import roster → review/approve → export safe emails → manually approve in Luma → mark confirmed. No email delivery, provider credits, account provisioning or production role grants were performed.

## Before live use

Read `docs/SITES_INTEGRATION.md`, `docs/ROUTE_MATRIX.md`, `docs/OPERATOR_RUNBOOK.md` and `docs/SECURITY.md`. The supported Sites starter/plugin helpers and auth-helper source were unavailable here. The app therefore does **not** claim a verified Sites production build: the integration factory is ready to be wired after the supported starter becomes available. The hosting manifest has no Site ID and unused null storage bindings; no provisioning was attempted. Do not serve the future identity adapter directly on an untrusted Worker origin.

The original design references could not be opened through the supplied network or web reader. Reference screenshots and verified official dot assets remain blocked. The UI uses original dot artwork, explicitly described as such, with no endorsement claim. Fontsource Manrope and DM Sans are bundled locally under their included licenses.

Production dependency auditing still reports inherited Vinext dependency-chain findings. A patched available `fflate` override is pinned; unpatched findings and their reachability limits are recorded in `docs/SECURITY.md`. No forced downgrade or unsupported replacement was used. This is a remaining live-release blocker, alongside the integration and policy decisions.
