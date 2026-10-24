# Refreshed backend archive

The official archive was freshly rebuilt from final integrated source `59246860b49d83412c6685e4643f97a21aab55e5` using `@neon/config-runtime@1.10.2`, function `env: {}` and the existing public npm cache in offline mode. No warnings, provider operation, hosted migration or deployment occurred.

| Check | Result |
| --- | --- |
| Runtime target | Node.js 24, Linux ARM64 glibc |
| Archive |93 files;9,014,174 compressed bytes;21,149,045 raw bytes |
| New ZIP SHA256 |`bc017c088b6791d091db6571104d84a2dcfb6ca8ea1d7a0f80fa36b38aef7ae3` |
| JavaScript SHA256 |`5f33d61cf558e6dd9ea32c98f31cd4a166e74a8e7192c74505ff3eb36077b7d6` |
| Fresh graph |861 inputs;77 application inputs; zero frontend/forbidden inputs |
| Native files | Two Linux ARM64 ELF files, machine 183; unchanged hashes |
| Isolated host smoke | Trusted health 200, untrusted 403, unconfigured 503; zero outbound attempts |

All93 uncompressed entry payloads are byte-identical to the previous reviewed ZIP `6d71e987f3019140b802b207eb7a9cd92fe1de57887d463b73449b87f6ce4a5f`. Exactly372 raw ZIP bytes changed, all in DOS timestamp fields. Zeroing only those fields makes both complete ZIP byte sequences identical. The refreshed archive therefore has a new download/preparation pin with the same runtime payload. The entry comparison and normalized digest are recorded in [archive-refresh-comparison.json](../../evidence/neon-host-archive/archive-refresh-comparison.json).

Since the prior integrated baseline191b76e, the backend-path differences are `neon/db/migrate.ts`, `neon/db/populated-upgrade.ts` and `neon/scripts/upgrade-populated.ts`. None is in the API entry graph. All77 application graph inputs are byte-identical to that baseline. This is precise runtime equivalence; it is not a claim that all backend/tooling source paths have an empty diff.

No env files, credentials, fixtures, databases or test source paths are packaged. JavaScript/banner and ARM-native inventories were freshly checked. The host smoke loaded unchanged JavaScript with an explicitly substituted installed x86_64 Sharp dependency, leaving the ARM64 ZIP/extraction unchanged. **Actual unmodified ARM64 execution remains unverified.** Hosted cold start, storage, SMTP and full login are not established by this local audit.

SQL files are separate from the Function ZIP. Local file-only checksum review confirms seven historical entries unchanged plus pending `0102_credit_stock.sql` and `0103_project_media_limits.sql`, nine total. No provider plan, hosted ledger inspection, migration application, backup or database operation was performed. The populated-target workflow remains an owner-operated task in [the upgrade handoff](../../docs/NEON_POPULATED_UPGRADE_PLAN.md).

The Windows preparation helper must use this new exact ZIP hash if it consumes the refreshed file. Its pin and handoff documentation are coordinated separately with the integration owner; this archive worker did not edit those files. Publication remains manual.

[Verification](../../docs/NEON_HOST_ARCHIVE_VERIFICATION.md), [receipt](receipt.json), [build metadata](build-metadata.json), [fresh graph](../../evidence/neon-host-archive/graph.json), [source equivalence](../../evidence/neon-host-archive/source-equivalence.json) and [host smoke](../../evidence/neon-host-archive/report.json) preserve provenance and limits.
