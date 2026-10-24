# Sign-in email presentation

Code commit: `2bb0ea1f9552b8d9165b977b2f1a9f6ae5073c29`.

The backend now sends a responsive HTML email alongside the existing plain-text alternative. A clear Sign in action and a visible fallback URL point to the same generated confirmation URL. The email uses a warm background, restrained DevDay branding, inline table styling and an Outlook conditional width wrapper. It loads no images, remote fonts, tracking or scripts.

For a plain `SMTP_FROM` address, `smtpFrom` supplies `DevDay Exchange · Parampreet Singh` as its display name. An explicit supplied display name remains intact. The configured address, SMTP login, password, owner email and provider settings are not changed. Existing successful named or plain sender settings can remain as they are. Control characters are rejected before trimming so header injection cannot be hidden by surrounding whitespace.

The auth handler, 15-minute expiry, browser-bound token, scanner-safe GET confirmation and consuming POST remain unchanged. The renderer consumes the URL already generated from configured `APP_ORIGIN`; it contains no hardcoded production origin. TLS verification, minimum TLS version, disabled URL/file access and disabled transport logging remain in force.

## Verified locally

- TypeScript passed.
- 26 focused SMTP/template and auth regressions passed with no failures or skips. Tests construct mail options without creating an SMTP transport or sending an email. The auth suite injects synthetic delivery.
- Escaping, button/fallback URL parity, expiry text, same-browser guidance, default/plain and explicit/middle-dot sender names, control rejection and transport safeguards are covered.
- Native browser screenshots at 1440x900 and 390x844 were opened and inspected. Both show the complete fallback link and a 52px primary action without horizontal overflow. There were no page errors or external asset requests.
- No mail was sent, no live sign-in URL was used and no provider configuration changed.

Evidence: [desktop screenshot](../evidence/signin-email/signin-email-1440x900.png), [mobile screenshot](../evidence/signin-email/signin-email-390x844.png), [capture report](../evidence/signin-email/report.json), [test output](../evidence/signin-email/tests.log). The standalone [HTML preview](../previews/signin-email/signin.html) uses an explicitly invalid synthetic token.

## Reproduce

```sh
npm run typecheck
node --import tsx --test tests/neon-smtp-config.test.ts tests/neon-signin-email.test.ts tests/neon-auth.test.ts
node --import tsx scripts/render-signin-email-preview.ts
EMAIL_PREVIEW_BROWSER_SANDBOX=false node scripts/qa-signin-email-preview.mjs
```

The final flag is specific to this executor's unavailable Chromium native sandbox. The runner defaults to the sandbox elsewhere. It serves only the generated synthetic HTML on a temporary loopback HTTP endpoint and closes that endpoint after capture. Managed Chromium blocked direct `file://` navigation; no file-access policy was changed or bypass flag used.

## Backend handoff

The email renderer lives in the backend Function. After integration, rebuild the official ARM64 `portalapi.zip` and let the user redeploy that backend archive. A frontend-only publication does not update the email.

This checkout has no committed archive build command. `neon/scripts/build-baseline.py` generates SQL and `scripts/build-verified.sh` builds the legacy frontend; neither packages the Function. [The existing packaging record](migration/STORAGE-PACKAGING.md) specifies the official `@neon/config-runtime@1.10.2` `buildFunctionBundle` flow, an absolute `neon/api.ts` source, `env: {}` and included ARM64 sharp files. Its historical temporary `/tmp/portal-neon-packaging` helper is absent in this executor. The integration owner must use or restore that official packaging workflow, preserving the native files and validating the archive rather than substituting a one-file JavaScript bundle.

Actual Gmail, Outlook and Apple Mail rendering, deliverability and a hosted full login remain unverified. Browser screenshots do not establish those outcomes. No deployment is part of this change.
