# Actual homepage social image

Input UI source: `d004c3a7d060389b3677d484c2e87635a72acfd7`.

`hero-native-1440x756.png` is an unaltered Chromium viewport screenshot of the current approved homepage. Both the native screenshot and final JPEG were viewed as actual pixels. The screenshot includes the real NEW DELHI artwork, static Metro, date, Codex Ambassadors host line, Cerebras brand, existing calls to action and DevDay expressions. No hero layout, artwork, animation dependency or image generation was introduced.

The session was anonymous with empty cookies. The frontend local-test flag was absent; the actual render had no rehearsal banner, private account, browser chrome, page errors, HTTP errors or horizontal overflow. The source's normal reduced-motion behavior was requested. A NEW disposable synthetic database was used only behind a read-only allowlisted local HTTPS bridge. Application origin/proxy guards remained unchanged. The API returned real fixture projections with 200 responses. No provider or hosted data was involved.

The supported Next webpack development server used native HTTPS with a temporary local CA; Node verified the CA. Browser certificate relaxation applied only inside this isolated local fixture session, and its CONNECT proxy denied external destinations. This is production-like anonymous rendering, not a claim that a production build or real Google authentication was exercised by this capture. Next dev indicators were already disabled by the checked-in configuration. No DOM hiding, CSS injection, screenshot composition or overflow mask was used.

## Required runtime exception

Preserve **`public/og/devday-new-delhi-home.jpg`** during cleanup. It is the single new runtime image: 1200×630, 85,741 bytes, JPEG. It is an exact proportional 5/6 resize of the native 1440×756 screenshot, with no crop or art changes. `asset.json` records the byte hash; `scripts/qa-actual-hero-og-encode.mjs` records the reproducible Sharp settings.

Only the homepage social metadata and Event image now use this asset through configured `APP_ORIGIN`. Homepage OpenGraph includes its dimensions and MIME type. The existing published-project banner selection, validation and fallback remain unchanged. Eleven focused SEO/legal tests pass, including asset dimensions/size, homepage/Event equality, configured origin, private-route policy and published-project banner preservation. `http-metadata.json` records the actual served canonical, OpenGraph/Twitter/Event image URL and 200 JPEG response with matching byte length.

## Reproduction and provenance

`scripts/qa-actual-hero-og.mjs` is the native capture script. `tls-network-fixture.mjs` and `dns-fixture.mjs` are local-only transport helpers reused from the controlled performance harness; no TLS key or certificate is committed. They connected the Next frontend at the allowlisted HTTPS test origin to a newly created synthetic backend at local port 8864. The network trace retains denied browser background destinations and successful public projection requests.

The first harness attempt waited for all document images, including deferred offscreen images. It was explicitly stopped, its failure report preserved as `offscreen-lazy-image-wait-harness-failure.json`, and the script corrected to wait only for visible images. The successful capture used no page edits. All browsers and owned Node processes were then stopped. `cleanup.json` verifies ports 3443/8842/8899/8864 closed and exact owned PIDs absent. The read-only fixture check reports SQLite integrity `ok` and no foreign-key errors.

Repository cleanup remains **audit only**. The independent admin audit at `/tmp/ddd-repo-hygiene-audit/REPOSITORY_HYGIENE_AUDIT.md` is reused, with no duplicate fetch or deletion from this lane. Its remote snapshot predates this release and must be rechecked by the release owner before any approved cleanup. Native evidence delivery, runtime assets, migration/checksum inputs and backend release artifacts remain explicit preservation gates. No branch, evidence image, release artifact or history was removed, and this lane made no push.
