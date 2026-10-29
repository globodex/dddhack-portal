# Team analytics backend release package

Built from exact committed runtime source `aede2eb7c595b2ddd0708bbd3337ab9e97dac21e` using official `@neon/config-runtime@1.10.2`, Node.js24/Linux ARM64 glibc, env{}, zero warnings. Main-only frontend publication is authorized; backend deployment is owner-operated and has not been performed by the agent.

- ZIP SHA256: `e2fe6ef514c45cd6f52175b25ce10a4f569fbe08bb648181c7059e07cd97200d` (9,042,403 bytes).
- index.mjs SHA256: `45f6f7ba72839fa2015c4bf14b5412c778e424817182abcdd472c807dc397f67`.
-93 files; only index.mjs changed versus previous a63f430 archive; all92 dependency/native entries remain byte-identical.98 exact committed application inputs, no frontend/fixtures/tests/SQL/env files. Independent fresh bundle matches exactly.
- No new migration for this follow-up. Prior fifteen-entry schema through0109 is still required; inspect rather than assume hosted state. Historical migration bytes/plan are unchanged. No automatic migration occurs.
- Matching backend deployment required for the Team size1–5 filter, lock-aware approval analytics and cohort participant captions. Yet to submit and Submitted remain distinct lifecycle filters while fully approved locked teams retain underlying approval analytics.

[Windows deployment commands](../../docs/TEAM_SIZE_ANALYTICS_WINDOWS_ROLLOUT.md), [behavior and validation](../../docs/TEAM_SIZE_ANALYTICS_REVIEW.md), [receipt](receipt.json), [package evidence](../../evidence/team-size-analytics-release/).

Package/env/ARM64 headers/hashes and host JavaScript routing were checked. Actual ARM64 execution, hosted schema and backend deployment have not been agent-verified. No paid evaluation, live-data mutation or credential/settings change occurred.
