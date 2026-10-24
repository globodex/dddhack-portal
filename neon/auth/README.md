# Portal authentication

Node.js backend auth uses provider-neutral SMTP magic links and Google's authorization-code flow. Browser auth requests remain on the frontend origin; the Next proxy forwards the exact `/api/auth/*` path. No Sites identity header is read by this backend.

```ts
import { createAuthHandler, authenticateRequest } from "./auth";

const handleAuth = createAuthHandler(env, db);
// Pass /api/auth/* requests to handleAuth(request).
// Other API handlers can use:
const identity = await authenticateRequest(request, env, db);
```

Both exports accept the existing `lib/db.Database` contract. `createAuthHandler` returns `(request: Request) => Promise<Response>`. Its optional third argument injects clock, email delivery, Google code exchange and ID-token verification for **offline tests only**; production must omit it. The request body and environment cannot select these dependencies.

## Proxy and configuration

`APP_ORIGIN` and `AUTH_BASE_URL` must be the same exact origin, without a path or trailing slash. HTTPS is required except for loopback development. The intended browser origin is `https://dddhack-portal.vercel.app` (domain availability/deployment is unverified). Local development uses `http://localhost:3000`.

Every request requires `x-portal-proxy-secret` matching `PORTAL_PROXY_SECRET` and `x-portal-forwarded-origin` matching `APP_ORIGIN`. Both secrets (`AUTH_SECRET`, `PORTAL_PROXY_SECRET`) must contain at least 32 characters; provision independent cryptographically random values. Caller-controlled Host, Forwarded, X-Forwarded-* and Sites headers confer no trust. All POST requests additionally require the exact browser `Origin`.

Secrets are backend-only and pending secure manual configuration. SMTP also requires a selected provider, approved sending address/domain and deliverability setup. Use `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`; only implicit TLS on 465 (`true`) or mandatory STARTTLS on 587 (`false`) is accepted. Certificates are verified; file and URL access from message content is disabled. `SMTP_FROM` is a bare email address.

Google requires `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, with exactly `${APP_ORIGIN}/api/auth/callback/google` registered as the Web OAuth redirect. No wildcard callback, provider credentials, account or email is provisioned by this change.

## Routes

| Route                            | Method    | Input / result                                                                                |
| -------------------------------- | --------- | --------------------------------------------------------------------------------------------- |
| `/api/auth/session`              | GET       | `{user:{id,email,name,emailVerified:true}}` or `{user:null}`                                  |
| `/api/auth/magic/request`        | POST JSON | `{email,returnTo?}`; generic 202 message and browser binding cookie                           |
| `/api/auth/magic/verify?token=…` | GET       | Browser-bound confirmation form; does not consume the token                                   |
| `/api/auth/magic/verify`         | POST      | Form or JSON `{token}`; consumes token, issues session, 303 to validated relative destination |
| `/api/auth/google/start`         | POST JSON | `{returnTo?}`; `{redirectTo}` with Google's authorization URL and browser binding cookie      |
| `/api/auth/callback/google`      | GET       | Consumes state, exchanges code with PKCE, verifies ID token, issues session, 303              |
| `/api/auth/signout`              | POST JSON | `{returnTo?}`; revokes current session, clears auth cookies, `{redirectTo}`                   |

Other client fields, including role or account IDs, are rejected. Mutation content is bounded to 8 KiB. Invalid/expired links and unsuccessful OAuth callbacks show a small recovery page with a link back to sign in, preserving their failure HTTP status. Other endpoints return JSON errors. Provider cancellation returns to `/signin?error=google_cancelled`. All auth responses prohibit caching and referrer disclosure.

Magic links expire after 15 minutes and work only in the initiating browser. A confirmation POST avoids consuming links through mail-scanner GETs. `DELETE … RETURNING` ensures one winner under concurrent verification. Successful magic verification revokes other pending links for the same normalized email. OAuth transactions expire after 10 minutes and bind state, PKCE verifier and nonce to an HttpOnly browser cookie. Session credentials rotate at login, expire after seven days and are stored as purpose-separated HMAC-SHA256 hashes. Secure host-only cookies use the `__Host-` prefix, HttpOnly, Path=/ and SameSite=Lax; loopback HTTP omits Secure and the prefix.

Durable atomic limits cap magic requests by normalized email (5/15 minutes), browser (10/15 minutes) and globally (100/hour); Google starts are limited by browser (20/15 minutes) and globally (1,000/hour). Limits do not rely on a caller-supplied IP header. Expired transient records are removed on new auth starts. Limits are conservative defaults for this small event and can be tuned with code review.

## Identity and migration

Apply `neon/auth-migrations/0001_auth.sql` **after** the portal schema. The integrator controls migration ordering. It adds only auth tables and indexes; no user data is imported. Timestamps used for expiry are epoch milliseconds stored as BIGINT.

Only proven normalized email can resolve an existing portal user ID. A new user's role comes from the schema's participant default, and login never changes an existing role. Owner authority requires a verified identity with the normalized configured owner email. A changed portal email invalidates existing sessions instead of transferring authority.

Google ID tokens are verified by `jose` against the pinned Google JWKS endpoint: signature/RS256, issuer, audience/authorized party, expiry/issue time, nonce, subject and verified email. Provider subjects are immutable, and a second subject cannot replace an existing binding. Per Google's guidance, `email_verified` alone does not prove current ownership for external, non-Gmail/non-Workspace email accounts; those users must sign in with a fresh magic link. Gmail and verified Workspace identities may resolve the verified email directly.

## Offline checks and references

`tsx --test tests/neon-auth.test.ts` executes synthetic in-memory SQL fixtures, injected email delivery/code exchange, and locally signed RSA JWTs. It performs no SMTP, OAuth, JWKS or deployment network calls.

Dependencies are `jose`, `nodemailer`, and development types `@types/nodemailer`; the frontend owner manages root package/lock changes.

- [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect)
- [Google token validation and authoritative email guidance](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token)
- [jose JWT verification](https://github.com/panva/jose)
- [Nodemailer SMTP and mandatory TLS](https://nodemailer.com/smtp)
