# Supported Sites integration

Implemented locally on `param302-linux` using installed official Sites plugin 1.1.1. **No Site was created, registered, deployed or published. No credentials or sharing settings were changed.** The existing feature branch and service logic are preserved. Public hosting is requested for the eventual new portal; actual publication is on hold for UI direction and release readiness. The separate `dddrecap` Site is unrelated.

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

The native Sites read-only connection works locally, and the setup/build/source helpers and auth source are installed. This removes the earlier missing-helper limitation. Publishing has not been attempted, so native creation/source-access/deployment approval and hosted readiness remain unverified. Use the official source workflow for the eventual new Site; never reuse another Site's ID. Creating source credentials, security-sensitive grants or configuring production secrets must follow action-time approval requirements.

## Remaining release work

1. Obtain the user's UI direction. Reference screenshots remain blocked because the computer tool reports no browsers/apps and `Browser is not available: iab`. No supported screenshot fallback was available; no reference images or Library IDs were fabricated.
2. Resolve the documented dependency findings and policy/operational decisions.
3. When publication resumes, create the new Site, preserve its returned identity and configure the requested public audience through supported tools. Do not deploy a dummy auth implementation or expose a header-trusting standalone Worker.
4. Configure a fresh production credit key and server trust only after verifying Dispatch as the sole ingress; rehearse real sign-in, anonymous requests, header spoof rejection, account revocation, private data and hosted D1 using authorized test accounts.
5. Initialize the inactive draft explicitly, validate operator workflows, hosted backup/restore and capacity, then complete the approved release. No real AI/GitHub evaluator or API spending is enabled by this integration.
