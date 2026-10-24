# Final-source backend archive refresh

The archive was rebuilt locally from actual final integrated source `59246860b49d83412c6685e4643f97a21aab55e5`. This refresh uses the existing official build helper and `@neon/config-runtime@1.10.2` buildFunctionBundle only. Function env is empty, build-process environment is whitelisted, public npm staging ran offline from the existing cache, install scripts are disabled by the official packager and there are no warnings. No plan/apply/deploy API, provider read, hosted database operation, email send, credential or provider-setting change occurred.

| Check | Observed result |
| --- | --- |
| Refreshed ZIP SHA256 |`bc017c088b6791d091db6571104d84a2dcfb6ca8ea1d7a0f80fa36b38aef7ae3` |
| Previous reviewed ZIP |`6d71e987f3019140b802b207eb7a9cd92fe1de57887d463b73449b87f6ce4a5f` |
| Size and entries |9,014,174 compressed bytes;21,149,045 raw bytes;93 files |
| Official limits |10,485,760 compressed bytes;67,108,864 raw bytes;4,096 entries |
| Entry payload comparison | All93 files byte-identical to the previous archive |
| Raw ZIP difference |372bytes, exclusively DOS timestamps; zero non-timestamp bytes differ |
| Timestamp-normalized ZIP SHA256 |`71a4aee97a86f5f40d9dd70ac2dd56808c40128464909517ef21739fef843d2d` for both archives |
| Fresh graph |861 inputs;77 application inputs; no frontend/forbidden inputs |
| Actual archive/fresh-analysis/host-copy JS hash |`5f33d61cf558e6dd9ea32c98f31cd4a166e74a8e7192c74505ff3eb36077b7d6` |
| Native files | Sharp 0.35.5/libvips 8.18.7; two ARM64 ELF machine 183 files with unchanged hashes |
| Trusted GET `/api/health` |200, expected runtime JSON, private/no-store |
| Untrusted GET `/api/health` |403, redacted UNTRUSTED_PROXY |
| Unconfigured GET `/api/portal?view=%2Fdashboard` |503, redacted BACKEND_UNAVAILABLE |
| Outbound attempts | Zero |

Fresh esbuild 0.28.2 analysis uses the exact installed official packager options and CommonJS interoperability banner. Its output matches the actual refreshed ZIP entry. Every application input was hashed and compared against prior integrated source 191b76ed26f430128b14112f77b74ad3e26b1ec0. All 77 match. The only backend/configuration/package path changes since that baseline are neon/db/migrate.ts, neon/db/populated-upgrade.ts and neon/scripts/upgrade-populated.ts; all three are outside the API graph. New operator tooling is not silently included in the Function. The receipt names the actual built source5924686 rather than retaining the old packaging source.

The new extraction is `/tmp/ddd-neon-refresh-extracted-_fd1xjke`. The separate host copy is `/tmp/ddd-neon-refresh-host-3pvl0ypv`, containing unchanged index.mjs and a node_modules link to the installed x86_64 dependencies. Host Node 24 loads Sharp ELF machine 62. ZIP, original/host JS and both ARM-native hashes were checked before and after smoke. readelf freshly confirms AArch64 headers, packaged libvips dependency and RPATH; it does not execute ARM code.

The smoke child starts with only PATH, LANG, TZ, NODE_ENV and two synthetic frontend/proxy settings. Fetch, TCP, TLS and HTTP(S) outbound entry points are blocked before import. No DB, SMTP, Google, S3 or AI credential is supplied. Sharp adds only its non-secret native-library path VIPSHOME. **This verifies host JavaScript loading and routing with an explicit native dependency substitution, not execution of the unmodified ARM64 archive.** Hosted native decoding, storage, SMTP and full login remain unverified.

The verifier report's noRebuild field applies to that smoke phase only; the distinct official fresh build is recorded in build-operations.json and build.log. The archive's new SHA is explained entirely by timestamp metadata. The integration owner must update the Windows preparation helper's pinned digest and repeat its existing handoff checks before presenting that helper with the new archive. This worker did not modify the Windows helper or populated-upgrade handoff.

Local SQL-file checksum review confirms the original seven historical entries remain unchanged and pending source files 0102_credit_stock.sql and 0103_project_media_limits.sql remain separate, nine total. No migration CLI, provider plan, hosted ledger, backup or SQL operation was run. Runtime payload equivalence does not verify the separate populated-upgrade CLI or establish any hosted migration status. Follow the owner-reviewed [populated upgrade handoff](NEON_POPULATED_UPGRADE_PLAN.md) for future authorized operations.

[Receipt](../artifacts/neon/receipt.json), [build metadata](../artifacts/neon/build-metadata.json), [byte comparison](../evidence/neon-host-archive/archive-refresh-comparison.json), [input hashes](../evidence/neon-host-archive/runtime-input-hashes.json), [source equivalence](../evidence/neon-host-archive/source-equivalence.json), [native headers](../evidence/neon-host-archive/native-readelf.json), [local SQL hashes](../evidence/neon-host-archive/local-sql-hash-review.json) and [outbound-blocked smoke](../evidence/neon-host-archive/report.json) preserve the actual results.
