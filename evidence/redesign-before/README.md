# Baseline screenshot audit

Original application source `696b125f9711a4fd6e02c3ece3adadb18b83cba7`. These are real Next.js browser captures using disposable synthetic fixtures, not mock screens. Capture preceded the redesign.

- 64 screenshots cover all three profile steps, dashboard Team/Credits/Project, team discovery/create, participant discovery, admin participants/teams/submissions/settings/credits, landing and sign-in at1440×900,768×1024,390×844 and390×480. `report.json` binds each image to its route and viewport.
- The screenshot audit opened representative priority pages and all three profile steps; the additional state and populated audit sets were separately opened and reviewed by the reference audit agent. This directory alone is a capture inventory, not a claim that every image was individually accepted.
- No production identities, credentials, operational records or provider changes. Browser uses the executor-compatible Chromium configuration.
- Initial48 timing samples mix development compilation/cache conditions and are not a fair speed benchmark. Use the separate matching webpack rich-fixture before/after measurements, whose raw outliers and limits are retained.

Additional before evidence: `../redesign-before-states`35 empty/error/loading/dialog captures; `../redesign-rich-before`34 populated same-data captures and28 navigation samples.
