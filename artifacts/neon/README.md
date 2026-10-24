# Reviewed Viewer-registration backend archive

Freshly built from integrated source `86862c722233bbd6776f1e2672d78b41fa808a52`. The official `@neon/config-runtime@1.10.2` buildFunctionBundle used function `env: {}` and the existing public npm cache in offline mode. No warning, provider call, hosted SQL operation, push or deployment occurred.

| Check | Result |
| --- | --- |
| Runtime | Node.js 24, Linux ARM64 glibc |
| Archive | 93 files; 9,014,656 compressed bytes; 21,150,237 raw bytes |
| ZIP SHA256 | `bbd047173fb4e895bd8148d24674548f05dfaea58e184ca57bcc0e183ca60382` |
| JavaScript SHA256 | `77b26aed98d0c7c8486c12ee2246ce61dadc98163d2fc5d24989f6fd579669fe` |
| Fresh API graph | 862 inputs; 78 application inputs; no frontend/forbidden inputs |
| Native files | Two unchanged ARM64 ELF binaries, machine 183 |
| Host JavaScript smoke | Trusted health 200, untrusted 403, unconfigured portal 503; zero outbound attempts |

This source adds an authenticated Viewer registration-required response on eight private routes, owner/admin-only Viewer rows and registration metadata, and preserves the separate approval/check-in/write gates. It adds no schema migration. Archive checks bind those source files to the ZIP; separate domain/HTTP/browser checks remain the integration owner's gate.

Compared with previous ZIP `1afca1c65f0c3b58bde89a5e1b80d3dec92c87b392239da0315ed762ebd0730f`, only `index.mjs` changed. The other 92 entries, including both native binaries, are byte-identical. The JavaScript entry is 1,188 raw bytes larger. No speed improvement follows from these counts.

The outgoing-blocked host smoke uses unchanged JavaScript with an explicitly substituted existing x86_64 Sharp dependency. It does not execute the original ARM64 ZIP. Actual ARM64 execution, hosted storage/SMTP and full login remain unverified. The ZIP contains no environment files, fixture database or tests. The Windows preparation helper pins this exact ZIP; its [six-check report](../../evidence/neon-host-archive/windows-handoff-report.json) is current.

The existing nine migration-plan names/checksums are unchanged: seven historical entries plus pending `0102_credit_stock.sql` and `0103_project_media_limits.sql`. Viewer handling adds none; that does not remove the prior release's populated-database prerequisite. Follow the owner-operated [pending-only upgrade handoff](../../docs/NEON_POPULATED_UPGRADE_PLAN.md) before manual backend/frontend publication. No migration CLI or hosted ledger was accessed here. Never run synthetic seeds or resets on the populated target.

[Verification and limits](../../docs/NEON_HOST_ARCHIVE_VERIFICATION.md), [receipt](receipt.json), [build metadata](build-metadata.json), [graph](../../evidence/neon-host-archive/graph.json), [comparison](../../evidence/neon-host-archive/archive-refresh-comparison.json), [source mapping](../../evidence/neon-host-archive/source-equivalence.json), [SQL-file proof](../../evidence/neon-host-archive/local-sql-hash-review.json) and [host smoke](../../evidence/neon-host-archive/report.json) preserve provenance.
