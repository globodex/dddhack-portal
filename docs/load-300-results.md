# Measured 300-participant compiled HTTP diagnostic

Completed 2026-10-23, 18:02:14.474–18:03:00.650 UTC (46.176 seconds, including invariant reads). All competing public/profile/admin browsers were confirmed closed; root paused builds/tests for the timed workload. Loopback HTTP at `127.0.0.1:4183` executed the unchanged compiled Worker in local workerd with real disposable D1. No production Site or external API was contacted.

**Result:** 1,986 requests (314 GET, 1,672 POST): 1,870 HTTP 200, 115 expected HTTP 409 attempt/concurrency rejections, one expected HTTP 403 nonleader rejection, and zero unexpected errors/timeouts. Expected non-2xx rate is 5.84%; unexpected error rate is 0% for this bounded run. These observations do not establish hosted capacity or production latency.

## Fixture and correctness

- Exactly 300 synthetic participant users, 90 teams, 300 memberships, plus two separate operational admin fixtures. Team sizes 1/2/3/4/5 have counts 4/25/21/17/23; maximum five. Deterministic assignment hash is recorded in the raw report.
- Ninety leaders made actual successful HTTP commits. Identical first and third retries consumed no extra attempt. Same-receipt races resolved to one version at concurrency 1/4/8/16; distinct final races admitted exactly one winner per team. Every fourth distinct commit was rejected.
- Final database: 90 projects, 270 immutable versions, 270 commit receipts and 600 unique user/project votes. Three hundred duplicate-vote retries and bounded same-vote races added no rows.
- Before explicit synthetic eligibility decisions, public projects were empty. After those audited local admin actions, actual public pages were 24/24/24/18, with 90 unique projects; pagination remained correct after votes.
- No duplicate vote rows, foreign-key violations, outbound request attempts, evaluation runs or AI jobs. Immutable artifact fingerprints matched before/after. Temporary D1 storage was disposed and removed.

## Request latency

Empirical nearest-rank percentiles measure client fetch through full response consumption. Cohorts run sequentially, cover 75 distinct participants each, and contain 15 GETs per dashboard/profile/team-discovery/participant-discovery/projects route. Maximum in-flight is 16, not 300. Route mix and local D1 contention are part of these observations; attribution requires separate profiling.

| Phase | Concurrency | Requests | p50 ms | p95 ms | Expected rejects | Unexpected errors |
|---|---:|---:|---:|---:|---:|---:|
| initial-90-leader-commits | 8 | 90 | 131.9 | 172.3 | 0 | 0 |
| identical-initial-retry-90 | 16 | 90 | 217.0 | 223.3 | 0 | 0 |
| same-receipt-race-c1 | 1 | 4 | 17.8 | 22.8 | 0 | 0 |
| distinct-final-race-c1 | 1 | 1 | 20.1 | 20.1 | 0 | 0 |
| same-receipt-race-c4 | 4 | 8 | 57.9 | 76.6 | 0 | 0 |
| distinct-final-race-c4 | 4 | 4 | 70.1 | 70.2 | 3 | 0 |
| same-receipt-race-c8 | 8 | 16 | 115.9 | 137.1 | 0 | 0 |
| distinct-final-race-c8 | 8 | 8 | 116.9 | 117.3 | 7 | 0 |
| same-receipt-race-c16 | 16 | 32 | 209.2 | 228.6 | 0 | 0 |
| distinct-final-race-c16 | 16 | 16 | 222.5 | 223.8 | 15 | 0 |
| remaining-second-commits | 8 | 86 | 129.5 | 157.1 | 0 | 0 |
| remaining-third-commits | 8 | 86 | 125.5 | 169.7 | 0 | 0 |
| fourth-commit-rejected-90 | 16 | 90 | 214.6 | 263.5 | 90 | 0 |
| identical-retry-after-third-90 | 16 | 90 | 209.6 | 251.4 | 0 | 0 |
| explicit-local-fixture-eligibility | 4 | 90 | 35.5 | 48.2 | 0 | 0 |
| normal-reads-c1 | 1 | 75 | 28.9 | 312.8 | 0 | 0 |
| normal-reads-c4 | 4 | 75 | 368.7 | 825.2 | 0 | 0 |
| normal-reads-c8 | 8 | 75 | 525.2 | 1560.0 | 0 | 0 |
| normal-reads-c16 | 16 | 75 | 1269.7 | 2772.8 | 0 | 0 |
| 600-distinct-user-project-votes | 16 | 600 | 134.3 | 246.6 | 0 | 0 |
| 300-duplicate-vote-retries | 16 | 300 | 130.2 | 210.9 | 0 | 0 |
| same-vote-race-c1 | 1 | 4 | 11.0 | 11.1 | 0 | 0 |
| same-vote-race-c4 | 4 | 8 | 38.9 | 50.2 | 0 | 0 |
| same-vote-race-c8 | 8 | 16 | 73.5 | 74.1 | 0 | 0 |
| same-vote-race-c16 | 16 | 32 | 128.2 | 143.8 | 0 | 0 |
| immutable-history-after-third | 4 | 4 | 51.4 | 51.4 | 0 | 0 |

The mixed read p95 increases from 312.8 ms at concurrency 1 to 2,772.8 ms at concurrency 16. No causal claim follows from that alone. A follow-up isolated harness query-count/timing profile will examine route/query work before proposing shared service or schema changes.

## Reproduction and evidence

- Source: `0e7756c60e2fff88a4f7fb1e3eca31efc20349d0`; Worker SHA-256: `75a667d2c42a821611c3cbbea72447ee464e2ad5f2f6165fbbba647764e69ce6`.
- Runtime: Node `v24.22.0`, Miniflare `4.20260730.0`, workerd `1.20260730.1`, TSX `4.20.6`; 81 explicitly enumerated unchanged compiled ES modules. Existing installed dependencies only.
- [Raw sanitized numeric samples and invariant checks](load-300-baseline.json): no response bodies, headers, secret values or image payloads. Actor labels are reserved synthetic IDs.
- [Prepared actual D1 counts](load-300-prepared.json) and [deterministic fixture plan](load-300-fixture-plan.json).
- [Runner](../scripts/load-300-run.mjs), [fixture generator/seed](../scripts/load-300-fixtures.mjs), and [offline assertions](../scripts/load-300-fixtures.test.mjs). See [plan](load-300-plan.md) for coordinated commands/bounds.

## Setup failures kept separate

The first automatic Miniflare graph-discovery attempt could not resolve computed dynamic imports; no HTTP ran. Explicit compiled-module enumeration fixed it. The prepared session then had closed stdin, so it was terminated with its workerd child before any timed request and restarted after root release. The next attempt returned an empty asset-router 404 on its first GET and stopped with zero mutations; its [separate failure evidence](load-300-router-setup-failure.json) is not mixed into the successful baseline. Explicit documented user-worker asset routing fixed that harness configuration.

The final runner also rejects a closed coordination stdin and asserts planned method/request/rejection totals. Those guard assertions were added after the measured run; the saved raw report independently confirms those same totals.
