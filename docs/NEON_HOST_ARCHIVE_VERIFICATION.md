# Accepted-source backend archive verification

The official local archive was freshly rebuilt from accepted integrated source `511c191366f0300060c0a0ca30e0b9e3d6e8d028`, after moving the exact defaultPublicContent literal into a pure data module. The build used `@neon/config-runtime@1.10.2` buildFunctionBundle only, empty function env, a whitelisted build environment and the existing public npm cache in offline mode. Install scripts are disabled by the official native staging path. No warnings, provider operation, hosted SQL, plan/apply/deploy, push or credential-setting change occurred.

| Check | Observed result |
| --- | --- |
| Refreshed ZIP SHA256 | `1afca1c65f0c3b58bde89a5e1b80d3dec92c87b392239da0315ed762ebd0730f` |
| Previous ZIP SHA256 | `bc017c088b6791d091db6571104d84a2dcfb6ca8ea1d7a0f80fa36b38aef7ae3` |
| Archive | 9,014,229 compressed bytes; 21,149,049 raw bytes; 93 files |
| Official limits | 10,485,760 compressed bytes; 67,108,864 raw bytes; 4,096 entries |
| Payload comparison | Only index.mjs changed; the other 92 files are byte-identical |
| Fresh graph | 862 total inputs; 78 application inputs; zero frontend/forbidden inputs |
| Actual archive/analysis/host-copy JS hash | `a1494ba872ce9acae696026e1db8364aede1b10b00227d54f08d6b46929dcba1` |
| ARM native files | Sharp 0.35.5 and libvips 8.18.7; two ELF machine 183 binaries with unchanged hashes |
| Trusted GET /api/health | 200, expected runtime JSON, private/no-store |
| Untrusted GET /api/health | 403, redacted UNTRUSTED_PROXY |
| Unconfigured GET /api/portal?view=%2Fdashboard | 503, redacted BACKEND_UNAVAILABLE |
| Outbound attempts | Zero |

Fresh esbuild 0.28.2 analysis uses the exact official options and CommonJS interoperability banner and matches the ZIP's JavaScript bytes. The new API graph input is lib/public-content-defaults.ts. Its literal exactly matches the previous fallback-content literal. lib/event-content-contract.ts preserves the exact validator prefix and re-exports that object for server callers. Source/input hashes show 76 unchanged application inputs, one changed contract file and one added pure data module. Backend Zod validation remains present; the accepted frontend dependency-boundary change does not remove server validation.

The JavaScript entry changes from 1,648,168 to 1,648,172 raw bytes. Every other archive entry is byte-identical to the previous bc017 archive, including both ARM-native binaries. This differs from the earlier 6d71-to-bc017 rebuild, which changed timestamps only. The current archive genuinely has a different JavaScript entry, so current receipt and preparation hash must not retain the previous pin. The read-only comparison tool requires an explicit allowed entry change for index.mjs and rejects any other payload change. No backend performance improvement follows from these byte counts.

Fresh extraction `/tmp/ddd-neon-payload-extracted-lz79ijvf` and host-copy `/tmp/ddd-neon-payload-host-o7ww85o3` were used. The host copy contains unchanged index.mjs and a link to existing x86_64 dependencies. Host Node 24 loads Sharp ELF machine 62. ZIP, original/host JS and ARM-native hashes remain unchanged through smoke. Fresh readelf output confirms AArch64 headers, the packaged libvips dependency and RPATH; it does not execute ARM instructions.

The smoke child starts with only PATH, LANG, TZ, NODE_ENV and two synthetic frontend/proxy settings. Fetch, TCP, TLS and HTTP(S) calls are blocked before import. No database, Google, SMTP, storage or AI credential is supplied. Sharp adds only its non-secret native-library path VIPSHOME. **This is host JavaScript loading/routing with explicit x86_64 native substitution, not execution of the unmodified ARM64 ZIP.** Actual ARM cold start/decoding, hosted storage, SMTP and full login remain unverified. The verifier's noRebuild field describes that smoke phase; the separate official fresh build is recorded in build-operations.json and build.log.

Local SQL-file review confirms the same nine names and checksums: seven historical entries plus pending 0102_credit_stock.sql and 0103_project_media_limits.sql. No migration CLI, provider plan, hosted ledger, backup or database operation was run. That review does not validate a live target or replace the operator-owned [populated-upgrade handoff](NEON_POPULATED_UPGRADE_PLAN.md). The integration owner separately owns the Windows helper pin and its six-check rerun for the new ZIP.

[Receipt](../artifacts/neon/receipt.json), [build metadata](../artifacts/neon/build-metadata.json), [comparison](../evidence/neon-host-archive/archive-refresh-comparison.json), [read-only byte proof](../evidence/neon-host-archive/zip-byte-equivalence.json), [input hashes](../evidence/neon-host-archive/runtime-input-hashes.json), [source analysis](../evidence/neon-host-archive/source-equivalence.json), [native headers](../evidence/neon-host-archive/native-readelf.json), [local SQL hashes](../evidence/neon-host-archive/local-sql-hash-review.json) and [host smoke](../evidence/neon-host-archive/report.json) preserve provenance and limits.
