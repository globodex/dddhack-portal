# Accepted-source backend archive

Freshly built from accepted integrated source `511c191366f0300060c0a0ca30e0b9e3d6e8d028` after the shared default-content module extraction. The official `@neon/config-runtime@1.10.2` buildFunctionBundle uses function `env: {}` and the existing public npm cache in offline mode. No warnings, provider call, hosted SQL operation or deployment occurred.

| Check | Result |
| --- | --- |
| Runtime target | Node.js 24, Linux ARM64 glibc |
| Archive | 93 files; 9,014,229 compressed bytes; 21,149,049 raw bytes |
| ZIP SHA256 | `1afca1c65f0c3b58bde89a5e1b80d3dec92c87b392239da0315ed762ebd0730f` |
| JavaScript SHA256 | `a1494ba872ce9acae696026e1db8364aede1b10b00227d54f08d6b46929dcba1` |
| Fresh graph | 862 inputs; 78 application inputs; zero frontend/forbidden inputs |
| Native files | Two ARM64 ELF files, machine 183, unchanged hashes |
| Isolated host smoke | Trusted health 200, untrusted 403, unconfigured 503; zero outbound attempts |

Compared with previous ZIP `bc017c088b6791d091db6571104d84a2dcfb6ca8ea1d7a0f80fa36b38aef7ae3`, only index.mjs payload bytes changed. The other 92 entries, including both native binaries and dependency files, are byte-identical. The new JavaScript entry is four raw bytes larger. This refresh is not a timestamp-only change; its receipt and the Windows preparation pin must identify the new ZIP exactly.

The graph gains lib/public-content-defaults.ts, while lib/event-content-contract.ts retains its byte-identical server validator prefix and re-exports the byte-identical defaults literal from that pure module. The other 76 application graph inputs are unchanged from source 5924686. Server validation remains in the backend graph. No dependency or runtime setting changed. This archive audit does not claim a backend speed improvement.

No env file, credential, test fixture or database is packaged. Fresh extraction, CRC, graph/index comparison and native-header checks passed. The host smoke uses unchanged JavaScript with an explicitly substituted installed x86_64 Sharp dependency; the ARM archive and extraction remain unchanged. **Actual execution of the unmodified ARM64 archive remains unverified.** Hosted storage, SMTP, full login and cold start are not established here.

SQL source files remain separate: seven unchanged historical entries and pending 0102_credit_stock.sql plus 0103_project_media_limits.sql. File-only checksums match the existing ledger expectations. No migration CLI, provider plan, hosted ledger inspection, SQL operation or backup was performed. The [populated-upgrade handoff](../../docs/NEON_POPULATED_UPGRADE_PLAN.md) and matching Windows preparation pin remain separately owned by the integration operator. Publication remains manual.

[Receipt](receipt.json), [build metadata](build-metadata.json), [verification](../../docs/NEON_HOST_ARCHIVE_VERIFICATION.md), [entry comparison](../../evidence/neon-host-archive/archive-refresh-comparison.json), [source analysis](../../evidence/neon-host-archive/source-equivalence.json) and [host smoke](../../evidence/neon-host-archive/report.json) preserve the actual results.
