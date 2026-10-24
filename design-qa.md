# Portal redesign verification

Source baseline:696b125f9711a4fd6e02c3ece3adadb18b83cba7. This report covers the actual production Next.js application on the feature branch with isolated synthetic fixtures. It replaces the historical browser-unavailable report. The redesign and security fix were not merged or deployed. The later authorized config-only main push is recorded below; no provider account setting, credential or production-data operation was performed.

## Evidence and corrections

The screenshot-first audit retained64 original four-viewport captures,35 explicit empty/error/loading/dialog captures and34 populated captures before implementation. Actual public screenshots were inspected for Devfolio form/discovery hierarchy, Perth and Delhi DevDay expression/colors, and itsparam stacked scrolling. Rejected Library images and the accepted boards were materialized through supported Library transfer and viewed. The selected mobile hero target was implemented after approval. See evidence/redesign-references and docs/REDESIGN_SPEC_2026_10_24.md.

The most consequential corrections were normal document scrolling for the short-mobile profile, a single selected color across all expression previews, consolidated team identity/member/idea composition, actual invitation controls using existing contracts, a preview-driven team picker, public discovery pagination and contextual feedback. Admin settings have content-appropriate panels and preserved state; rules are grouped essentials, the agenda is a timeline, and project/submission/history screens have dedicated hierarchy.

Visual iterations fixed insufficient selected-link contrast, invalid-field focus beneath the sticky header, inherited menu colors, hydration-sensitive early controls, clipped expression marks, a moving project-history frame, mobile placeholder geometry and cramped admin disclosure spacing. Native browser screenshots were opened, not accepted solely from assertions. Differences from accepted composite boards are documented in each page QA report; the latest explicit single-color expression and hero requirements override earlier board details.

## Publication and runtime limits

- All synthetic browser writes use disposable local databases. Tests never send a real sign-in email or complete Google login. The real Google flow remains unverified.
- Native PNGs retain their source SHA and viewport. The parent successfully transferred six refreshed priority screenshots to native Library attachments. Remaining originals are accessible through committed repository evidence; this worker does not invent Library IDs.
- Chromium runs in the installed container-compatible configuration; touch is emulated. Accessibility scans cover sampled states and do not establish full compliance or physical-device validation.
- Privacy/Terms remain factual drafts for owner review. Parampreet Singh and hey@itsparam.in are confirmed. Unnecessary private data has a90-day post-event retention period; public showcase and indefinite owner-only audit logs are separate. No automated erasure job was added or claimed. Existing stored policy records and data were not rewritten.
- The ARM64 backend archive includes the email template/default sender update. The user must manually redeploy it to publish those backend changes. Static architecture inspection and host JavaScript smoke do not constitute execution on ARM64.
- Cloudflare1010 previously blocked the parent's diagnostic client on the custom domain. No attempt bypassed that control, and local results do not classify it as an app failure.

## Release checks

- Production build: `npm run build`, default Next16.4.3 Turbopack, passed. The isolated worktree's earlier symlink limitation does not affect this real-root build.
- Typecheck: `npm run typecheck`, passed after correcting an incomplete synthetic actor in the zero-value test fixture. The earlier failed build log is retained.
- Complete suite: `node --no-wasm-code-gc --import tsx --test --test-concurrency=1 tests/*.test.ts`:427 tests,421 passed,6 skipped,0 failures. The normal runner passed420 and skipped6 but one synthetic PostgreSQL process crashed in V8 code collection; its failure and the isolated3/3 retry are preserved. This workaround is a test-runner flag, not an application/runtime configuration change.
- Integration:56 original matrix PNGs plus12 focused correction PNGs;11 routes at four viewports plus settings panels. Corrected disclosure geometry and Rules contrast pass. Five sampled route accessibility scans after correction have zero violations.
- Independent combined profile/team review:16 read-only checks and27 initial native PNGs, with an unsettled platform-logo frame explicitly rejected and replaced by a decoded-SVG capture.
- Page-owned evidence: profile24 keyboard/touch checks and two persisted saves; team20 focused tests and12 real browser groups; admin48 focused tests,48 no-JavaScript forms and14 native-control groups; projects/rules23 focused tests,13 controls and8 state groups; landing24 focused tests and34 integrated captures; legal19 browser/HTTP checks and4 zero-violation scans; email26 SMTP/auth tests.
- Backend package:93 files,9,009,666 compressed bytes; Linux ARM64 architecture verified, isolated host smoke passed without network access. See artifacts/neon/README.md for manual redeployment and ARM execution limits.

