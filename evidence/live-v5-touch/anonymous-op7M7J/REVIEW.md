# Anonymous live v5 CTA diagnosis

Target: `https://dddhack-portal.param3021.chatgpt.site`.

Fresh anonymous sandboxed Chromium contexts used desktop 1440 × 900, mobile touch 390 × 844, tablet touch 834 × 1194 and early-hydration mobile touch. No user cookies or credentials were used. All non-GET/HEAD requests were blocked. Browser closure is confirmed.

Desktop, mobile and early-mobile showed “Continue with ChatGPT” with href `/signin-with-chatgpt` and target `_top`. Center hit testing belonged to the anchor, computed pointer events were `auto`, and trusted pointer/click events reached the anchor without default prevention. Mobile also recorded trusted touch events. The initial site response was HTTP 302 toward the authentication provider. No JavaScript page exception was recorded.

The reported signed-in legacy “Open your workspace” failure could not be reproduced from an anonymous session. The tablet stable-element scroll helper timed out before a tap; no tablet activation conclusion is supported. Mobile/tablet used touch emulation with Chromium's default user agent, not a physical-device claim.

Playwright routes only the first request in a redirect chain. The auth document was consequently followed and returned a constrained-run 403/challenge boundary; external subresources and every challenge POST were blocked. That 403 does not establish the cause of the user's reported signed-in mobile failure. No login or production mutation occurred. Future interpretation must preserve this redirect-chain limit.

`report.json` records sanitized URL origins, paths and query keys only. OAuth query values, cookies and headers were not recorded. Challenge token paths are redacted. The original `mobile-touch-before-cta.png` was directly inspected and remains local. No images were uploaded.
