# Independent migration checkout review

Reviewed source fix `dd8fc17f85217db962c1f85d927dde87e17a3fcd`, based on published `0aa85b55840dc26b2e9306e48fd592e83eae054c`. No blocker found. All six independent cases pass in 5.87 seconds; the prior missing-attributes regression failure is retained.

The actual nine-file LF loader and validator produce digest `498280b69647485b4f55c35331a0f8af486983d819ee2dc25fb1840f1e657506`. Converting only a disposable source copy to CRLF changes all nine raw hashes and makes the actual offline `upgrade-populated.ts --plan` command refuse with `UPGRADE_SOURCE_PLAN_MISMATCH`. This preserves the strict checker, historical Git blobs, and approved checksums.

Tests use real disposable Git repositories. `--check` returns 2 without rewriting CRLF files; `--repair-line-endings` restores exact HEAD bytes, keeps HEAD/index/approval/unrelated files unchanged, recovers the strict plan, and is idempotent. Literal edits, BOM, changed HEAD, staged edits, changed approval checksums, extra SQL and missing SQL all refuse before any earlier CRLF file is rewritten. A real `core.autocrlf=true` checkout keeps the nine migrations LF while an unrelated SQL control follows CRLF.

No database environment, connection, ledger edit, hosted migration, deploy, credential change, or push occurred. These tests ran on Linux using actual Git line-ending conversion and filesystem bytes; native PowerShell/Windows execution was not performed here. The parent separately reports the user's nine tracked paths as `i/lf w/crlf`.

Raw reproduction and test logs are in `evidence/windows-migration-lines/initial-reproduction.json`, `before-attributes-red.log`, and `independent-tests.log`. `scripts/diagnose-windows-migration-lines.mts` prints byte/hash diagnostics and reproduces the failure in disposable scratch files without changing checked-out SQL. Production validator, migrator, SQL and backend runtime remain untouched by this audit.
