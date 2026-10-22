# Supported Sites integration boundary

No Site was created, registered, deployed or published. No Vercel or Neon service was used. GitHub source push is the only external project mutation.

The current Sites skill was read, including identity, storage, local preview and troubleshooting references. It specifies Vinext App Router on a Cloudflare Worker, Sites-owned ChatGPT sign-in, D1 structured storage and optional R2. The available executor is portable Linux (`SITES_MANAGED_LINUX_CONTAINER` is unset). No software-engineering skill or `.agents/skills` instructions were found.

## Exact blocker

The Sites plugin's installed project setup/build helpers, maintained `sites()` Vite integration, full starter files and `app/chatgpt-auth.ts` source are not present in the selected environment. Attempts to read the setup and auth-helper resources through the skill provider failed. The documentation is available, but that is not enough to claim a packaged Sites build. No Site was created merely to obtain these resources because the user expressly prohibited hosted Site creation and publication.

Accordingly:

- `vite.config.ts` uses ordinary Vinext for the local runnable app; it does not invent a `sites()` plugin.
- `.openai/hosting.json` retains null D1/R2 bindings and has no project ID. Its storage declaration must come from the current supported starter. No speculative binding schema is treated as deployable configuration.
- `lib/http.ts` exports `createSitesPortalHandler(env)`, which accepts an actual D1 binding, credit encryption key and the explicit Sites Dispatch trust configuration. `lib/identity.ts` consumes the documented server identity headers. The factory is tested but deliberately not attached to an exposed production origin.
- The local adapter is imported only under `import.meta.env.DEV && PORTAL_LOCAL_TEST==='1'`; the runtime additionally requires loopback requests. It uses a fake fixture cookie and durable local SQLite. It is not OAuth, email verification or production authentication. Hosted APIs currently fail closed with 503.
- Platform sign-in links are normal anchors with `target="_top"` to `/signin-with-chatgpt?return_to=...`; sign-out uses `/signout-with-chatgpt`. These reserved routes and `/callback` are never implemented by this app. Same-origin return paths are validated.

## Future authorized integration work

1. Obtain and initialize the current Sites starter in a separate checkout; preserve its `sites()` build integration, Worker entry and request-scoped environment handling. Port these authored routes/domain modules into it without copying local runtime state.
2. Use its server-only ChatGPT auth helpers, dynamic protected pages and per-operation authorization. Confirm Dispatch strips caller-supplied identity headers. Never trust those headers on an independently exposed origin. The real owner is derived only from the authenticated server email.
3. Declare a logical `DB` D1 binding through the starter's actual supported manifest. Reconcile this schema with its Drizzle schema/generation workflow. Migration SQL is schema-only, immutable once applied, and independently tested against local D1; seeds remain separate.
4. Apply migrations only to the local preview, rerun the complete suite and verify identity caching, permission revocation, account allowlist matching and source bundle isolation. Configure a new credit key via Sites secrets only when explicitly authorized; do not reuse the fake key.
5. Add an authorized queued evaluator implementation with safe public fetches (HTTPS allowlist, DNS/IP/redirect checks, byte/time limits), secret redaction, prompt-injection-resistant structured output, budgets and crash-recovery leases. Current v1 makes zero external evaluation calls.
6. Resolve the decision register and dependency findings, then rehearse real Sites auth/D1 against authorized fake accounts. Independently benchmark hosted capacity. A passing local test is not hosted verification.
7. Only after a separate future instruction permits hosting may a Site be registered, configured, packaged or deployed. This task does not grant that permission.
