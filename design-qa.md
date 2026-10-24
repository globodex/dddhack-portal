# Portal redesign verification

This is the current review for the real Next.js portal on `feat/portal-experience-rework`, based on `696b125`. The redesign is unpublished. Main contains only the separately authorized deployment filter `e386cc7`; no redesign/security merge or hosted migration/deployment was performed. [Release review and original screenshot index](docs/PORTAL_REDESIGN_REVIEW_2026_10_24.md).

## Screenshot-first audit and design targets

Before implementation, local synthetic collections retained 64 original route/viewport captures, 35 explicit empty/error/loading/dialog captures and 34 populated captures. Public reference screenshots were actually captured and viewed for Devfolio hierarchy, the Perth/Delhi DevDay expression assets and colors, and itsparam stacked scrolling. Access limits remain in the reference audit; inaccessible pages were not presented as inspected. See [the concrete design specification](docs/REDESIGN_SPEC_2026_10_24.md) and `evidence/redesign-references`.

Rejected Library images and selected targets were materialized through supported Library transfer and opened as pixels. The approved mobile hero target is `libfile_5c3333ebe2d881919233264ca1a2c7ea`. The selected Team Studio target is exactly `libfile_f7d0d261d73c8191bb726a86f2f1a0df`, compared at its native 1487×1058 and adapted to smaller widths. The latest single-color expression requirements supersede earlier multicolor grids. Existing Delhi/Metro artwork, portraits, dot assets and actual brand logos remain.

## Delivered and visually checked

The [release index](docs/PORTAL_REDESIGN_REVIEW_2026_10_24.md) maps every requested lane to its source-bound report and native originals: three profile steps; create/team/discovery; selected Studio; idea/invitation/lock states; submission/media/history; personal/admin Credits stock; admin selection/check-in/time settings/owner access; projects and score phases; landing/organizers/agenda/rules/sign-in/email; and SEO/legal pages. Raw screenshots were opened, not accepted solely from tests/builds. Rejected/harness-attempt images are retained and labeled separately.

The shared menu is black, with visible Lucide destinations and red logout. Errors are contextual and actionable, success feedback is concise, and dialogs retain bounded geometry, focus and internal scrolling. Profile uses eight expressions in one selected color, eight compact swatches and three Next/Next/Save steps. Team initials remain distinct from project logos. Private idea, attendance, submission and scoring states remain separate server-enforced facts.

Representative desktop1440, tablet768, mobile390 and short/320 widths, native200% zoom, long names/URLs, errors, loading, dirty/pending states and touch/keyboard interactions are covered by the linked matrices. This is a bounded tested inventory, not a claim that every possible content/role combination was visually examined. The scoped Team Studio review passed after correcting typography, expression/card proportions, contrast and backdrop scroll. Its shared brand mark remains slightly smaller than the generated reference; no new brand artwork was substituted.

The final same-fixture screenshot review caught a real unreadable mobile private-arrival layout. Source `5b926d2` replaces its narrow flex layout with a scoped grid; actual320/390/short/tablet/native200 captures verify readable copy and a44px Maps target. Sources `9e0d9c8`/`2657f26` keep all three dashboard loading placeholders on one row within320px. The static skeletons now follow Studio, stock counters and personal-credit geometry without extra requests or data-dependent placeholder fetching.

## Final checks

- Complete serial suite at `8d56bd0`: **541 tests, 535 passed, 6 skipped, zero failed/cancelled**, 463.5 seconds. Command: `node --no-wasm-code-gc --import tsx --test --test-concurrency=1 tests/*.test.ts`. The flag addresses a documented test-runner V8 issue; app runtime flags are unchanged. Earlier failed expectations/fixture ordering and a load-sensitive D1 timeout remain in the historical first-run log; focused retries and the final complete run pass.
- Explicit typecheck and the current default Next16.4.3 Turbopack production build pass. The two later changes total23 CSS lines and have separate actual pixel checks and a fresh final production build. No JavaScript/backend change followed the complete suite.
- Independent combined migration audit:6/6 pass against populated local PostgreSQL-shaped fixtures. Existing seven-entry ledger/data remain equal, only0102/0103 append, retry returns[], and both collision cases roll back. Historical SQL/checksums are unchanged. [Proof](docs/COMBINED_MIGRATION_UPGRADE_INDEPENDENT_REVIEW.md).
- Owner access independently verifies owner-only projections, exact confirmation, immutable owner, immediate revoked-session denial and retained participant/team/credit data. Stock tests verify unique atomic assignment, restock/dedup/retries/privacy and unchanged earlier allocations. Actual browser mutations were synthetic only.
- Production assets across all routes:14 JavaScript files,985,688 raw bytes/297,122 gzip estimate; CSS339,079 raw/55,752 gzip estimate. These are not per-visitor transfers. No dependency/lockfile change or heavy animation library was introduced.
- Current same-fixture development measurements:28 baseline/28 final samples,20 final native screenshots,zero page errors/blocked/mutating requests andzero initial browser API requests. The64-table fixture hash is unchanged. Wire medians rise2.93–3.67%; Dashboard adds one900-weight font request. Timings are mixed: Dashboard median TTFB299.6→551.4ms and FCP688→1624ms, while most other sampled medians decrease. This measured Dashboard regression is retained openly; no production speed/capacity improvement is claimed. [Current report](evidence/final-performance-current/report.json).

Logs, source bindings and inventories: `evidence/final-release-2026-10-24`. Earlier `evidence/final-performance` and427-test results describe an older checkpoint and are superseded for current verification.

## Publication and remaining limits

The [reviewed backend ZIP](artifacts/neon/README.md) has93files,9,014,174 compressed bytes and SHA256 `6d71e987f3019140b802b207eb7a9cd92fe1de57887d463b73449b87f6ce4a5f`. Fresh861-input graph analysis, ARM64 ELF headers and isolated host JavaScript smoke200/403/503 pass with zero outbound attempts. Host smoke deliberately uses x86_64 Sharp; actual ARM64 execution/cold start/storage/SMTP remains unverified. The owner must manually redeploy to publish backend/email changes.

The hosted database is populated. The [manual incremental plan](docs/NEON_POPULATED_UPGRADE_PLAN.md) requires a privately verified target, backup/restore checkpoint and existing ledger/checksum review. Apply only pending0102/0103 with the reviewed transaction/advisory-lock library. Never seed/reset the hosted target or use synthetic apply flags. No hosted ledger or records were read or modified.

Real Google login, physical iOS/Android, real assistive technology and native multi-connection PostgreSQL behavior are unverified. Six native tests need a separately configured disposable native server; PGlite does not replace that evidence. Chromium touch is emulation. The prior Cloudflare1010 diagnostic denial was not bypassed or classified as an app failure.

Privacy/Terms remain factual owner-review drafts: confirmed Parampreet Singh/hey@itsparam.in,90-day unnecessary-private-data retention, separate public showcase and indefinite owner audit logs. No automatic deletion job or unsupported compliance guarantee was added. Stored policy records were not rewritten.

The separately prepared minimal main hydration-safety fix remains unmerged pending parent/owner approval. This feature includes the form safety correction. All new release author and committer identities are verified as Parampreet Singh <rubercuber.30@gmail.com>. No provider/credential changes, real emails, role changes, submissions, voucher allocations or score reveals occurred.

final result: awaiting the final current performance evidence
