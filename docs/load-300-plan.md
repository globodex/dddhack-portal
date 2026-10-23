# 300-participant compiled HTTP load plan

Prepared in `.worktrees/load-300`, branch `test/load-300-compiled`, from `bd6eb90`. Ownership is limited to new `scripts/load-300*` and `docs/load-300*` files. No application, schema or shared fixture file is changed.

## Current status

**Completed:** an actual compiled Worker + disposable D1 HTTP run passed on 2026-10-23, using root-approved source `0e7756c60e2fff88a4f7fb1e3eca31efc20349d0` and Worker SHA-256 `75a667d2c42a821611c3cbbea72447ee464e2ad5f2f6165fbbba647764e69ce6`. Root confirmed public/profile/admin browsers closed and paused builds/tests during the timed workload. See [measured results](load-300-results.md) and [sanitized samples](load-300-baseline.json). This is a local diagnostic, not hosting-capacity evidence.

Exactly 300 unique synthetic participant identities are allocated reproducibly across 90 teams. The algorithm shuffles participants with seeded xorshift32/Fisher-Yates, assigns one leader/member to each team, and distributes the remaining 210 only among teams below five members. Default seed `0x30090005` produces team sizes 1/2/3/4/5 with counts 4/25/21/17/23. Membership total is 300; no team exceeds five. Assignment SHA-256 is `2f0ad7380b518a15b2ab815c4f1d67e08122751f96c536057e4931101ed945ae`.

Two reserved synthetic operational admin identities are separate from the 300 participants. No owner-only action is exercised and no real owner's email is impersonated. There are no real attendees, credentials, credits, model clients or external repository verification calls.

## Harness boundary

`scripts/load-300-run.mjs` loads the actual compiled `dist/server/index.js` from the coordinated visual-integration build into local workerd through the already-installed Miniflare dependency. It serves actual loopback HTTP at **127.0.0.1:4183**, separate from the visual preview's 4173. It applies the matching artifact checkout's migrations to a fresh temporary D1 database and removes the storage after disposal.

All application submissions, retry/receipt checks, eligibility decisions and votes go through the compiled HTTP API. Direct D1 access is limited to schema migration, deterministic disposable fixture setup and final invariant reads. The code never calls `PortalService` directly. Worker outbound fetch is denied and logged by the harness. HTTP redirects are rejected; the client URL is fixed to the isolated local port. No production Site is contacted.

Fixture setup deliberately opens a local operational submission window around test time and records synthetic Going/check-in/profile/roster state. The fixed repository cutoff is not altered. Only after actual successful project commits does a synthetic operational admin record explicit, audited **local fixture** eligibility decisions, with a reason stating that no real repository/GitHub verification or production policy change is claimed. Those decisions allow the real paginated public API to contain 90 test projects. No results are revealed and no AI jobs are configured.

## Bounded workload

Concurrency is always 1/4/8/16, never 300. The complete planned workload has 1,986 requests (314 GET, 1,672 POST), including 116 expected rejections. An eight-minute abort budget begins only after the coordination hold is released. Requests have a 20-second timeout, responses are consumed before the next item, and there are no automatic retries masking errors. Deliberate retry cases are labelled explicitly.

- Commit the first version through HTTP for every one of the 90 real seeded leaders. Retry each identical request and prove 90 versions/receipts remain.
- Four distinct teams exercise identical-request races at concurrency 1/4/8/16, then competing final commits at those same levels. Exactly one distinct final request per team can win.
- Complete exactly three successful commits for all 90 teams, reject each fourth distinct commit, and accept identical receipt retries without adding versions. Assert 270 immutable versions and 270 receipts.
- Assert unverified projects remain hidden, then make the explicit synthetic fixture eligibility decisions. Read all public pages and prove page sizes 24/24/24/18 and 90 unique projects.
- Exercise normal GETs as four 75-person cohorts across dashboard, profile, team/participant discovery and paginated public projects, covering all 300 participant identities. Each cohort uses its labelled concurrency level.
- Submit 600 distinct user/project votes, retry 300 duplicate votes, and burst the same existing voter/project pairs at concurrency 1/4/8/16. Prove the database still has exactly 600 unique pairs.
- Reject a nonleader commit, recheck public pagination and accessible immutable three-version history, and assert foreign keys, participant/team/membership counts, max team size/attempt count and zero evaluation/AI rows.

Each phase records actual request count, concurrency, HTTP method counts, empirical p50/p95, 2xx responses, expected rejections, unexpected errors and rates. Expected authorization/conflict/attempt-limit rejections are distinct from system errors. Raw sanitized samples contain timing/status/code/byte counts and reserved actor IDs; response bodies, auth headers and uploaded fixture images are not written to the report.

## Prepared commands

These checks are offline:

```sh
node --check scripts/load-300-run.mjs
node scripts/load-300-fixtures.test.mjs
node scripts/load-300-run.mjs
```

After root confirms a matching fresh compiled build and coordinates competing browser/performance work:

```sh
node --import ../visual-integration/node_modules/tsx/dist/loader.mjs scripts/load-300-run.mjs --artifact-ready --hold-after-seed
```

Use a PTY to keep stdin open for a held run. After preparation prints `waiting:true`, send `RUN_LOAD_300` followed by a newline on stdin only after root releases the coordination hold. `STOP_LOAD_300` cancels before timed HTTP. Miniflare receives an explicit list of unchanged compiled ES modules because automatic discovery cannot resolve the bundler's computed dynamic imports. The first preparation attempt failed at that graph-discovery step with no timed requests; this is a harness setup issue, separate from application measurements.

The TS loader is needed only to read the matching checkout's policy constants; production traffic still executes the compiled Worker. No package installation is part of the script. Artifact Worker/config/client-manifest SHA-256 values are recorded before/after; a changed build invalidates that run. Reports are written only to this worktree's ignored `outputs/load-300/<run>/report.json` before temporary D1 cleanup.

## Limits

This is a local compiled HTTP/D1 diagnostic, not a hosting-capacity guarantee or an assertion that 300 users are simultaneously active. It does not prove production ChatGPT sign-in or real repository eligibility. Actual screen rendering is owned by the separate visual QA process and must not be conflated with this HTTP workload. Any harness incompatibility or product failure will be reported explicitly rather than replaced with an in-process success.
