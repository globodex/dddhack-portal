# Public SEO and legal drafts

Branch: `feat/public-seo-legal-drafts`, based on `3c0441feaa2c32c86a4b0f40590d0c498e09cb96`. This updates the real Next.js app without deployment, provider changes, credentials, record deletion or permission changes.

## Audit and implementation

Public routes previously reused one description. The sitemap also included the project index and leaderboard, contrary to the latest requested scope. The new sitemap contains only home and valid paths from the existing anonymous eligible-published-project projection. Its pagination and no-store behavior remain. Drafts, removed/ineligible projects, legal drafts, directories, `/projects` and `/leaderboard` are excluded from this sitemap. The existing public project index and leaderboard still have unique public metadata and unchanged access.

Canonical, social-image and structured-data URLs use configured `APP_ORIGIN`, defaulting to the selected `https://dddhack-portal.itsparam.in`. This source default does not prove DNS/provider cutover. Public project metadata selects only the service's published public entry fields and reuses the page's request-scoped view, adding no metadata backend request. Missing/non-public project details invoke Next's not-found handling.

Private/auth routes and legal drafts are noindex. HTML remains crawlable so that crawlers can read noindex; authentication and server authorization continue to protect private data. General API crawling is disallowed, with an exception for existing permission-filtered public project images.

Event JSON-LD uses only the approved 1 November 2026, 08:00 to 20:00 IST event and general IIIT Delhi/New Delhi location. It identifies Parampreet Singh as an organizer and a community event hosted by Codex Ambassadors. It invents no private room/street address, ticket offer, price, rating, prize or legal OpenAI organizer. Existing approved artwork remains the social fallback.

## Official guidance consulted before implementation

- [Google noindex](https://developers.google.com/search/docs/crawling-indexing/block-indexing): crawlers need access to read the directive.
- [Google robots.txt](https://developers.google.com/search/docs/crawling-indexing/robots/intro): crawl rules do not secure private content.
- [Google canonical URLs](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls): canonical and sitemap signals should identify the same preferred URL.
- [Google sitemaps](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap): include canonical URLs intended for search.
- [Google title links](https://developers.google.com/search/docs/appearance/title-link): concise, distinct titles describe each page.
- [Google Event data](https://developers.google.com/search/docs/appearance/structured-data/event): structured data must describe actual public event facts.
- [Google JavaScript SEO](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics): meaningful server content and response handling matter.

No ranking, indexing, rich-result or AI-answer inclusion guarantee is made. No Search Console operation, tracker, keyword stuffing or speculative AI indexing file was added.

## Legal draft facts and inventory

`/privacy` and `/terms` are visible drafts, noindex and excluded from the sitemap. They render semantic public text on the server without sign-in or an API request. A small client header reuses the shared full-screen menu, with a black circular44px hamburger and Lucide destinations for Home, Projects, Dashboard, Privacy and Terms. It remains disabled until hydration and fetches no session or API data. The landing/sign-in owner is linking those paths and `mailto:hey@itsparam.in`.

User-confirmed facts: controller/operator and organizer Parampreet Singh; privacy/deletion contact `hey@itsparam.in`; unnecessary private participant data has a 90-day period after the event. Public showcase retention unless removal is requested and separate indefinite owner audit retention match the parent's category copy. Requests use a manual email/review process. No automatic purge, provider deletion, response deadline or blanket legal compliance is promised.

Source inventory reviewed:

- `lib/roster-import.ts` and profile/team/public projections: imported registration fields, private profile and team data, scoped phone/WhatsApp, credits, public eligible projects, comments/votes and private reviews.
- `neon/auth/config.ts`, auth handler and SMTP: Google identity, configured Gmail email delivery, necessary host-only cookies, seven-day sessions, 15-minute magic-link browser verification and 10-minute Google verification.
- Next proxy, `neon/api.ts`, database/storage and deployment source: selected Vercel frontend and Neon backend/database/media.
- `neon/ai/input.ts`, evaluator and approved-snapshot repository: optional authorized OpenAI processing of bounded selected descriptions, approved text and commit metadata. Private record fields are excluded by projection. No real model request ran.
- The user confirmed Cloudflare DNS/proxy is active for the custom hostname. The privacy draft acknowledges current network processing; exact logs, analytics settings and retention were not inspected or changed.
- No added advertising/analytics SDK was found in source. This does not establish absence of deployment analytics or provider logs. Browser-local pause preference and external Luma, GitHub, social, maps, WhatsApp and provider links are disclosed.

## Unresolved facts and manual alignment

Still under organizer review: processing locations/cross-border arrangements, deployment analytics settings, backups and provider log retention, exceptional retained records, school-age/guardian policy, applicable cancellation/refund arrangements, legal jurisdiction and dispute handling. The draft does not invent answers. Record hiding is explicitly distinguished from erasure; no automatic purge is claimed.

The parent is aligning legacy default retention copy while preserving validation/gates. Already persisted event policies are unchanged and need owner review/publication through the existing workflow. This branch deletes no records and creates no deletion job.

## Verification

Typecheck and 13 focused tests pass. They cover exact configured origins, distinct public metadata, private/draft noindex, published-field projection, social-image restrictions, sitemap contents/pagination/failure, robots compatibility, public Event facts, semantic legal draft content, the hydrated icon menu and confirmed active Cloudflare processing. Existing public-release integration tests also exercise actual eligible, draft and ineligible database projections.

Rendered desktop/mobile screenshots, console/accessibility and HTTP/metadata checks remain for integration after cherry-pick. No additional persistent frontend server was started for this lane. Source checks alone are not visual acceptance.
