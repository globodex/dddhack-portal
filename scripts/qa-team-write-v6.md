# Prepared local Team write runner

`qa-team-write-v6.mjs` is prepared, syntax-checked and default-disabled. It has not been executed against the screenshot preview. The coordinator must explicitly begin a separate write phase after other lanes finish captures and reset the disposable local database using the reserved Team fixture helper.

Required gates:

- `TEAM_WRITE_READY=1`: coordinator authorizes the write phase now.
- `TEAM_WRITE_FRESH_FIXTURE=1`: coordinator freshly reset the local DB; no earlier write run shares it.
- `TEAM_WRITE_RESET_TOKEN`: fresh unique 32-character lowercase hexadecimal token. It is consumed in `/tmp` using exclusive file creation before launch and cannot be reused after failure.
- Exact matching `DASHBOARD_QA_SOURCE` and `DASHBOARD_QA_WORKER` hashes supplied by the coordinator.
- `TEAM_WRITE_VIEWPORT=mobile`, `desktop` or `tablet`; one viewport per newly reset DB. Mobile/tablet use real Playwright touch events, desktop uses mouse clicks.
- Optional `DASHBOARD_QA_OUTPUT` chooses a new evidence directory.

Keep `PLAYWRIGHT_BROWSERS_PATH=/tmp/ddehack-playwright-browsers`. Use the sandboxed Chromium launch; do not disable the sandbox. The runner's only origin is `http://127.0.0.1:4173`, and its artifact check reads the integration worktree compiled Worker. It does not start, build, reset or publish anything.

Before the first write, it verifies the two exact seeded teams, leader/member IDs, two pending fixed request IDs, empty ideas, zero attempts and teamless applicants. Only the five reserved `fake_teamqa_*` actors can create contexts. Every POST must match one just-in-time actor/action/exact-body permit and consumes it once. Other methods, external requests and unallowlisted writes are aborted. After failure, stop and inspect the report; do not rerun on the partially changed DB.

The intended ten writes are: save idea, rename, style, accept, decline, remove accepted member, lock, delete solo team, create its replacement, request that new team. UI validation, eight palette selections, named confirmations, successful responses and reloaded own-dashboard projections are checked between stages. No API-only write bypass, production identity or unrelated fixture actor is enabled. The new replacement team UUID is restricted to the value returned by the allowed create action. The fixture helper regression separately verifies recoverable deletion/history and normal backend lock guards; this browser runner cannot inspect private audit storage and makes no audit-history claim.

Two original viewport captures are intended after saved changes and after lock. No credit secrets are accessed. A successful run should produce ten allowed writes with zero unexpected requests or page errors. All browser contexts close and the compiled hash is checked again even if the functional sequence fails.
