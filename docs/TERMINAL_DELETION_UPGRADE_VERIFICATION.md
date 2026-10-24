# 0105 populated upgrade verification

The current plan appends only `0105_terminal_record_deletion.sql` to the previously reviewed ten migrations. Its canonical LF SHA256 is `088b96a239915cd518765b5ef260c73feee913d8e0b181234110f7591676ccde`; the eleven-entry approved plan digest is `e3b7a348e2c9e3f4f066a78fbd02274a0e111155b3af527f99bdc545bbe32691`.

All seven canonical historical entries, their seven exact Windows CRLF aliases and canonical0102–0104 checksums are preserved. Feature migrations remain LF-only. Source inspection/repair validates all eleven HEAD/index blobs and refuses content edits, BOMs, changed approval data, unexpected file sets and noncanonical source. The diagnostic scratch fixture includes the compatibility module so actual CRLF-source CLI refusal tests the strict plan rather than a missing import.

The current owner handoff defaults to an inspected nine-entry target with exact0104+0105 pending, or a ten-entry target with only0105 pending. Deliberately selected seven-entry targets retain pending-only compatibility. Unknown/mixed/non-prefix or noncanonical-feature ledgers remain refused. Old ten-entry receipts cannot authorize the new plan. All target, age, backup-attestation, advisory-lock, serializable transaction and existing-count checks remain active.

The new postcondition also checks that terminal-deletion markers start empty and the new attempt ledger exactly equals `MAX(attempt)` for every existing team's submission versions. It rejects missing/extra/wrong attempt rows in either direction before COMMIT. No existing submissions, participants, credits or historical ledger rows are changed by the upgrade.

`tests/terminal-deletion-populated-upgrade.test.ts` exercises populated9→11 and10→11 with canonical LF and whole-history legacy CRLF. Fixtures include an existing team lock, two committed versions, preserved project/evaluation/auth records, stock and an assigned credit. Each case compares all prior tables and ledger rows including timestamps, asserts exact pending SQL with no replay, checks the maximum-attempt backfill, then uses a fresh receipt for a no-work repeat. A real database trigger deliberately corrupts the new attempt backfill to prove rollback of tables, functions and ledger appends. Offline stale-plan and mixed/unknown/CRLF-feature refusal cases remain covered.

The affected legacy/populated/Windows suites are updated to the current eleven-entry source plan without rewriting historical proof logs/manifests.

| Local check | Result |
| --- | --- |
| New0105, existing0104, populated and whole-history legacy PostgreSQL suites | 32 passed,0 failed,0 skipped, sequential PGlite |
| Windows LF/source repair and refusal suite | 6 passed,0 failed |
| Owner PowerShell blocks | All3 parse with0 syntax errors in PowerShell7.6.8 on Linux |
| Owner receipt assertions with synthetic objects | 12 passed, including both current prefixes, explicit7 compatibility, stale/wrong sets and post-apply hash checks |
| Source checkout/plan and actual CRLF diagnostic | Eleven LF blobs pass; all11 CRLF source checksums change and the actual CLI refuses before any DB connection |
| TypeScript | `tsc --noEmit` passed |
| Historical preservation | All10 prior SQL blobs,7 LF entries,7 CRLF aliases and prior3 feature approvals unchanged |

The initial new tests had two fixture assumptions corrected: the function snapshot now excludes PostgreSQL aggregates, and the non-prefix test includes0105 after missing0104 rather than misclassifying a valid nine-entry prefix. A TypeScript annotation for a queried relation was corrected. Final affected suites pass; initial diagnostic logs remain in the local handoff. No application or migration SQL was changed to accommodate those fixture corrections.

The owner procedure is [NEON_POPULATED_UPGRADE_PLAN.md](NEON_POPULATED_UPGRADE_PLAN.md). These PowerShell checks execute only parsed or extracted assertion code with fake receipt objects. Actual Windows execution, restore verification and hosted state remain unverified.

No hosted database URL, secret, provider setting or production record was accessed. No migration/deletion was run against hosted data; no synthetic flag bypass or archive/pin change was introduced. Local PGlite is a single-connection PostgreSQL-compatible engine and does not establish native concurrency, ARM64 hosted execution, restore verification or deployment success.
