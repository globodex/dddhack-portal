# Final backend archive verification

The official Function archive was freshly built from exact integrated API and
upgrade source `340bf33175ce8b5c1b1901da75a6a251ee553c69`. This isolated detached worktree changes only archive
artifacts, handoff digest pins, this handoff documentation and new verification
evidence. A manual backend redeployment is required to use these bytes.

`scripts/build-neon-archive.mjs` called installed
`@neon/config-runtime@1.10.2` `buildFunctionBundle` with Function environment `{}`.
The process received only PATH, LANG, TZ and explicitly offline npm settings with
empty temporary npm config files. Native staging reused the public package
cache; the build emitted zero warnings. No real credential, hosted database,
provider setting, plan/apply/deploy operation, migration, email or push was used.

| Check | Verified result |
| --- | --- |
| ZIP SHA256 | `ea9b0a2f9f99de33626cdffd7dafbe096eee6f3812ffe7d56cfc5793856d1dcb` |
| ZIP / raw bytes / files | 9,021,973 / 21,176,645 / 93 |
| Official limits | 10,485,760 ZIP bytes / 67,108,864 raw bytes / 4,096 entries |
| ZIP index, fresh esbuild output and host-copy SHA256 | `ac6e91129b873692e0a92481f57e957a7f3705a79c0b8c1ad79a6f6d218daa22` |
| Fresh API graph | 867 inputs, including 83 application files; zero forbidden, image or frontend inputs |
| SEO boundary | `lib/seo.ts` is absent from the API graph |
| Native files | Sharp 0.35.5 and libvips 8.18.7, both Linux AArch64 ELF machine 183 |
| Prior-archive payload comparison | Only `index.mjs` changed; all 92 dependency/native entries are byte-identical |
| Trusted GET `/api/health` | 200 with expected runtime JSON, private/no-store |
| Untrusted GET `/api/health` | 403 with redacted `UNTRUSTED_PROXY` |
| Unconfigured GET `/api/portal?view=%2Fdashboard` | 503 with redacted error code only |
| Host-smoke outbound attempts | Zero |
| Windows-helper checks | Six passed under actual PowerShell 7.6.8 on Linux |
| Local migration sources | All eleven approved names/checksums match; canonical digest `e3b7a348e2c9e3f4f066a78fbd02274a0e111155b3af527f99bdc545bbe32691` |

The fresh esbuild analysis imports the official packager's interoperability
banner and uses its exact bundling options. Complete JavaScript output is
byte-identical to the extracted archive entry. Every graph input has a recorded
SHA256, with a separate application-input manifest. There are no test, fixture,
local-test, env, frontend, stylesheet or image inputs. The archive smoke has no
configured database and cannot prove CSV import, venue authorization, deletion
or other application flows by itself; those need their separate API/domain tests.

Relative to the prior archive from
`c56904fca3966c8d8c83327f574aedc3de8c0df3` (ZIP
`fcd0941113bb8dcd7b35f965bf3e37fef5890090a0280b90159331f8c708d521`),
seven application inputs changed and two were added:
`lib/roster-import-columns.ts` and `lib/terminal-deletion.ts`. No application
input was removed. The current application graph covers the CSV import, private
venue and terminal deletion changes in the integrated source. The JavaScript
entry grew from 1,665,575 to 1,675,768 raw bytes and the graph grew from 865 to 867
inputs. This is a real JavaScript update. These counts make no speed claim.

The extracted ARM64 tree remains unchanged. A separate copy of the exact new
JavaScript resolves installed **x86_64 host Sharp** for the host smoke. Its child
receives only PATH, LANG, TZ, NODE_ENV and two synthetic origin/proxy settings.
Fetch, TCP, TLS and HTTP(S) are blocked before module import. No DB, Google, SMTP,
storage or AI credential is supplied. `readelf` confirms AArch64 headers in the
original binaries. Actual ARM64 execution, hosted cold start, image decoding,
storage, SMTP delivery, real AI calls and full login remain unverified here.

The preparation helper pins the ZIP hash, and its test pins the JavaScript
hash. Six checks cover real copy/extraction/native-header inspection, repeated
fresh staging, wrong-digest rejection, an explicitly mocked HTTPS transport,
unsafe-URL rejection before transport, and an unchanged synthetic env sentinel
with zero Neon commands. PowerShell uses isolated temporary XDG directories on
this Linux executor. Native Windows 5.1/7 execution and live artifact download
remain unverified. Handoff preparation does not load or write an env file.

The reviewed plan has eleven entries. Existing historical SQL, ledger hashes
and prior proof receipts are preserved. Before deploying this backend, the
owner must verify a current backup/restore checkpoint, create a fresh populated
target inspection, then apply **only the actual pending set**: an existing
nine-entry target needs `0104_admin_team_corrections.sql` and
`0105_terminal_record_deletion.sql`; a ten-entry target needs only 0105; an
eleven-entry target needs no apply. Inspect again and require all eleven entries
with no pending work. The 0105 LF checksum is
`088b96a239915cd518765b5ef260c73feee913d8e0b181234110f7591676ccde`.
The recognized whole-seven historical LF or exact CRLF histories remain
supported without rewriting the ledger. Follow the
[populated upgrade handoff](NEON_POPULATED_UPGRADE_PLAN.md). No hosted ledger,
backup or migration was inspected or executed here. The ZIP contains no SQL and
performs no automatic migration.

After the owner completes those schema prerequisites, follow the
[Windows deployment handoff](DESIGN_RELEASE_WINDOWS_DEPLOY.md) to deploy this
exact archive manually. This archive has been built and verified locally; it
has not been deployed.

[Receipt](../artifacts/neon/receipt.json),
[build metadata](../artifacts/neon/build-metadata.json),
[verification summary](../evidence/followup-api-refresh/verification.json),
[build operations](../evidence/followup-api-refresh/build-operations.json),
[fresh graph](../evidence/followup-api-refresh/graph.json),
[all input hashes](../evidence/followup-api-refresh/all-input-hashes.json),
[application hashes](../evidence/followup-api-refresh/runtime-input-hashes.json),
[archive comparison](../evidence/followup-api-refresh/archive-refresh-comparison.json),
[native headers](../evidence/followup-api-refresh/native-readelf.json),
[local SQL hashes](../evidence/followup-api-refresh/local-sql-hash-review.json),
[host smoke](../evidence/followup-api-refresh/host-smoke.json) and
[PowerShell checks](../evidence/followup-api-refresh/windows-handoff-report.json)
record the current facts. Older archive evidence remains historical and
unchanged. The smoke report's `noRebuild` describes only that read-only smoke
step; the fresh build is recorded separately.
