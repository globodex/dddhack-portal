# Independent historical Windows ledger review

Source reviewed: `626e6bcc349413d5d209e6adc86a177f123debab`, based on `bcb271a59e123ad83359bed26c2c3a218f6eb96d`. No source defect found. All six independent cases pass across the original run and the corrected focused rerun.

The seven historical CRLF hashes are independently derived from the pinned LF SQL bytes in `evidence/legacy-ledger-independent/derived-historical-hashes.json`. The canonical nine-entry source digest remains `498280b69647485b4f55c35331a0f8af486983d819ee2dc25fb1840f1e657506`. The generic migrator, nine SQL sources, and approved baseline metadata are unchanged.

The populated test fixture is created by actually applying all seven CRLF migrations through the unchanged production migrator and PGlite adapter. It contains profiles, registrations, teams, memberships, ideas, a project and submission, approved evaluation, auth records, 20 stock rows, one existing allocation, and a ready media row. Before the fix, inspection rejects this valid historical encoding; that failure is retained in `before-compatibility.log`.

Independent cases verify:

- Read-only inspection recognizes the whole seven-entry legacy encoding without changing any row.
- Upgrade executes only canonical LF 0102/0103 SQL. It preserves all seven historical hashes and timestamps, every existing record, and the existing allocation; no historical SQL replays or ledger checksum rewrites occur. A fresh inspection and repeat return `applied: []`.
- The existing canonical LF path and a canonical receipt lacking the new optional mode field continue to work.
- Mixed historical encodings, arbitrary hashes, missing/unknown entries, CRLF feature hashes, and out-of-order features refuse through both inspection and apply before DDL, with all fixture rows unchanged.
- A whole-seven encoding change after inspection is rejected under the advisory lock before DDL, despite either whole encoding being recognized independently.
- A legacy category collision rolls back the new schema and retains the populated records and seven original ledger rows.

The first full independent run passed five cases; its malformed-ledger fixture supplied a JavaScript Date to the adapter, which deliberately accepts scalar SQL parameters. That harness error is preserved in `first-harness-run.log`. The fixture now reads the timestamp as exact PostgreSQL text. The focused corrected case passes and also tests apply-time refusal for every malformed variant. `independent-report.json` records this sequence; there is no claim of a fresh six-case single-process rerun.

The compatibility helper is narrow: it accepts one complete seven-entry historical encoding, pins every legacy hash, keeps features canonical, and supplies matching historical SQL/checksum pairs only so the strict generic runner can skip already-applied entries. Canonical source, actual target, receipt, age, lock, pending order and pre/post-count checks remain active.

No hosted database, provider, backup, production record, or ledger was accessed or changed by this audit. Deliberately malformed ledger rows exist only in disposable negative-test fixtures. PGlite verifies real PostgreSQL SQL/transaction semantics through the production adapter but does not establish native multi-connection MVCC behavior or verify an operator's backup. The parent owns any approved publication and manual rollout.
