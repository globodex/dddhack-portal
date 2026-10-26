# Final backend archive verification

Verified locally; publication and deployment await fresh user approval.

The official Function archive was freshly built from integrated analytics and
completed-member-information source `72ec164d3056469c239a011984e83ff88f2aacaf`. The batch adds no SQL migration.
The strict schema plan remains the prior twelve entries through0106, digest
`73c64b0acbe9df80f9ca6627c0a1d4a3485c83214a6923918c530c1ab2b5d160`. A read-only inspection must establish whether that prior prerequisite
is already complete before backend deployment.

| Check | Result |
| --- | --- |
| ZIP SHA256 | `cef0cb28499525c48fbf4825d4a50c988b19337c5b0ff240ed3d0c5719bac6cb` |
| ZIP / uncompressed bytes / files | 9,035,605 / 21,222,159 / 93 |
| Official limits | 10,485,760 ZIP bytes / 67,108,864 raw bytes / 4,096 entries |
| JavaScript entry SHA256 | `1f4d9a41c6658bb61dff9f381535df0f069a1fb6efd72ff5e06c99dc6203c98b` |
| Fresh graph | 875 inputs, 91 application files; all hashes recorded/rechecked |
| Fresh output | Exact official-options esbuild bytes equal the extracted ZIP entry |
| Exclusions | No env, fixtures/tests, frontend, stylesheet, image or SQL archive inputs |
| Previous published ZIP | `9f16cda2e48f635251905cfb41669e35a41cf09c986e0507688a272bbd5ad626` |
| Archive comparison | Only index.mjs changed; all92 dependency/native entries identical |
| Native files | Sharp0.35.5/libvips8.18.7 Linux AArch64 ELF machine183, headers checked |
| Blocked host smoke | Trusted health200, untrusted health403, unconfigured portal503; zero outbound attempts |
| Legacy helper compatibility | Six checks under PowerShell7.6.8 on Linux; not native Windows acceptance |
| Windows guide | Complete initialized block; Node checksum/layout positive and negative checks passed; PowerShell parsing passed |

The installed `@neon/config-runtime@1.10.2` `buildFunctionBundle` used Function env
`{}`. The build process received only PATH/LANG/TZ and explicit offline npm options
with empty user/global config files. Public tooling was restored separately from
the official npm registry and PowerShell release. No application credential, private
env file, provider setting or inherited proxy/trust setting entered the archive
build. Warnings were empty. A clean exact Git export and source-file hashes exclude
uncommitted work. Every application graph hash matches its committed source blob.

Host smoke uses a separate byte-identical JavaScript copy with installed x86_64
Sharp. The original ARM64 archive/tree stays unchanged. Fetch, TCP, TLS and HTTP(S)
are blocked before import; the child receives only PATH/LANG/TZ/NODE_ENV and two
synthetic proxy/origin settings. It has no DB/storage/SMTP/Google/AI credential.
AArch64 headers are static evidence. ARM64 execution, native Windows execution,
hosted cold start, image decoding, mail/storage/AI calls and authenticated production
behavior were not verified by this packaging lane. Domain/browser/full-regression
tests are separate release gates; a database-free routing smoke cannot prove them.

The owner's [complete Windows rollout](ANALYTICS_MEMBER_INFO_WINDOWS_ROLLOUT.md)
uses the literal existing checkout, read-only inspection first, Node built-in crypto,
Explorer extraction into a fresh literal hash-named folder and the literal
`neon functions deploy portalapi --src ... --no-bundle --runtime nodejs24` command.
It requires no checksum cmdlet, preparation helper or variable from an earlier chat.
It preserves `.env.backend.local`, `.neon`, `neon.windows.ts`, APP_ORIGIN,
NEON_API_ORIGIN, proxy secrets and existing deployed Function values.

Twelve ledger entries with pending[] skips migration apply. Only an inspected
11-entry target with solely prior0106 pending enters the existing backup-confirmed
recovery path: independently verify a real current restore checkpoint, inspect again,
then use the actual guarded CLI and post-inspect for12/no pending. The CLI cannot
create or verify a backup; its flag is the owner's attestation. Other older prefixes
stop for the [existing upgrade guide](NEON_POPULATED_UPGRADE_PLAN.md). All canonical
SQL hashes and seven exact historical CRLF aliases are unchanged. The ZIP contains
no SQL and never migrates automatically.

No hosted database/provider operation, migration, deployment, source upload, email,
commit or push was performed by this packaging lane.

[Receipt](../artifacts/neon/receipt.json), [build metadata](../artifacts/neon/build-metadata.json),
[verification](../evidence/analytics-member-info-api-release/verification.json), [build operations](../evidence/analytics-member-info-api-release/build-operations.json),
[graph](../evidence/analytics-member-info-api-release/graph.json), [all hashes](../evidence/analytics-member-info-api-release/all-input-hashes.json),
[application hashes](../evidence/analytics-member-info-api-release/runtime-input-hashes.json), [Git export](../evidence/analytics-member-info-api-release/exported-source-hashes.json),
[comparison](../evidence/analytics-member-info-api-release/archive-refresh-comparison.json), [native headers](../evidence/analytics-member-info-api-release/native-readelf.json),
[SQL hashes](../evidence/analytics-member-info-api-release/local-sql-hash-review.json), [host smoke](../evidence/analytics-member-info-api-release/host-smoke.json),
[legacy checks](../evidence/analytics-member-info-api-release/windows-handoff-report.json), [guide Node checks](../evidence/analytics-member-info-api-release/windows-guide-node-checks.json)
and [guide parsing](../evidence/analytics-member-info-api-release/windows-guide-parse.json) contain the bounded proof.
Earlier archive evidence remains historical. The smoke report's noRebuild refers
only to that read-only smoke step; the fresh build is recorded separately.
