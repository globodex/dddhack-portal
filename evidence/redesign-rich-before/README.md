# Populated before evidence

Source: `696b125f9711a4fd6e02c3ece3adadb18b83cba7`. Captured from the untouched `ddd-landing` worktree using Next 16.4.3 `--webpack`, frontend 3004, disposable rich synthetic backend 8789. The frontend was stopped and generated `next-env.d.ts` changes restored before releasing that worktree. No application source, provider setting or production record changed.

- 34 original PNG files were opened and inspected: 20 core page/tab captures and 14 supplemental viewport/filter/editor captures.
- 28 navigation samples:3 fresh browser contexts per 7 routes on desktop1440x900, plus 1 sample per route at390x844. HTTP cache disabled; local development runtime, no throttling.
- Protected document content came through SSR; the observed browser API request count was0 for these initial loads. CDP completed-request bytes, requests, DOM count, TTFB,FCP and raw Navigation/Resource entries are in `report.json`.
- No core page errors, external requests or mutation requests. Supplemental harness failures are retained separately under `harnessDiagnostics`: one ambiguous Alice text locator, and closed-context errors when optional capture expansion was stopped. The requested All filters state was then captured successfully at both sizes.
- The first Dashboard sample includes initial webpack compilation and has 8179.4 ms TTFB. It remains in the raw record. These observations support only a matching same-mode comparison; they do not establish production speed or capacity.

The default Registered+Locked admin filter is empty. `admin-participants-all-*` uses the real All statuses/All people controls and shows populated rows. Public discovery currently exposes 13 consented profiles and reaches All people loaded, so this fixture does not cover pagination. The fake credit stays masked. The solid project banner is a synthetic fixture, not proposed artwork.

`*-viewport.png` files preserve original browser viewport pixels for long-list comparisons. Full-page files preserve document extent. Original errors/empty/loading/dialog/menu evidence at 1440, 768, 390 and 390x480 is separately retained in `../redesign-before-states` with 35 viewed files.

Reusable raw diagnostic runner: `/tmp/ddd-rich-before-capture.mjs`; accepts `QA_ORIGIN`, `QA_OUTPUT` and `QA_SOURCE_ROOT`. Use the same bundler/runtime mode and unchanged fixture for after measurements. No page is declared ready by this baseline.
