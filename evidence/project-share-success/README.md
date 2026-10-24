# Project sharing and submission success

Implementation: `f626d2a09b47a111790a2099a257a4e55fba7d3f`, then `106ed8d` for receipt counts and `4391381` for version-matched actions. Isolated branch `feat/project-share-success`, based on coordinator source `f844c715268302ce58d7209b35713da775923a0d`. Final browser captures ran against committed source `4391381`.

Embedding contract:

```tsx
import ProjectShare from "./project-share";
<ProjectShare publicPath={serverGrantedPath} projectName={projectName} />
```

`publicPath` must be the authoritative eligible `/projects/:slug` path. It must not be constructed from a private draft slug. The default trigger is a 44px icon-only button named Share. `showLabel` adds visible Share text for the success popup. Browser share URLs use the current origin only. The pure URL helper also accepts an explicitly configured server origin; it contains no deployment-host guess.

The success hook requires a committed `versionId` receipt and an integer attempt count from 1 through 3. It consumes fresh `workspace.projectPublicPath` and the receipt's `result.attemptsUsed`; the refreshed workspace count is a compatibility fallback. Prioritizing the receipt preserves the exact attempt for an idempotent retry even if the workspace now has a newer version. Coordinator commit `46afa8b` supplies the authoritative backend fields and verifies the public route. No public route is inferred from a slug or old eligibility. Pending/ineligible/no-refresh success shows the exact success heading, the submission-count chip, and Done, without Share/View or an evaluation paragraph. Successful submission suppresses the ordinary success toast. No additional submission is issued.

Success Share/View also requires `fresh.project.published_version_id === result.versionId`. An older idempotent receipt retains its original attempt chip but offers only Done when a newer published version is now current.

Share behavior:

- X uses its supported text, URL, and hashtags intent fields, with the exact requested caption and both hashtags.
- Facebook and LinkedIn use URL sharing. Their link flows do not reliably accept arbitrary prefilled commentary. The component copies the exact post text on activation when permitted and offers Copy post text, with an honest paste status.
- Instagram uses the device share API when available, with the exact caption, hashtags, and URL. Cancellation makes no success claim. Without native sharing it copies the complete post; denied clipboard access reveals selectable text. There is no invented Instagram compose URL.
- Social links are built locally, open with `noopener noreferrer`, and load no provider SDK. The four brands use local SVG assets; Facebook adds the matching MIT-licensed Tabler brand icon and source entry.

Primary documentation reviewed:

- [X Post Web Intent](https://docs.x.com/x-for-websites/post-button/guides/web-intent) documents `text`, `url`, and comma-separated `hashtags`.
- [Meta Share Button](https://developers.facebook.com/documentation/plugins/share-button) and [Sharing on the Web](https://developers.facebook.com/documentation/sharing/web) describe sharing a URL and the user's message. Some Meta pages returned HTTP 429 during direct retrieval; indexed official documentation was also reviewed.
- [LinkedIn Share Plugin](https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/plugins/share-plugin) documents URL sharing, without promising arbitrary commentary prefill.
- [Instagram Sharing to Stories](https://developers.facebook.com/documentation/instagram-platform/sharing-to-stories) describes Android and iOS integrations, not a general website compose URL.
- [Facebook brand asset source](https://github.com/tabler/tabler-icons/blob/main/icons/outline/brand-facebook.svg).

Validation:

- `node --import tsx --test tests/project-share.test.ts`: 3 passed. Checks exact caption/hashtags, encoded intent fields, no second Twitter service, URL/origin rejection, real-receipt requirement, 1–3 attempt range, fresh-path gating and conservative refresh failure.
- `npm run typecheck`: passed.
- `node scripts/qa-project-share-success.mjs`: **9 checks, 17 screenshots, zero browser errors/provider requests/application writes**. It source-builds the actual production React components, Portal run hook, and full production CSS into a disposable local browser fixture. The HTTP server is GET-only; Playwright intercepts all synthetic API receipts and fresh projections. This verifies UI behavior and the server-field contract without an application write, posting, provider request, login, or native OS share. It does not replace coordinator testing of the real backend projection.
- The browser report covers 1440×900, 390×844, and short 320×480; native dialog focus/Tab/Escape, nested cancellation, browser Back, scroll-lock restoration, exact clipboard content, clipboard denial/manual selection, controlled native-share payload/cancellation, Instagram fallback, and Portal success/private/public/refresh-503/submit-400 branches. Each synthetic submit branch permits exactly one intercepted request. No duplicate toast or automatic second submission is allowed.

Representative images: `share-320x480.png`, `success-320x480.png`, `nested-share-390x844.png`, `instagram-manual-fallback-390x844.png`, `portal-private-390x844.png`, and `portal-public-390x844.png`. The browser report records the exact tested source and outcomes.

No real data or credentials were touched. No branch was pushed or deployed. Prior completed branch `fix/submission-consent-row` remains intact.
