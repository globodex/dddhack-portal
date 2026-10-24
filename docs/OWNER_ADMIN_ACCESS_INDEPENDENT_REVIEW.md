# Independent owner admin-access review

Reviewed exact feature source `771fe2045d75dd8c130ace88d482c7206e6a519c` in isolated branch `test/owner-admin-access-audit`. Production source files remained unchanged. All role/account operations used fresh synthetic SQLite or PostgreSQL/PGlite fixtures; no live role, authentication provider, credential or production data action occurred.

Result:16 tests passed,0 failed; typecheck and diff checks passed. No actual API defect was found in this bounded review.

Each case runs against both engines:

| Case | Verified behavior |
| --- | --- |
| Owner-only projection | Actual HTTP owner read returns only id/name/email/owner rows, current owner appears despite a participant default, IDs are unique, and responses are no-store. Admin settings omit the owner-only field for a nonowner. Anonymous/nonowner reads and writes return401/403 with no roster data. |
| Legacy fallback and existing identity | Revocation keeps `users.role='admin'` unchanged but writes an authoritative participant override. The same authenticated identity and existing service object lose admin API access on the next request. |
| Owner protection and strict body | Self and the configured owner cannot be revoked. A verified configured-owner identity can read; an unverified claim cannot. Missing/wrong confirmation and extra granular role/owner fields are rejected. Removing a non-admin does not change their existing role. |
| Data preservation and regrant | Normalized add/dedupe/revoke/regrant preserve account, registration, private profile/details, membership, team, idea and personal allocation. Personal credit remains the same after admin access is removed. Snapshots use hashes, not logged private field values. |
| Duplicate revoke | Concurrent and repeated revokes create one role override and one revoke audit, with no stale write guards left behind. |
| Grant/revoke ordering | Interleaved authorized owner actions follow their committed order without a legacy default resurrecting access or user data being lost. The API does not promise click-order/version semantics beyond its transaction order. |
| Target-owner race | A target becoming the configured owner between read and mutation remains protected. The stale revoke returns a typed conflict and commits no revoke audit. |
| Actor authorization race | Removing the owner's active access before the transaction is rechecked and denies the revoke, leaving the target unchanged. |

Evidence:

- `tests/owner-admin-access-independent.test.ts`
- `evidence/owner-admin-access-independent/run.txt`
- `evidence/owner-admin-access-independent/report.json`, including source fingerprints and the empty production-source diff

Verification used trusted synthetic identity objects through the actual HTTP handler. It does not establish live login/cookie/provider behavior. PGlite exercises real PostgreSQL SQL/trigger behavior through the production adapter, but has one connection; native multi-connection MVCC was not exercised.

An attempted test integration onto root `32dadb2` had a `lib/experience.ts` conflict. It was aborted without resolving or editing production files, and the audit instead checked out the feature commit exactly. Parent integration must retain its existing changes and rerun these tests after resolving that conflict. Parent also owns the confirmation copy/token integration, final build and actual rendered browser evidence. Backend tests alone do not establish UI readiness.
