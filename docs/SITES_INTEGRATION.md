# Supported Sites integration

Implemented locally on `param302-linux` using the official Sites 1.1.1 integration and a maintained compatible Cloudflare toolchain update. **A public draft is deployed** as **DevDay Community Hackathon: New Delhi**, slug `dddhack-portal`, project ID `appgprj_6ad9ec4bea6c8191b2bb155de7fe00ed`. See `PUBLICATION.md` for the exact saved revision, native verification, HTTP 403 blocker and pending runtime-secret/trust approval. The separate `dddrecap` Site is untouched.

## Build and request boundary

- `vite.config.ts` preserves the starter's maintained `sites()` integration, Cloudflare Vite plugin, logical D1 binding `DB`, Worker entry and connector preview capability. The plugin copies the manifest and Drizzle migrations into `dist/.openai/`.
- `worker/index.ts` retains the official connector request scope and adds a separate `AsyncLocalStorage` scope for each incoming request, D1 binding and identity. App Router APIs consume that scope; no mutable global database, key or identity cache is used.
- Hosted trust requires server-side `PORTAL_RUNTIME=sites` and `PORTAL_TRUST_SITES_DISPATCH=true`. These confirmations are valid **only behind Sites Dispatch**, which owns sign-in and strips caller-supplied identity headers. They are not cryptographic attestations and must never be enabled on an independently reachable Worker origin. Confirm that boundary on the real hosted platform before live use.
- Without trust, the Worker removes all incoming `oai-authenticated-user-*` headers and fails protected routes/APIs closed. Missing D1 or an invalid/missing 32-byte base64 credit key also fails closed. No production key has been created or configured.
- The official server-only `app/chatgpt-auth.ts` helper is used by dynamic protected server pages. The Worker authorizes page data before rendering; service authorization separately protects each API operation and export. Private responses are `private, no-store`. Anonymous private pages redirect via top-level Dispatch-owned sign-in; anonymous private APIs return 401 once runtime configuration is valid.
- Public `/` remains anonymous-compatible. Public data APIs return only the existing approved public projections. Judges have no credit access; owner-only settings/permissions still require the authenticated server email.
- The explicitly selected `PORTAL_LOCAL_TEST=1` development path keeps the existing Node/SQLite rehearsal. Production removes that adapter and local sign-in mutation; `/local-test` returns 404. Portable Sites mock sign-in is development-only and never establishes the production owner.

## Schema and draft initialization

`db/schema.ts` describes the existing 27 tables for Drizzle. `npm run db:generate` generated the base migration/snapshots; the reviewed custom `drizzle/0001_portal_guards.sql` retains all 72 proven SQL triggers and the single internal scoring revision counter. Original `db/migrations/` files remain unchanged for the existing SQLite rehearsal. Hosted migrations contain no fake users, credits, event policy seed or production role grants.

The D1 migration test applies the actual Sites migration path and verifies trigger parity, relational integrity, case-insensitive uniqueness, checks and persisted service access. Future schema changes must append migrations; do not replay both migration directories into the same database.

A fresh hosted database has no event policy. After a future authorized deployment, the verified owner must explicitly submit `POST /api/portal` with `{"action":"initialize-event","data":{"reason":"Initial draft setup"}}` from the same origin. This audited command creates only the inactive draft policy, refuses non-owners and refuses to overwrite an initialized event. It was exercised only with synthetic local data. Policy activation remains blocked until the owner confirms all required decisions.

## Verification and limits

Run `npm run typecheck`, `npm test`, the Sites plugin's `build-site.mjs`, then `npm run test:production`. The production smoke test runs the compiled Worker on loopback using an isolated temporary D1 database. It first verifies standalone fail-closed behavior, then uses an explicit synthetic Dispatch harness to verify redirects, participant/owner/admin/judge access, private APIs, export denial, cache controls and removal of fixture authentication. The harness variables and zero-filled test encryption key never enter hosted configuration. It is not real ChatGPT sign-in or hosted capacity evidence.

Evidence: `evidence/sites-build.log`, `evidence/sites-tests.log`, `evidence/sites-production-smoke.log`, `evidence/sites-production-smoke.json` and `evidence/sites-dependency-audit.json` and `evidence/sites-dev-smoke.json`.

The native Sites read-only connection works locally, and the setup/build/source helpers and auth source are installed. This removes the earlier missing-helper limitation. Native creation, approved source access and public deployment succeeded. Live HTTP checks are blocked by 403; runtime secret/trust configuration and actual hosted sign-in remain unverified. Use the official source workflow for the eventual new Site; never reuse another Site's ID. Creating source credentials, security-sensitive grants or configuring production secrets must follow action-time approval requirements.

## Remaining release work

1. Obtain separate approval for production encryption-key/trust setup, then complete the setup and live HTTP verification described in `PUBLICATION.md`. The native source-credential operation was approved and completed; the credential was not saved because no supported secure store exists.
2. Enforce the artifact-specific mitigation in `DEPENDENCY_REACHABILITY.md`, retain the full audit findings, and keep the event policies draft until separately approved.
3. Reuse the persisted project ID for all future updates. The Site is public and version 1 is published. Do not create a duplicate, deploy dummy auth or expose a header-trusting standalone Worker.
4. Configure a fresh production credit key and server trust only after verifying Dispatch as the sole ingress; rehearse real sign-in, anonymous requests, header spoof rejection, account revocation, private data and hosted D1 using authorized test accounts.
5. Initialize the inactive draft explicitly, validate operator workflows, hosted backup/restore and capacity, then complete the approved release. No real AI/GitHub evaluator or API spending is enabled by this integration.
