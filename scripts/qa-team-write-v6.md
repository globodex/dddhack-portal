# Prepared local Team write runner

`qa-team-write-v6.mjs` is default-disabled and runs only against a fresh disposable local database using the reserved Team fixture helper. Each viewport/input mode requires its own reset receipt. Execution results belong in source-bound evidence; preparation is not a passing browser result.

Required gates:

- `TEAM_WRITE_READY=1`: coordinator authorizes the write phase now.
- `TEAM_WRITE_FRESH_FIXTURE=1`: coordinator freshly reset the local DB; no earlier write run shares it.
- `TEAM_WRITE_RESET_TOKEN`: exact fresh UUID `resetToken` from the coordinator's reset manifest. It is consumed in `/tmp` using exclusive file creation before launch and cannot be reused after failure.
- `TEAM_WRITE_RESET_MANIFEST`: exact `/tmp/ddehack-controls-<UUID>.json` receipt path. Its reset token, disposable/synthetic/reset confirmation flags, loopback origin, source, Worker and artifact root must match. The report records its hash.
- Exact matching `DASHBOARD_QA_SOURCE` and `DASHBOARD_QA_WORKER` hashes supplied by the coordinator.
- `TEAM_WRITE_VIEWPORT=mobile`, `desktop`, `tablet` or `keyboard`; one mode per newly reset DB. Mobile/tablet use Playwright touch emulation, desktop uses mouse clicks, keyboard uses focus plus Enter/Space.
- Optional `DASHBOARD_QA_OUTPUT` chooses a new evidence directory.

Use the sandboxed Chromium launch; do not disable the sandbox. The runner imports the locked `playwright-core` package and uses `CHROMIUM_PATH` (default `/usr/bin/chromium`). `TEAM_WRITE_ORIGIN` defaults to `http://127.0.0.1:4173` and accepts only a bare HTTP `127.0.0.1` origin, allowing an isolated local port. `TEAM_WRITE_ARTIFACT_ROOT` defaults to the current checkout. Both must match the reset receipt. It does not start, build, reset or publish anything.

Before the first write, it verifies the two exact seeded teams, leader/member IDs, two pending fixed request IDs, empty ideas, zero attempts and teamless applicants. Only the five reserved `fake_teamqa_*` actors can create contexts. Every POST must match one just-in-time actor/action/exact-body permit and consumes it once. Other methods, external requests and unallowlisted writes are aborted. After failure, stop and inspect the report; do not rerun on the partially changed DB.

The intended ten writes are: save a 500-character idea, rename, style, accept, decline, remove accepted member, lock, delete solo team, create its replacement, request that new team. Local required title/description, real typing at the 500-character boundary, rename required/minimum length, eight palette selections, Cancel-before-Delete persistence, named destructive confirmations, successful responses and reloaded own-dashboard projections are checked between stages. No API-only write bypass, production identity or unrelated fixture actor is enabled. The new replacement team UUID is restricted to the value returned by the allowed create action. The fixture helper regression separately verifies recoverable deletion/history and normal backend lock guards; this browser runner cannot inspect private audit storage and makes no audit-history claim.

The pure reset-receipt validator has a focused no-browser unit check covering a matching reset and alternate loopback port plus stale source/Worker/root, external/non-bare origin, wrong path/token and missing required flags: `node --import tsx tests/team-write-reset-guard.test.ts`.

Two original viewport captures are intended after saved changes and after lock. No credit secrets are accessed. A successful run should produce ten allowed writes with zero unexpected requests or page errors. All browser contexts close and the compiled hash is checked again even if the functional sequence fails.
