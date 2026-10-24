# Maximum project response measurement

`api-report.json` contains actual local HTTP response body bytes and SHA256 receipts from server source `8c9b968d6a3c104906b639f04f2dac4a7c0e9053`. Requests explicitly used `Accept-Encoding: identity`; bodies are uncompressed. No hosted endpoint, credentials or production records were used.

The disposable fixture server uses the real PortalService, storage database decorator and fake object store. Its valid API images are exact131,072-byte logos and393,216-byte banners. Legal maximum text/URL lengths include `<` characters to stress HTML/script escaping. One snapshot has two committed versions and a different current draft; the second has three distinct committed image pairs. It preserves actual service permissions. The server accepts GET only, binds loopback and requires the explicit synthetic switch.

Measured API responses: dashboard715,302 B; submission715,237 B; owner submission detail1,425,026 B; three-version history2,136,344 B. Admin list760 B and public list11,429 B have zero inline data-image strings. Public image endpoints return the exact131,072/393,216 raster bytes. Anonymous private view returns401/56 B and participant admin view returns403/58 B. All retain private/no-store headers.

These API receipts do not establish Next HTML/RSC sizes. The completed integrated rendered-response gate is recorded below. Reproduction scripts: `scripts/qa-project-media-response.ts` and `scripts/qa-project-media-responses-measure.mjs`. The fixture secret printed by that script is a fixed synthetic local marker, not a credential.

## Integrated Next gate passed

`next-report.json` and `integrated-api-report.json` bind the actual integrated UI/backend source `28ebbfc81a49ab839316b0d9121902e3cf645173`. A separate isolated worktree ran Next 16.4.3 with webpack; its local backend used the same integrated source and the fake object store. No browser, hosted service or real credential was involved. Every final receipt passed its expected status, content type and conservative 4,000,000-byte bound. The ordinary 200 pages,401/403 errors and public raster responses were checked separately.

| Actual uncompressed response                        | HTML bytes | RSC bytes | API bytes |
| --------------------------------------------------- | ---------: | --------: | --------: |
| Dashboard                                           |  1,336,057 |   721,570 |   715,338 |
| Submission                                          |  1,335,146 |   721,508 |   715,273 |
| Three committed versions                            |  2,284,333 | 2,142,736 | 2,136,344 |
| Owner detail: published version plus distinct draft |  2,273,241 | 1,431,464 | 1,425,026 |
| Admin metadata list                                 |     30,259 |     6,945 |       760 |
| Public project list                                 |     69,431 |    19,107 |    11,453 |

The largest serialized save request in the fixture is 711,937 bytes, below the 1,000,000 project-only request envelope. Original 1 MB/5 MB files are normalized before this request. Both metadata-list and public-list API responses contain zero inline image strings. Public raster responses remain 131,072/393,216 bytes. Private errors remain 401/56 B and 403/58 B. These are local development response-size receipts, not hosted latency measurements or a claim that development timing predicts production.

Two failed harness attempts are preserved under `verification` and excluded from success: Turbopack could not resolve a symlinked external node_modules root and returned 500; restarting with documented webpack resolved this local setup issue. Next 16's RSC cache-poisoning guard then returned 307 when the probe omitted `_rsc`; installed Next source requires an empty `_rsc` hash when no router-state headers are sent. The corrected requests returned 200 with `text/x-component`. No app source/configuration change was needed for either correction. All 22 final receipts passed. The temporary 3015 Next and8898 fixture backend were stopped, and `ss` verified both listeners closed.

The combined-root migration plan is preserved too: seven portal migrations 0000..0006, plus 0100 auth and0101 evaluation (nine total plan entries). The real PostgreSQL-semantics upgrade test passed at root source 8ab1345 with 0005 credit and 0006 media both present. No hosted migration was run. Source-only manual migration requirement remains in `docs/PROJECT_MEDIA_INPUTS.md`.
