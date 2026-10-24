# Viewer-registration backend archive verification

The official archive was freshly built from exact integrated source `86862c722233bbd6776f1e2672d78b41fa808a52`. The packaging branch started at accepted baseline `d97d614ac7be2a657df91de42aaf00e9f3cfc336` and aligned to the source supplied by the integration owner before building. It does not package uncommitted backend or frontend work.

The build called `@neon/config-runtime@1.10.2` buildFunctionBundle only, with function `env: {}` and a process allowlist of PATH, LANG, TZ and offline npm settings. It reused the public npm cache, disabled install scripts through the official native staging path, and emitted zero warnings. No credential/environment file, provider API, plan/apply/deploy, migration command, hosted SQL operation or push was used.

| Check | Observed result |
| --- | --- |
| Current ZIP SHA256 | `bbd047173fb4e895bd8148d24674548f05dfaea58e184ca57bcc0e183ca60382` |
| Previous ZIP SHA256 | `1afca1c65f0c3b58bde89a5e1b80d3dec92c87b392239da0315ed762ebd0730f` |
| Archive | 9,014,656 compressed bytes; 21,150,237 raw bytes; 93 files |
| Official limits | 10,485,760 compressed bytes; 67,108,864 raw bytes; 4,096 entries |
| Payload comparison | Only index.mjs changed; all 92 dependency/native entries are byte-identical |
| Fresh graph | 862 total inputs; 78 application inputs; zero frontend/forbidden inputs |
| ZIP, fresh analysis and host-copy JS SHA256 | `77b26aed98d0c7c8486c12ee2246ce61dadc98163d2fc5d24989f6fd579669fe` |
| ARM files | Sharp 0.35.5 and libvips 8.18.7; two ELF machine 183 files, unchanged hashes |
| Trusted GET /api/health | 200, expected runtime JSON, private/no-store |
| Untrusted GET /api/health | 403, redacted UNTRUSTED_PROXY |
| Unconfigured GET /api/portal?view=%2Fdashboard | 503, redacted BACKEND_UNAVAILABLE |
| Outbound attempts | Zero |
| Windows handoff checks | Six passed using PowerShell 7.6.8 on Linux |

Fresh esbuild 0.28.2 analysis uses the exact official options and CommonJS interoperability banner; its output hash matches the newly extracted ZIP entry. Seven API inputs changed relative to d97: `lib/admin-presentation.ts`, `lib/credit-stock.ts`, `lib/discover-participants.ts`, `lib/experience.ts`, `lib/participant-export.ts`, `lib/roster.ts` and `lib/service.ts`. The other 71 application inputs are unchanged. The frontend's `lib/portal-load-state.ts` change is outside this API graph. No new application input or dependency was added.

The source's eight normalized private routes are `/dashboard`, `/dashboard/team`, `/dashboard/credits`, `/profile`, `/dashboard/profile`, `/submission`, `/dashboard/submission` and `/personal/credits`. Authenticated Viewers receive `{me, registrationRequired:true}`; removed people retain 403. Owner/admin participant projections distinguish unregistered Viewers; volunteer and public discovery payloads continue to exclude them. Approval, check-in, credit entitlement and write authorization remain distinct server gates. These are source-contract descriptions; the separate domain/HTTP/browser tests validate behavior. The archive smoke has no configured database and does not substitute for them.

The JavaScript entry changes from 1,648,172 to 1,649,360 raw bytes. Every other archive entry is byte-identical, including ARM Sharp and libvips. This is a real API payload change, not a timestamp-only rebuild. No frontend or backend speed claim follows from these byte counts.

Fresh extraction `/tmp/ddd-viewer-neon-extracted-l_ly13dm` and host-copy `/tmp/ddd-viewer-neon-host-18j0rhya` were used. The host copy preserves the exact new JavaScript and resolves existing x86_64 Sharp; original ARM files remain unchanged. Static readelf headers show AArch64. The smoke child supplies only PATH, LANG, TZ, NODE_ENV and two synthetic frontend/proxy settings. Fetch, TCP, TLS and HTTP(S) are blocked before import. No database, Google, SMTP, storage or AI credential is supplied. Sharp adds only its non-secret VIPSHOME library path. This verifies host JavaScript loading/routing with explicit native substitution; actual ARM64 execution and hosted cold start, decoding, storage, SMTP and full login remain unverified.

The preparation helper and its JavaScript expectation pin the new archive. Six actual PowerShell checks cover copying/extracting the reviewed ZIP and native headers, repeated fresh staging, wrong-digest rejection, explicitly mocked HTTPS retrieval, unsafe-URL rejection, and an unchanged synthetic environment-file sentinel with zero Neon commands. Actual Windows 5.1/7 execution and real HTTPS artifact retrieval remain unverified. The deploy command continues to omit `--env`, preserving the inherited Function environment and leaving `.env.backend.local` untouched.

Direct local SQL-file review confirms all nine plan names/checksums are unchanged, including the existing auth-file aliases `0100_auth.sql` and `0101_approved_evaluation.sql`. Viewer changes add no migration. Existing pending `0102_credit_stock.sql` and `0103_project_media_limits.sql` still require the owner's populated-target backup/inspection/upgrade process before publication. No hosted ledger or backup was inspected, and no migration or provider plan was run. Follow the [populated-upgrade handoff](NEON_POPULATED_UPGRADE_PLAN.md); the archive includes no SQL files or automatic migration action.

[Receipt](../artifacts/neon/receipt.json), [build metadata](../artifacts/neon/build-metadata.json), [operations](../evidence/neon-host-archive/build-operations.json), [comparison](../evidence/neon-host-archive/archive-refresh-comparison.json), [entry-byte proof](../evidence/neon-host-archive/zip-byte-equivalence.json), [input hashes](../evidence/neon-host-archive/runtime-input-hashes.json), [source mapping](../evidence/neon-host-archive/source-equivalence.json), [native headers](../evidence/neon-host-archive/native-readelf.json), [SQL checksums](../evidence/neon-host-archive/local-sql-hash-review.json), [host smoke](../evidence/neon-host-archive/report.json) and [PowerShell checks](../evidence/neon-host-archive/windows-handoff-report.json) preserve the measured facts and limits. The verifier's noRebuild field describes its read-only smoke phase; the separate fresh build is recorded in build-operations.json and build.log.
