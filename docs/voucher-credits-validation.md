# Voucher credits validation

Base: `bff881a`, isolated `feat/voucher-only-credits` branch. No root UI dirt was copied.

The authorized additive implementation and tests passed:

- `npm run typecheck`.
- `npm run build`, including production artifact inspection.
- `npm run test:production`: disposable local compiled Worker/D1 only. New voucher import, allocation and authorized reveal succeeded without an application encryption key; a nonexistent pool returned `422 CREDIT_TYPE_REQUIRED`. Ordinary credit export omitted the voucher. All unrelated existing authentication, CSRF, source exposure, operational setup, staged release and privacy smoke checks remained enabled and passed.
- New voucher tests: **7/7**, covering keyless check-in/allocation/reveal, RBAC and identity/attendance boundaries, concurrency/duplicates, email change/deactivation, metadata/log/export/public/error non-disclosure, reveal-time revocation and additive legacy preservation.
- Full direct-loader suite: **166/167 passed**, including actual local D1 transactions and Drizzle migrations. The only failure is the unchanged base UI assertion expecting `Removed participants` in `tests/admin-portal-integration.test.ts:108`; the parent reported it already corrected in root commit `2a37e44`. This branch intentionally does not modify that unrelated file.

Additional explicitly authorized compatibility fix: legacy `toolEffectiveness` is ignored and canonicalized to an empty string before request hashing/persistence, matching the retired UI narrative. Its new omission/concurrent-retry regression passes and verifies no score/evaluation result is inferred. Existing historical versions are untouched.

Changed files beyond the original credit implementation scope were explicitly assigned by the parent: the credit inventory fixture INSERT now names its five legacy columns, the old keyless credit assertions in `tests/sites-runtime.test.ts` and `scripts/production-smoke.mjs` now check the real voucher flow, and the obsolete check-in message assertion in `tests/operational-readiness.test.ts` now expects pending inventory with zero legacy allocations. Every unrelated runtime/auth/privacy check is preserved. The new legacy-narrative regression is in `tests/retired-tool-effectiveness.test.ts`.

Generated tracked build/smoke evidence files were restored to avoid including unrelated artifact churn; root will regenerate final combined evidence. No actual voucher, production allocation/import, live migration, credential, key rotation/deletion, publication, paid provider or browser operation occurred. The UI payload contract and the plaintext database-access tradeoff are documented in `voucher-credits-contract.md`.
