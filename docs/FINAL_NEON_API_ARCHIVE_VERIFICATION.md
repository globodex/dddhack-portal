# Final backend archive verification

The official Function archive was freshly built from exact integrated API source
`354aba6bdd36cafd8a83afd46cbf17ab160b24cc`. The isolated packaging branch changed
only archive artifacts, handoff digest pins and verification evidence.

`scripts/build-neon-archive.mjs` called the installed
`@neon/config-runtime@1.10.2` `buildFunctionBundle`. The Function environment was
`{}`. Its process received only PATH, LANG, TZ and explicitly offline npm settings
with empty temporary npm config files. Native staging reused the public package
cache; the build emitted zero warnings. No credential file, real provider key,
model, hosted database, provider setting, plan/apply/deploy operation, migration,
email or push was used.

| Check | Verified result |
| --- | --- |
| ZIP SHA256 | `63acbca1b5e671daffa49ab325f236536393d4ca07cd37f3fb0e35e8b11d2276` |
| ZIP / raw bytes / files | 9,019,301 / 21,166,387 / 93 |
| Official limits | 10,485,760 ZIP bytes / 67,108,864 raw bytes / 4,096 entries |
| ZIP index, fresh esbuild output and host-copy SHA256 | `b9d22c188df2b78c7595093240151409aaa416b627a4d5c1630c9563b4853741` |
| Fresh API graph | 865 inputs, including 81 application files; zero forbidden or frontend inputs |
| SEO boundary | `lib/seo.ts` is absent from the API graph |
| Native files | Sharp 0.35.5 and libvips 8.18.7, both Linux AArch64 ELF machine 183 |
| Prior-archive payload comparison | Only `index.mjs` changed; all 92 dependency/native entries are byte-identical |
| Trusted GET `/api/health` | 200 with expected runtime JSON, private/no-store |
| Untrusted GET `/api/health` | 403 with redacted `UNTRUSTED_PROXY` |
| Unconfigured GET `/api/portal?view=%2Fdashboard` | 503 with redacted error code only |
| Host-smoke outbound attempts | Zero |
| Windows-helper checks | Six passed under actual PowerShell 7.6.8 on Linux |
| Local migration sources | All ten names and approved checksums match; canonical digest `9bcf3f083d47a1b700e467c60f3b9eff57193491bb1e2929b1c2a4f21ba532d1` |

The fresh esbuild analysis imports the official packager's interoperability
banner and uses its exact bundling options. Its complete JavaScript output is
byte-identical to the extracted archive entry. Every graph input has a recorded
SHA256, with a separate application-input manifest. There are no test, fixture,
local-test, env, frontend or stylesheet inputs. Source descriptions such as the
numeric evaluation bridge, admin team corrections, direct admin credit values
and private selected-profile projection are covered by the separate domain/API
test gates; the archive smoke has no configured database and cannot prove those
flows by itself.

Relative to the previous archive from `86862c722233bbd6776f1e2672d78b41fa808a52`,
the entry grows from 1,649,360 to 1,665,510 raw bytes. Three application inputs
were added: `lib/admin-team-corrections.ts`, `lib/provider-grade.ts` and
`lib/public-team-members.ts`. Eight existing application inputs changed; the
comparison report records them. No application input was removed and no native
or dependency payload changed. This is a real JavaScript update, not a
timestamp-only rebuild. These byte counts make no application speed claim.

The extracted ARM64 tree remains unchanged. A separate copy of the exact new
JavaScript resolves installed x86_64 Sharp for the host smoke. Its child receives
only PATH, LANG, TZ, NODE_ENV and two synthetic origin/proxy settings. Fetch,
TCP, TLS and HTTP(S) are blocked before module import. No DB, Google, SMTP,
storage or AI credential is present. `readelf` confirms AArch64 headers in the
original binaries; actual ARM64 execution, hosted cold start, image decoding,
storage, SMTP delivery, real AI calls and full login remain unverified by this
packaging lane.

The PowerShell helper pins this ZIP hash, and its test pins the new JavaScript
hash. Six checks cover real copy/extraction/native-header inspection, repeated
fresh staging, wrong-digest rejection, an explicitly mocked HTTPS transport,
unsafe-URL rejection before transport, and an unchanged synthetic env sentinel
with zero Neon commands. PowerShell uses isolated temporary XDG directories on
this Linux executor. Native Windows 5.1/7 execution and live artifact download
remain unverified. Handoff preparation does not load or write an env file.

All historical SQL and ledger-proof receipts are preserved. The current plan has
ten entries; previously applied `0102_credit_stock.sql` and
`0103_project_media_limits.sql` retain their exact checksums. An existing
nine-entry target must apply only pending `0104_admin_team_corrections.sql`,
after the owner verifies a backup/restore checkpoint and creates a fresh inspect
receipt. The recognized whole-seven historical LF or proven CRLF histories
remain supported without rewriting the ledger. No hosted ledger, backup or
migration was inspected or executed here. Follow the
[populated upgrade handoff](NEON_POPULATED_UPGRADE_PLAN.md). The ZIP contains no
SQL files and performs no automatic migration.

A manual backend redeployment is required to use these archive bytes. This
archive has been built and verified locally; it has not been deployed.

[Receipt](../artifacts/neon/receipt.json),
[build metadata](../artifacts/neon/build-metadata.json),
[verification summary](../evidence/final-neon-api-archive/verification.json),
[build operations](../evidence/final-neon-api-archive/build-operations.json),
[fresh graph](../evidence/final-neon-api-archive/graph.json),
[all input hashes](../evidence/final-neon-api-archive/all-input-hashes.json),
[application input hashes](../evidence/final-neon-api-archive/runtime-input-hashes.json),
[archive comparison](../evidence/final-neon-api-archive/archive-refresh-comparison.json),
[native headers](../evidence/final-neon-api-archive/native-readelf.json),
[local SQL checksums](../evidence/final-neon-api-archive/local-sql-hash-review.json),
[host smoke](../evidence/final-neon-api-archive/host-smoke.json) and
[PowerShell checks](../evidence/final-neon-api-archive/windows-handoff-report.json)
record the current facts. Older evidence under `evidence/neon-host-archive/`
remains historical and unchanged. The smoke report's `noRebuild` describes only
that read-only smoke step; the fresh build is recorded separately.
