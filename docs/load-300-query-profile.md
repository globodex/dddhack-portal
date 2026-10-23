# Read-query attribution on the 300/90 local fixture

**Partial diagnostic, not a second load-test pass.** This instrumented run attempted 192 of 224 planned GETs on 2026-10-23. It completed 176 and hit the 20-second client timeout on 16 concurrent Admin Participants reads. It stopped before concurrency-16 Admin Teams/Submissions, disposed workerd and removed temporary D1. The parent requested ending further amplification cohorts. No follow-up runtime was launched.

Root builds/tests/browser work was allowed concurrently, so these timings are infrastructure-contended diagnostics. The parent also observed a separate Miniflare synchronous-fetcher infrastructure assertion in a concurrently running test; neither run establishes production behavior. The earlier coordinated [1,986-request baseline](load-300-results.md) remains separate and had zero unexpected errors.

## Instrumentation and fixture boundary

A harness-only virtual entry imported the unchanged compiled Worker and wrapped `env.DB` prepare/all/batch operations. It emitted only normalized SQL templates, statement/call counts, awaited durations and numeric D1 metadata through a local service binding. No bind values, request/response bodies, identities or error text from D1 are logged. String/numeric SQL literals and comments are redacted; redaction assertions pass. Aggregate template durations can overlap through Promise.all and must not be added into a request critical-path estimate.

The fixture contains the same deterministic 300 participants/90 teams plus two ops admins. For this read-only HTTP profile, 90 projects, 270 versions and 600 votes were seeded directly into disposable D1, with 90 explicitly synthetic eligible projects. This fixture setup is **not** additional successful HTTP commit throughput. All measured application requests were GET. Existing GET actor setup may execute no-op upsert SQL; no HTTP mutations, AI or external fetch occurred. Worker SHA remained `75a667d2c42a821611c3cbbea72447ee464e2ad5f2f6165fbbba647764e69ce6`, source `0e7756c60e2fff88a4f7fb1e3eca31efc20349d0`.

## Measured counts

Counts include all D1 work inside the compiled request. Batch statements count individually; a batch is one D1 call. Sixteen requests were attempted per route/cohort.

| Route | SQL statements/request at c1 | D1 calls/request at c1 | c1 p50/p95 ms | c16 p50/p95 ms |
|---|---:|---:|---:|---:|
| /dashboard | 61 | 58 | 34.5/72.6 | 434.0/436.3 |
| /discover/teams | 731 | 730 | 289.8/338.6 | 5889.3/5890.8 |
| /discover/participants | 7 | 6 | 10.3/14.4 | 132.3/144.4 |
| /projects | 193/253 | 192/252 | 115.8/174.2 | 1959.9/1961.6 |
| /admin/participants | 3015 | 3014 | 1388.4/1695.3 | 16/16 timed out at 20s |
| /admin/teams | 907 | 906 | 388.9/583.1 | not launched |
| /admin/submissions | 187 | 186 | 74.8/191.2 | not launched |

Projects has 253 statements/252 calls on a 24-card page and 193/192 on the 18-card page. Completed c16 requests show the same counts as c1. For timed-out requests, unobserved telemetry is null, not zero; one Admin Participants timeout has completed adapter telemetry and 15 do not.

## Repetition and minimum-risk proposals

1. **Reuse public score projection once per response.** Across 16 Projects reads (360 cards), score-releases and full eligible-project scans each ran 376 times: one per response plus one per card. Source inspection confirms `view()` calls `publicScores()` and each `publicProject()` calls it again. Pass the already-authorized public projection into card serialization, scoped to that response; never cache across users or disclosure stages. In community stage, separately test whether the valid-score scan can be skipped. This directly removes measured redundant work without changing score visibility rules. Validate complete public JSON parity for community/AI/final/countdown/removal states before claiming improvement.
2. **Bulk-load team status/readiness facts.** Discover Teams executes 731 statements for 90 teams, including 180 team-lock lookups, 90 overrides, 90 attempt counts, 90 checked-in-member counts, 90 eligibility-reason queries, 90 membership approval aggregates and 90 pending-action checks. Admin Teams executes 907. Read the required facts by team in bounded set queries, map by ID, and preserve the existing centralized attendance/removal/override precedence. Do not replace authorization with client-side filtering. Request-local reuse of repeated same-team facts is a smaller first step.
3. **Remove per-directory-row status work in Admin Participants.** At 302 directory rows (300 participants plus two separate operational fixtures), this route executes 3,015 statements: status/attendance/removal templates each302 times and team status/readiness/lock templates each300 times although there are only90teams. Compute each team once per response, then bulk participant facts. This is the largest measured query amplification and should be addressed before repeating c16 admin bursts.
4. **Join or batch Admin Submissions metadata.** It executes 187 statements for90projects:90 removal lookups +90 version-list lookups. Load authorized project/version/removal metadata in bounded set queries, retaining immutable version history and soft-delete semantics.
5. **Dashboard request-local actor/settings reuse.** Its61 statements include actor upserts/profile inserts/actor reads/actor-profile joins/settings reads each3 times and roster/removal reads4 times. Reuse only within the current request and revalidate at mutation boundaries. This is lower priority than731/3,015-query routes.

No index change is proven by these counts alone. Existing primary/unique indexes already support many repeated lookups; use EXPLAIN QUERY PLAN and rows-read evidence after batching before proposing schema indexes. No shared service, schema, CSS or application source was edited.

## Evidence and failures

- [Sanitized per-request counts/timings and full template aggregates](load-300-query-profile.json); original44MB per-call record remains in ignored `outputs/load-300/profile-2026-10-23T18-07-04.267Z-216034/report.json`.
- Unique harness files: `scripts/load-300-profile.mjs`, `scripts/load-300-profile-worker.mjs`, `scripts/load-300-profile-normalize.mjs`, `scripts/load-300-profile.test.mjs`.
- An initial preparation attempt failed a real submission-window database trigger before any GET because seeded version timestamps were outside the explicit local fixture window. The seed timestamp was corrected to current time; no trigger or production rule was bypassed.
- After this partial run, only offline syntax/redaction checks were run. No c16 admin retry, no further workerd launch and no production traffic.