Native evidence indexes: `evidence/redesign-priority-review`, `evidence/combined-readonly-344334b`, `evidence/redesign-team/final`, `evidence/admin-redesign-2026-10-24`, `evidence/PROJECTS_RULES_DELIVERY.md`, `evidence/redesign-landing`, `evidence/signin-email`, `evidence/seo-legal-0f5f823`, `evidence/final-integration`. Logs are in `evidence/release-validation`. Original PNGs remain original browser captures; labeled comparison sheets are separate.

## Frontend measurements

The same-fixture webpack comparison completed28 baseline and28 final navigation samples, fresh browser contexts and disabled HTTP cache. Initial browser API requests stayed0; completed request counts did not increase. Desktop median wire bytes increased0.55–1.02%. Dashboard median TTFB/FCP rose, while the other sampled medians generally decreased. These development observations do not establish a hosted speed improvement. Raw outliers and differing initial admin filter state remain documented in `evidence/final-performance`.

The production build's all-route static JS inventory is943,030bytes (284,077gzip estimate), CSS279,287bytes (46,811gzip estimate). These totals are not per-visitor transfer sizes. No package/dependency/lockfile change or heavy animation library was added. Normal-motion rest/offscreen pause, reduced motion and visible short-mobile dot settlement were checked separately.

The original admin DOM240 versus2905 comparison mixed an empty and a populated filter state. A separate actual All/All check with44 participants measured2832→2905 document elements and2691→2707 participant-section elements. See `evidence/admin-dom-comparison`; no empty-state comparison is presented as a performance regression.

## Baseline form-safety fix

The pre-existing main696b125 native-GET issue was reproduced locally with synthetic values only. Named initial-profile fields were avatarExpression,avatarColor,fullName,email,bio,sex; the admin credit form named its CSV field. Navigation was intercepted before delivery. No production exposure is asserted. Minimal code9914b43 plus evidencebb5acb1 remains on `fix/client-form-hydration-safety`; its41 focused tests/typecheck and webpack build passed. Merge/deployment approval remains with the parent/owner.

## Local cleanup note

All child Next frontends and QA browsers were closed after their captures. Local synthetic backend listeners8793,8795 and8813 remain after wrapper termination attempts; their child identities are outside the callers' visible process namespace, so termination outcome is uncertain and guessed PIDs were not signaled. This does not involve a production service or block the reviewed code/artifacts.

## Authorized deployment-filter exception

The user subsequently authorized only main commit e386cc72244c5613588ec60b02998637a9aadcb7, adding vercel.json with **:false/main:true. Parent is original696b125; author and committer verified. Remote SHA/file and8 minimatch cases passed. The exact config was cherry-picked to all9 active work branches before their next pushes. No redesign/safety merge or Vercel account operation occurred; the main push may trigger one production build. Existing deployments and other inactive branches remain untouched. See `evidence/vercel-main-only`.

Final team creation evidence was requested separately and delivered at a431f4c: desktop1440×900, mobile390×844 and short390×480 originals were captured from sourcee1209bc, opened and inspected, without any creation mutation.

## Reopened creation-layout review

After these checks, the user rejected the short390×480 team-creation composition as disturbed/misaligned. The screenshots at a431f4c are now before evidence, not an accepted final design. Header/close, initials/color picker, fields and action are being reworked together. Fresh same-viewport screenshots and focus/touch/persistence checks are required before this page closes. Other recorded checks remain historical evidence.

final result: blocked
