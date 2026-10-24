# Independent credit stock audit

The bounded review used an isolated feature worktree and disposable SQLite/PGlite databases only. No browser, provider, production data, runtime cutover or manual production source changes were made by this audit. New owned tests are `tests/credit-stock-independent-audit.test.ts`.

## Source under review and outcome

Core feature: `be4fd8ca4a9837cd9e252ae69bed9235f5977cf8`. Owner follow-ups reviewed/imported:

- `7e1503020856b748e33945562c098ed2e3823ed0`: immutable allocation ownership, overlap rollback and legacy upgrade repair.
- `7685b91ddec9f28dc13ef8eeafec0369bb71a1cc`: removed self reader gets actionable `PARTICIPANT_REMOVED` denial.
- `a8f608fe252008699f6f9ab58ac7f771ce37d306`: canonical category creation race fix reported below.

The local tested source is `fc6fc7f12c941345ed6143cff2034eb15d0d38b1`, which contains those exact owner changes via cherries. The final independent suite passes **14/14** (seven cases in each engine), with typecheck passing. All commit author and committer identities were verified as Parampreet Singh <rubercuber.30@gmail.com>.

## Confirmed defect, fixed by feature owner

Two normal new-category imports had the same normalized original CSV header, disjoint voucher codes, and different edited display headings. A deterministic hook let the second authorized import finish after the first preview/read but before the first transaction began. The first canonical-key insert used `ON CONFLICT DO NOTHING`, so it silently skipped the conflicting key while committing its new type, inventory and allocations. Both engines produced **two categories and two allocations for one current recipient** under the same canonical CSV header. The unmodified failure output is [preserved](../evidence/credit-stock-independent/canonical-header-race-before.txt).

The feature owner changed only new-category key insertion to require uniqueness. The independent regression now proves one winning category, stale import `409 PREVIEW_REQUIRED`, only one committed import before retry, and no second assignment. A normal new preview/retry appends stock to the winning category, preserves its display name and existing allocation, and yields total2/assigned1/available1. The owner fix has been verified; no remaining release blocker was found in this bounded review.

## Seven independent cases

| Case                                   | Evidence checked in both SQLite and PostgreSQL semantics                                                                                                                                                                                                                                                                                                                                                 |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stock arithmetic and canonical restock | 50 imported/10 checked in =50/10/40; ten later check-ins =50/20/30; 100 more same-header values =150/20/130. IDs, encrypted recipient mappings, display heading and shared Markdown instructions remain stable. Duplicate publish plus repair are idempotent. Durable import history contains no raw code, recipient ID or recipient email.                                                              |
| Failed import allocation               | Injected database failure during assignment rolls back types, stock, history, receipt and audits. The same prepared receipt retries successfully after failure removal.                                                                                                                                                                                                                                  |
| Failed bulk check-in allocation        | Attendance and manual status overrides roll back with inventory on assignment failure; deduplicated retry succeeds without double consumption.                                                                                                                                                                                                                                                           |
| Self access and revocation             | A manually checked-in admin with no roster row, profile or team receives only their own allocation. Cross-user payload is rejected, unchecked-in access denied, participant admin reveal denied. Removal immediately before reveal returns no value and does not expose the code or add reveal audit. Actual HTTP GET after removal returns403 `PARTICIPANT_REMOVED`, `no-store`, and no credit payload. |
| No recycle or ownership movement       | Codes deduplicate globally across categories. Deletion retires rather than recycles their hashes; retry of a deleted batch is rejected. Hash history contains no recipient/time/raw-value columns. Direct allocation owner UPDATE is rejected by the feature guard.                                                                                                                                      |
| Real upgrade rollback                  | Both actual migration runners reject conflicting original source headers with different display names, and legacy assigned global fingerprints held by different recipients. Snapshots and migration journals remain unchanged; partial new tables are absent. The pre-stock fixture dynamically excludes subsequent migrations rather than hardcoding a total migration count.                          |
| Overlapping new imports                | The confirmed canonical-key race and corrected rollback/retry behavior described above.                                                                                                                                                                                                                                                                                                                  |

## Boundaries

PGlite uses one serialized connection. The interleaving tests exercise real service reads/commands, SQL constraints and complete transactions with an explicit intervening commit; they do not claim native PostgreSQL concurrent-connection or deployment proof. The first arithmetic fixture has22 eligible identities,20 checked in; waiting-recipient exhaustion is covered by the feature owner's separate65-recipient suite, not claimed as this audit's result. Earlier shared quick-check-in/reinvite regressions remain a separate suite and source report.

This review did not broaden into media, auth providers, unrelated flows, retention deletion jobs or production migration execution. The history schema stores hashes, stock/category identifiers and consumed/exposed flags without recipient identity/time; no retention behavior was changed here. Feature migrations still require the owner's manual deployment process.

## Commands and preserved output

```sh
node --import tsx --test --test-concurrency=1 tests/credit-stock-independent-audit.test.ts
npm run typecheck
```

- [Final14-case output](../evidence/credit-stock-independent/final-tests.txt)
- [Typecheck](../evidence/credit-stock-independent/typecheck.txt)
- [Prior12-case pass before the new canonical race fix](../evidence/credit-stock-independent/core-hardened-before-header-fix.txt)
- [Exact canonical race failure before the owner fix](../evidence/credit-stock-independent/canonical-header-race-before.txt)

Earlier test-harness corrections (PostgreSQL row ordering, async migration loader, immutable roster fixture setup, engine-specific constraint error matching) were not product defects. Only the reproducible canonical-key race was escalated as a new implementation defect. The generic removed-reader denial was privacy-safe and was improved by the owner for actionable feedback.
