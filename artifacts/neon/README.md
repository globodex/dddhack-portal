# Final reviewed backend archive

`portalapi.zip` was freshly rebuilt from `d2f12933191a7633f8bffa252aa568fe65654160`, the packaging checkout's cherry-pick of integrated source `191b76ed26f430128b14112f77b74ad3e26b1ec0`. The backend/configuration/package paths have an empty diff between those commits. The ZIP includes final credit-stock invariants, any-aspect project media policy/normalization, existing role permissions and sign-in email changes. Later frontend CSS/Studio changes do not enter this backend graph.

| Check                 | Result                                                                      |
| --------------------- | --------------------------------------------------------------------------- |
| Runtime               | Node.js 24, Linux ARM64 glibc                                               |
| Archive               | 93 files; 9,014,174 compressed bytes; 21,149,045 uncompressed bytes         |
| ZIP SHA256            | `6d71e987f3019140b802b207eb7a9cd92fe1de57887d463b73449b87f6ce4a5f`          |
| JavaScript SHA256     | `5f33d61cf558e6dd9ea32c98f31cd4a166e74a8e7192c74505ff3eb36077b7d6`          |
| Fresh graph           | 861 inputs; 77 application inputs; no frontend/forbidden inputs             |
| Native files          | Two ARM64 ELF files, machine 183                                            |
| Host JavaScript smoke | Trusted health 200, untrusted 403, unconfigured 503; zero outbound attempts |

The official `@neon/config-runtime@1.10.2` build API produced the ZIP with function `env: {}` and no warnings. Fresh independent graph analysis used its exact esbuild options/banner and matched the actual ZIP JavaScript hash. A new extraction/inventory verified all file hashes and both native architectures. No env files, fixture databases or test source paths are packaged.

The host smoke used unchanged JavaScript with explicitly substituted x86_64 Sharp. The original ZIP and ARM64 extraction remained unchanged. **Actual ARM64 execution remains unverified.** No deployment, mail send, real login, storage call, hosted database operation, provider setting or credential change occurred. Publication remains the owner's manual action.

## Populated database upgrade

The hosted database contains real records. The owner must establish a backup/restore checkpoint, verify the exact target and existing ledger/checksums, and use an approved incremental pending-only procedure. The new files are `0102_credit_stock.sql` and `0103_project_media_limits.sql`, after the preserved historical seven migrations. The combined plan is sorted; no historical SQL/checksum or auth migration was rewritten. Duplicate legacy category keys/fingerprints cause atomic failure for manual collision review.

**Never use `PORTAL_SYNTHETIC_DATABASE=1`, `--apply-synthetic`, fixture seeds, schema resets or destructive replacement on the populated hosted target.** The existing CLI's default inspects local files only. The [manual incremental plan](../../docs/NEON_POPULATED_UPGRADE_PLAN.md) gives the operator route using the existing transaction/advisory-lock migration library, expected historical checksums, pending names, collision handling and validation. Nothing was applied here. SQL sources are separate from the Function ZIP.

[Verification](../../docs/NEON_HOST_ARCHIVE_VERIFICATION.md), [receipt](receipt.json), [build metadata](build-metadata.json) and [evidence](../../evidence/neon-host-archive/report.json) preserve provenance and limits. The source plan has seven historical entries plus two pending feature entries, nine total.

Rebuild with the existing helper and official runtime:

```sh
npm_config_cache=/tmp/ddd-npm-cache node scripts/build-neon-archive.mjs /tmp/ddd-neon-build-tools/node_modules/@neon/config-runtime/dist/v1.js
```

This calls build only, never plan/apply/deploy. Native staging uses public npm packages and the executor's ordinary transport configuration. ZIP timestamps can change future archive hashes.
