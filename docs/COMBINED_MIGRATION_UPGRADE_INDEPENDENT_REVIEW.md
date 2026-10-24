# Combined migration order review

The independent local audit passes all six cases against source `191b76ed26f430128b14112f77b74ad3e26b1ec0`. Typecheck passes. The audit adds only tests and evidence; it does not edit production source or access a hosted database.

The pre-fix source `cf8de0b5c5adb008fb0ea911d94a8af4a6e8f029` reproduces `MIGRATION_OUT_OF_ORDER: 0005_credit_stock.sql` when the existing ledger already contains `0000` through `0004`, `0100_auth.sql`, and `0101_approved_evaluation.sql`. The failed attempt leaves all seven ledger entries and persisted rows unchanged. A separate expected-order assertion fails on the old loader, with its actual filenames retained in the evidence.

The corrected production loader returns `0000` through `0004`, then `0100`, `0101`, `0102_credit_stock.sql`, and `0103_project_media_limits.sql`. Every historical SQL checksum and both renamed SQL checksums match values independently pinned before the fix. The strict production migrator remains unchanged.

| Local case | Observed result |
| --- | --- |
| Existing seven-entry combined ledger | Exactly `0102` and `0103` append; final ledger has nine entries. Existing ledger checksums and timestamps remain equal. |
| Populated existing schema | Users, registrations, private profiles, teams, memberships, ideas, a project, committed submission, approved evaluation, 20 inventory rows, one allocation, ready media receipt, and synthetic auth session remain equal before and after the upgrade. |
| Migration repeat | Returns `[]`; ledger and stored rows remain unchanged. |
| Fresh isolated schema | The same production loader applies all nine migrations in order and repeats with `[]`. This is a local test, not guidance to initialize an existing hosted database. |
| Legacy normalized-header collision | PostgreSQL `23505`; both new migrations roll back. Existing ledger/data remain equal, stock tables remain absent, and old media bounds remain enforced. |
| Legacy global-fingerprint collision | Same atomic rollback and preservation outcome. No automatic merging or deletion occurs. |

Tests instantiate local PGlite with the production PostgreSQL adapter, `loadMigrationPlan`, and `applyPortalMigrations`. The SQL, checksum verification, transaction, and ledger guards are real; the migrator is not mocked. The fixture contains synthetic persisted data only. It does not contain or copy any real participant record, code, session, or credential.

PGlite uses one local connection. These results do not establish native PostgreSQL concurrent-connection behavior or prove that a populated hosted database has no legacy collisions. No hosted database was inspected or changed, and no deployment, hosted migration, production allocation, reset, or seed operation was performed.

Evidence: `evidence/combined-migration-upgrade/report.json`, `before-rejection.txt`, `before-order-failure.txt`, and `after-populated.txt`. The reusable independent test is `tests/combined-migration-upgrade-independent.test.ts`.
