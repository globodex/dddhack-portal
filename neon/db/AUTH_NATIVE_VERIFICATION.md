# Native PostgreSQL auth integration verification

Verified locally on 24 October 2026 against PostgreSQL 18.4. This follow-up adds
`tests/neon-auth-native.test.ts`; runtime code and migration loaders are unchanged.
The tested prerequisites are the portal adapter/migrations from `aa30485` and the
auth implementation/migration from `00ceee5`.

Each test creates a uniquely named schema in the explicitly selected loopback
synthetic database. It applies portal migrations `0000`–`0004`, then appends the
unchanged auth SQL under plan name `0100_auth.sql`, proving the users foreign-key
dependency is satisfied. The same checksummed plan is reapplied and performs no
further writes. Existing fake portal fixtures are seeded into that isolated schema.
An eight-connection native `pg` pool uses the real SERIALIZABLE adapter. Cleanup
drops only the uniquely named synthetic schema; the integrator's public-schema
rehearsal fixtures remain available.

The three end-to-end tests passed:

- A normalized email request is delivered to an in-memory SMTP capture. Repeated
  scanner GETs return the confirmation form without consuming the stored hashed
  token or creating a session. Missing/other-browser cookies and a wrong POST
  Origin are rejected. Concurrent confirmation POSTs produce exactly one 303 and
  one 400. The winner receives a Secure, HttpOnly, host-only session cookie and
  the intended relative redirect. The session resolves the existing fake admin
  ID/name/role, authorizes the real portal staff projection, and logout revokes it.
- A newly verified address gets the schema's participant role and remains a
  viewer without a roster entry. Staff access and participant writes are denied.
  Sites/role header spoofing, fabricated or shadowed session cookies, a bad proxy
  secret, and a client-supplied role do not grant authority.
- A live session rechecks the current `portal_roles` override. Removing effective
  admin permission immediately blocks an already-created service's staff check.
  Changing the portal user's email invalidates the verified-email session binding.

No auth SQL incompatibilities were observed: conditional upserts with RETURNING,
DELETE RETURNING single-use consumption, BIGINT expiry comparisons, normalized
email linking, and portal trigger enforcement all executed on native PostgreSQL.
Email delivery is injected; no SMTP credentials are configured. Google dependency
stubs throw if invoked; the magic flow makes no Google/provider network requests.
This does not establish hosted Neon, live email deliverability, Google sign-in,
proxy/browser integration, or deployment readiness.

```sh
PORTAL_TEST_POSTGRES_URL=postgresql://portal_synthetic@127.0.0.1:55439/postgres \
  node --import tsx --test tests/neon-auth-native.test.ts
```

Result: **3 passed, 0 failed, 0 skipped**. The suite skips all three tests when
`PORTAL_TEST_POSTGRES_URL` is absent and refuses non-loopback hosts before any
connection. A targeted strict TypeScript check also passed. The separate portal
concurrency tests were not repeated during this follow-up.
