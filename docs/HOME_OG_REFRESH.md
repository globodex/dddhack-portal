# Current Home social image

`public/og/devday-new-delhi-home.jpg` is an actual native1200×630 anonymous Home viewport captured from UI source `4e09abe3c24f10a3931c0073218523789cdc84cb` (capture checkout `4988c4c`, whose later change was documentation only). It includes the current OpenAI × Cerebras row and narrow twelve-expression desktop rail.

The frontend ran Webpack development mode over real local HTTPS with `PORTAL_LOCAL_TEST` unset and the existing origin/TLS guards intact. Its separate backend was a fresh anonymous synthetic fixture with external fetch disabled. No hosted requests, account cookies, rehearsal banner, browser chrome, DOM hiding, crop, resize, compositing or generated artwork were used.

Original PNG: `/tmp/ddd-home-og/home-current-native-1200x630.png`, SHA256 `f8397c2aeaa363b70e70b3a6c26c7456bcf2f4b77f861b57382c0dbba679dd9d`. The original and prior runtime JPEG remain outside Git. The exact frame was encoded as JPEG84/mozjpeg/4:4:4 without resizing. Both PNG and resulting JPEG were visually inspected.

Runtime image:1200×630,76,879 bytes, SHA256 `1a61feab9a752998f210f474ff6e743fa2f0585df1a00af14aa1eb823bd18f43`. Local GET returned200 `image/jpeg` with the same hash. Emitted OG metadata remains1200×630 JPEG with alt “DevDay Exchange Community Hackathon: New Delhi”; canonical/image URLs still use configured `APP_ORIGIN`. Eleven SEO/legal tests passed. No SEO code or UI changed.

Capture, encoding and served-asset receipts are under `/tmp/ddd-home-og/`. The earlier `scripts/qa-actual-hero-og-encode.mjs` uses the historical1440×756 screenshot; it is not the source for this refreshed image and must not be rerun to recreate the current asset.
