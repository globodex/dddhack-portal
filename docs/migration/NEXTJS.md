# Next.js frontend migration

Frontend source: `f577c70` on `migration/nextjs`. Node 24.19.0, Next.js 16.4.3 and React 19.3.1. The Next version was verified against the official [16.4 release](https://nextjs.org/blog/next-16-4) and npm's stable `latest` tag on 24 October 2026; no canary version was selected. `next dev` also supplied the version-matched package docs and generated the committed AGENTS.md instruction to consult them.

## Runtime boundary

`npm run dev`, `npm run build` and `npm start` run real Next.js App Router. The existing V7 JSX, stylesheet imports, local font files, original Delhi art and organizer assets remain. Portal links now use `next/link`; catch-all loading uses the existing route skeleton shapes. Existing mutation refreshes, admin presentation cache invalidation, visibility/focus request coalescing and client navigation remain in the portal.

`lib/next-backend.ts` exports `proxyBackendRequest`, `readBackendView`, `readBackendSession`, `BackendError`, `protectedPath`, `isLocalDevelopmentRequest` and `localDevelopmentRender`. View/session promises use React's request-scoped `cache`; all upstream fetches use `cache: "no-store"`. A protected document loads one authorized view directly from the backend; it does not fetch the same view through a browser bootstrap. Public project metadata and the page reuse the same request-scoped view. No private result enters a persistent Next Data Cache.

Every `/api/*` path is forwarded to the exact configured `NEON_API_ORIGIN`, preserving its path/query and browser cookie. The proxy allowlists browser headers, replaces the trusted `x-portal-proxy-secret` and `x-portal-forwarded-origin` headers, rejects missing/foreign Origin on mutations, uses manual redirects and only returns redirects within the app origin. It removes hop-by-hop, compressed-transfer, CORS and internal identity headers from upstream responses, and appends each `Set-Cookie` separately with `getSetCookie()`. API responses are private/no-store. Caller-provided Sites identity headers cannot authenticate requests.

The new `/signin` page is owned by the auth workstream. Portal links point there with `returnTo`; existing `/signin-with-chatgpt?return_to=` bookmarks redirect there safely. Log out calls `POST /api/auth/signout`, clears the client presentation cache and navigates to the home page. The compatibility `app/chatgpt-auth.ts` export names now use a backend-verified cookie session, not ChatGPT/Sites headers. Auth's session contract is `{user:{id,email,name,emailVerified:true}}` or `{user:null}`. Google callback remains `/api/auth/callback/google` through the same proxy.

Production defaults to the user-selected intended origin `https://dddhack-portal.vercel.app`; domain availability and deployment remain unverified. Optional `APP_ORIGIN` must be an exact HTTPS origin. Vercel's only service secret is `PORTAL_PROXY_SECRET`; `NEON_API_ORIGIN` is server-only configuration. No database, SMTP, Google, storage or OpenAI credentials are read by Next. The server bundle never imports application DB/service/auth/storage modules. A backend outage may still render the static home artwork without a deadline; it never invents an authenticated session, fixture record or successful operation.

## Local synthetic rehearsal

Run the integrator's `neon/local-server.ts` as a separate process. The Next frontend never imports SQLite or fixture seeding. Example environment values below are synthetic, not deployment credentials:

```sh
# Backend, in its integrated working tree:
PORTAL_LOCAL_TEST=1 APP_ORIGIN=http://localhost:3000 node --import tsx neon/local-server.ts

# Frontend:
APP_ORIGIN=http://localhost:3000 PORTAL_LOCAL_TEST=1 NEON_API_ORIGIN=http://127.0.0.1:8788 PORTAL_PROXY_SECRET=local-synthetic-proxy-secret npm run dev
```

The frontend listens on loopback port 3000. Use `http://localhost:3000` to match the backend's exact browser origin. `/local-test` exposes the established synthetic fixture picker. Its requests remain `POST /api/portal` with `{action:"local-signin",data:{fixture:"owner"}}` or `{action:"local-signout",data:{}}`. The backend sets/clears the host-only fixture cookie. Session reads are available at `/api/auth/session`.

Synthetic mode requires all three: `NODE_ENV=development`, `PORTAL_LOCAL_TEST=1`, and a localhost browser hostname. A local HTTP upstream is permitted only under those conditions. Production or non-local fixture attempts return `LOCAL_ADAPTER_DISABLED`; an unavailable production backend never enables fixtures. Screenshot rehearsal therefore uses actual Next dev rendering against disposable synthetic data, separate from optimized-build verification.

## Verification

- `npm run typecheck`: passed.
- `npm run build`: passed optimized Turbopack compilation, full TypeScript, static generation and dynamic route discovery.
- [Recorded trace review](next-build-trace.json): 11 route traces, 488 unique files, zero matches for application DB/service/local-test/Neon modules or pg/neondatabase/nodemailer runtime modules.
- Actual local HTTP: home 200, API view 200, owner synthetic sign-in cookie preserved, protected dashboard 200, verified session response, forged foreign-Origin mutation 403.
- `git diff --check`: passed before commit.

The production build included the catch-all page, all same-origin API routes, robots, sitemap and the backward sign-in redirect. The auth `/signin` page and UI workstream patches must be integrated and rebuilt by the integrator. QA owns the independent proxy regressions, browser interaction matrices and screenshots. No hosted deployment, provider authentication, production-data access or AI call was performed.

The old Vinext package is retained only as a development dependency for historical tool scripts. `dev:legacy`, `build:legacy` and `test:artifact:legacy` explicitly run that historical flow; the existing `test:production` script is also the historical Worker smoke and should not be reported as a Next smoke. Old source-string tests that demand `/signin-with-chatgpt`, header-based auth or direct Sites sitemap access require intentional migration adaptation. Existing backend behavior tests remain useful and were not rewritten by this workstream.
