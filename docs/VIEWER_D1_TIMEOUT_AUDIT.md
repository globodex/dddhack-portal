# D1 integration deadline audit

The Viewer API change did not add migrations, dependencies, fixture work, or a new D1 test body. The tracked D1 test, helpers, seed, SQLite migrations, package manifest, and lockfile are identical between `d97d614` and `853c5b1`. The relevant actor change replaces the indexed Luma lookup with a registration-or-Luma lookup inside the same request.

The existing 30-second integration deadline failed twice in the root validation. The isolated raw failure is preserved at `evidence/viewer-d1-timeout/original-30s-isolated.log`; the root retains its full-suite failure in `evidence/viewer-registration/final/tests.log`.

One diagnostic copy per source ran serially, baseline first, with a 120-second diagnostic deadline. Both retained and passed all ten assertion calls, including 200 imported registrations, one allocation after 12 repeated concurrent check-ins, transaction rollback, and exactly three committed submissions/jobs from ten concurrent attempts. The generated instrumentation is byte-identical after normalizing the checkout path. The original tracked test was untouched during both runs.

| Phase                                             | Baseline `d97d614` | Current `853c5b1` |
| ------------------------------------------------- | -----------------: | ----------------: |
| Miniflare binding                                 |             0.97 s |            0.63 s |
| All unchanged migrations                          |            10.15 s |           10.15 s |
| Seed                                              |             2.59 s |            5.56 s |
| 200-row preview and commit                        |             1.07 s |            0.59 s |
| 12 concurrent check-ins                           |            13.17 s |            4.33 s |
| Ten concurrent submissions                        |            34.28 s |            9.15 s |
| Complete integration callback, including disposal |            64.30 s |           31.58 s |

This identifies an integration budget problem rather than a stalled Miniflare startup. Both source versions exceed 30 seconds under the observed shared cloud conditions. These single diagnostic samples do not establish production endpoint latency or a stable speed comparison.

The baseline executes 1,023 D1 RPCs/1,363 statements; current executes 1,028/1,372. All phase counts outside the concurrent submission phase match. Both execute 71 actor/roster lookups. The five extra current RPCs comprise one five-statement batch and four reads in the submission phase. That existing limit path can reject contenders during preflight or after a transactional race, with a catch-path re-read. This aggregate trace does not identify each rejected contender's exact branch.

The current run observed a four-core cgroup quota, 59 throttled periods, and 5.66 seconds added to the cgroup throttled-time counter. OOM counters stayed zero. A near-limit `memory.current` observation included substantial file cache; the saved post-pair snapshot records about 3.27 GB anonymous memory and 11.37 GB file memory. Those counters support shared-resource variability, but do not prove an OOM cause or quantify its contribution to each phase. Baseline environment start/end counters were not captured; its measurements remain intact.

The approved fix changes only this test's deadline to 120 seconds and adds a concise explanation of its 1,023+ RPC integration scope. Removing those three comment lines and restoring the old deadline reproduces the original file byte-for-byte, including every assertion, concurrency level, fixture value, and command. No application query, permission, cache, batch, provider, or database behavior changes.

`scripts/diagnose-d1-phases.mjs CHECKOUT OUTPUT_DIRECTORY` reproduces a diagnostic copy in the checkout's ignored `.local/d1-diagnostics` directory, retains the generated source and raw log, and records phase/RPC counts without SQL arguments or secrets. It only uses disposable synthetic Miniflare D1. The diagnostic helper's timeout is bounded separately from the tracked test and it never edits that test.

Full machine-readable results are in `evidence/viewer-d1-timeout/summary.json`, with per-source raw logs, generated copies, and reports in its `baseline` and `current` directories. Syntax checking and diff checks pass. The parent owns the fresh full-suite validation after this change is integrated under quieter conditions; that later result is not asserted here. No additional experiment, push, deployment, or hosted operation was performed.
