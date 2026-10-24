# Maximum project response measurement

`api-report.json` contains actual local HTTP response body bytes and SHA256 receipts from server source `8c9b968d6a3c104906b639f04f2dac4a7c0e9053`. Requests explicitly used `Accept-Encoding: identity`; bodies are uncompressed. No hosted endpoint, credentials or production records were used.

The disposable fixture server uses the real PortalService, storage database decorator and fake object store. Its valid API images are exact131,072-byte logos and393,216-byte banners. Legal maximum text/URL lengths include `<` characters to stress HTML/script escaping. One snapshot has two committed versions and a different current draft; the second has three distinct committed image pairs. It preserves actual service permissions. The server accepts GET only, binds loopback and requires the explicit synthetic switch.

Measured API responses: dashboard715,302 B; submission715,237 B; owner submission detail1,425,026 B; three-version history2,136,344 B. Admin list760 B and public list11,429 B have zero inline data-image strings. Public image endpoints return the exact131,072/393,216 raster bytes. Anonymous private view returns401/56 B and participant admin view returns403/58 B. All retain private/no-store headers.

These API receipts do not establish Next HTML/RSC sizes. That separate rendered-response gate is pending a coordinated local Next measurement slot. Reproduction scripts: `scripts/qa-project-media-response.ts` and `scripts/qa-project-media-responses-measure.mjs`. The fixture secret printed by that script is a fixed synthetic local marker, not a credential.
