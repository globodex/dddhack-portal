# Final backend archive verification

The official Function archive was freshly built from exact integrated source
`6da7b10372892cd6d126b7d092cabeeffe9f5e50`. It includes the current basic statistics, Registered-only team approval
and status behavior, and earlier integrated fixes. A manual backend deployment is
required to use these archive bytes; this packaging verification performed none.

The installed `@neon/config-runtime@1.10.2` `buildFunctionBundle` used Function
environment `{}`. The isolated process received only PATH, LANG, TZ and explicit
offline npm settings with empty temporary user/global configs. No proxy, trust,
credential or private application settings entered the build. Public tools had
been acquired separately from the official npm registry and PowerShell release.
The clean Git export excludes all uncommitted work. Every selected source file
was checked against its exact Git blob. The official build emitted zero warnings.

| Check | Verified result |
| --- | --- |
| ZIP SHA256 | `9f16cda2e48f635251905cfb41669e35a41cf09c986e0507688a272bbd5ad626` |
| ZIP / raw bytes / files | 9,029,918 / 21,202,946 / 93 |
| Official limits | 10,485,760 ZIP bytes / 67,108,864 raw bytes / 4,096 entries |
| ZIP index, fresh esbuild output and host copy SHA256 | `afba40494c79ad01de8518c60da0d278a7e6906b047a620b3900d4c600c55057` |
| Fresh API graph | 873 inputs, including 89 application files; zero prohibited inputs |
| Boundary checks | No env, test, fixture, frontend, stylesheet, image or SQL archive inputs; no `lib/seo.ts` edge |
| Native files | Sharp0.35.5 and libvips8.18.7, Linux AArch64 ELF machine183 |
| Comparison with prior published archive | Only `index.mjs` changed; all92 dependency/native entries are byte-identical |
| Trusted GET `/api/health` | 200, expected runtime JSON, private/no-store |
| Untrusted GET `/api/health` | 403, redacted `UNTRUSTED_PROXY` |
| Unconfigured GET `/api/portal?view=%2Fdashboard` | 503, redacted error code only |
| Host-smoke outbound attempts | Zero |
| Windows-helper checks | Six passed under actual PowerShell7.6.8 on Linux |
| Local source plan | Twelve approved entries, digest `73c64b0acbe9df80f9ca6627c0a1d4a3485c83214a6923918c530c1ab2b5d160` |

Fresh esbuild analysis uses the exact official options and imported interoperability
banner. Its complete JavaScript bytes equal the ZIP entry. Every graph input has a
recorded SHA256; all application inputs match the exact committed source export.
The current graph includes `lib/admin-team-approval.ts`, `lib/sign-in-evidence.ts`
and `lib/team-lifecycle.ts`. Application/domain tests remain separate gates: an
unconfigured packaging smoke does not demonstrate authenticated approval, status,
statistics or database behavior.

The prior published ZIP is
`ea9b0a2f9f99de33626cdffd7dafbe096eee6f3812ffe7d56cfc5793856d1dcb`,
built from `340bf33175ce8b5c1b1901da75a6a251ee553c69`. The current archive contains
new JavaScript, with the same92 dependency files. The separate comparison and
source manifests identify the exact changed and added application inputs.

The original ARM64 archive and extracted tree remain unchanged during host smoke.
A separate copy of the exact JavaScript resolves installed **x86_64 Sharp**. Its
child receives only PATH, LANG, TZ, NODE_ENV and two synthetic proxy/origin settings.
Fetch, TCP, TLS and HTTP(S) are blocked before import. No DB, Google, SMTP, storage
or AI credential is supplied. `readelf` confirms AArch64 headers; actual ARM64
execution, image decoding, hosted cold start, storage, SMTP delivery, real AI calls
and full login remain unverified by this packaging lane.

The helper pins this ZIP hash and its test pins the JavaScript hash. Six checks
cover real copying/extraction/native-header inspection, fresh staging on repeats,
wrong-digest rejection, explicitly mocked HTTPS transport, unsafe URL rejection
before transport, and an unchanged synthetic env sentinel with zero Neon commands.
PowerShell uses isolated temporary XDG directories on Linux. Native Windows5.1/7
execution and live artifact download remain unverified. The helper never loads or
writes an environment file and its command semantics are unchanged.

The strict source plan remains twelve entries through
`0106_admin_team_unlock.sql`; no new SQL schema is added by this release. Existing
canonical hashes and all seven exact historical CRLF aliases remain unchanged.
Before backend deployment, the owner must verify a current backup/restore
checkpoint, inspect the exact intended populated target, apply only its actual
pending set, and inspect again. Nine entries require0104+0105+0106; ten require
0105+0106; eleven require0106; twelve require no apply. Require twelve entries and
no pending work before rollout. Never reset data, rewrite the ledger or bypass the
restore prerequisite. Follow the [populated upgrade guide](NEON_POPULATED_UPGRADE_PLAN.md).
The ZIP contains no SQL and performs no automatic migration.

After the owner completes those prerequisites, use the
[Windows handoff](DESIGN_RELEASE_WINDOWS_DEPLOY.md) with the existing linked target
and environment. No hosted database/provider operation, source upload, migration,
email, deployment or push was performed by this packaging lane.

[Receipt](../artifacts/neon/receipt.json),
[build metadata](../artifacts/neon/build-metadata.json),
[verification](../evidence/registered-status-api-release/verification.json),
[build operations](../evidence/registered-status-api-release/build-operations.json),
[fresh graph](../evidence/registered-status-api-release/graph.json),
[all input hashes](../evidence/registered-status-api-release/all-input-hashes.json),
[application hashes](../evidence/registered-status-api-release/runtime-input-hashes.json),
[Git export hashes](../evidence/registered-status-api-release/exported-source-hashes.json),
[archive comparison](../evidence/registered-status-api-release/archive-refresh-comparison.json),
[native headers](../evidence/registered-status-api-release/native-readelf.json),
[SQL source hashes](../evidence/registered-status-api-release/local-sql-hash-review.json),
[host smoke](../evidence/registered-status-api-release/host-smoke.json) and
[PowerShell checks](../evidence/registered-status-api-release/windows-handoff-report.json) record the current proof.
Older archive evidence remains historical and unchanged. The host report's
`noRebuild` describes that read-only smoke step; the official fresh build is recorded
separately.
