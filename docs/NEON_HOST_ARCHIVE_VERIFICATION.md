# Final backend archive verification

Freshly rebuilt from `d2f12933191a7633f8bffa252aa568fe65654160`, source-equivalent in backend/configuration/package paths to integrated `191b76ed26f430128b14112f77b74ad3e26b1ec0`. The new feature SQL names are `0102_credit_stock.sql` and `0103_project_media_limits.sql`; historical auth/evaluation order and checksums are preserved. No app/lib source edit was made by this packaging lane.

| Check                                            | Observed result                                                        |
| ------------------------------------------------ | ---------------------------------------------------------------------- |
| ZIP SHA256                                       | `6d71e987f3019140b802b207eb7a9cd92fe1de57887d463b73449b87f6ce4a5f`     |
| Archive                                          | 9,014,174 compressed bytes; 21,149,045 raw bytes; 93 files             |
| Official limits                                  | 10,485,760 compressed bytes; 67,108,864 raw bytes; 4,096 entries       |
| Native files                                     | Sharp 0.35.5/libvips 8.18.7, two Linux ARM64 ELF machine 183 files     |
| Forbidden paths                                  | None                                                                   |
| Fresh graph                                      | 861 inputs, 77 application inputs; zero frontend/forbidden inputs      |
| Archive/analysis/host-copy JS hash               | All `5f33d61cf558e6dd9ea32c98f31cd4a166e74a8e7192c74505ff3eb36077b7d6` |
| Trusted GET `/api/health`                        | 200, expected runtime JSON, private/no-store                           |
| Untrusted GET `/api/health`                      | 403, redacted `UNTRUSTED_PROXY`                                        |
| Unconfigured GET `/api/portal?view=%2Fdashboard` | 503, redacted `BACKEND_UNAVAILABLE`                                    |
| Outbound attempts                                | Zero                                                                   |

The official `@neon/config-runtime@1.10.2` `buildFunctionBundle` API used function `env: {}`, no warnings and no plan/apply/deploy call. The final build ran after the migration ordering fix. Separate fresh analysis used its exact esbuild 0.28.2 options/banner and emitted the identical JavaScript hash. The 861-input count is recomputed, not the earlier 854. The existing archive verifier consumes this fresh receipt; its `receiptGraphOnly.recomputed: false` means that verifier does not itself repeat the separate graph build.

New extraction `/tmp/ddd-neon-final-extracted-m_erelu8` and unchanged-JavaScript host copy `/tmp/ddd-neon-final-host-m_t3efh3` were used. Host node_modules resolves to installed executor dependencies, loading x86_64 Sharp ELF machine 62. ZIP, original/host JavaScript and both ARM native hashes were checked before and after the smoke. The original ARM archive/extraction stayed unchanged.

The Node 24 child starts with six whitelisted system/synthetic keys. Fetch, TCP sockets, TLS and HTTP(S) requests are blocked before import; no provider/DB/SMTP/Google/storage credentials are supplied. Sharp adds only its non-secret native-library path `VIPSHOME`. **This does not execute the unmodified ARM64 ZIP.** ARM64 cold start/decoding, hosted storage, SMTP delivery and full login remain unverified. No deployment, migration apply, mail send, provider setting change or hosted data read/write occurred.

An earlier pre-fix build process omitted the executor's public npm proxy transport and failed before replacing the archive. The completed final build retained only ordinary proxy/certificate transport and a writable public npm cache; function env remained empty. Build metadata and operations evidence distinguish this setup correction from any provider action.

## Manual populated-target upgrade

The hosted target contains real data. Follow [the operator-owned incremental plan](NEON_POPULATED_UPGRADE_PLAN.md): backup/restore checkpoint, exact target and historical ledger/checksum review, pending-only `0102` then `0103` inside the existing `SERIALIZABLE`/advisory-lock migration procedure, private collision review and read-only validation. Never reset/reseed it, rewrite historical checksums or use the synthetic apply flags on that target. No hosted ledger was inspected or migration applied by this lane.

The source-only plan has historical `0000`..`0004`, `0100_auth.sql`, `0101_approved_evaluation.sql`, then new `0102_credit_stock.sql` and `0103_project_media_limits.sql`. The source expectations and exact checksums are recorded in `historical-ledger-checksums.json` and `migration-plan.json`. Stock duplicates fail atomically rather than silently merging/deleting codes; previously valid media references/receipt states remain valid.

Re-run the existing read-only verifier against a fresh extraction and separate host-copy directory:

```sh
node scripts/verify-neon-host-archive.mjs \
  --archive artifacts/neon/portalapi.zip \
  --receipt artifacts/neon/receipt.json \
  --extracted /tmp/ddd-neon-final-extracted-m_erelu8 \
  --host /tmp/ddd-neon-final-host-m_t3efh3 \
  --report evidence/neon-host-archive/report.json
```

[Receipt](../artifacts/neon/receipt.json), [inventory](../evidence/neon-host-archive/inventory.json), [graph](../evidence/neon-host-archive/graph.json), [source equivalence](../evidence/neon-host-archive/source-equivalence.json) and [host smoke](../evidence/neon-host-archive/report.json) preserve actual outputs. Local host substitution and payload checks do not establish hosted performance or provider success.

Independent [populated upgrade proof](https://github.com/Param302/dddhack-portal/blob/d195fe89b8d327709ffe11d6e87e6c747d1dd96b/docs/COMBINED_MIGRATION_UPGRADE_INDEPENDENT_REVIEW.md) passes six local cases against integrated source `191b76ed26f430128b14112f77b74ad3e26b1ec0`: the seven-entry historical ledger gains only `0102`/`0103`, populated synthetic records remain equal, repeat is empty, and both legacy collision cases roll back atomically. The proof covers actual persisted synthetic auth/profile/team/project/submission/evaluation/inventory/allocation/media rows. It uses local single-connection PGlite and does not claim a hosted ledger inspection or native multi-connection concurrency result. Root integrated the proof as `4b9a6498087a4cca38d465d90e3643778140b942`.
