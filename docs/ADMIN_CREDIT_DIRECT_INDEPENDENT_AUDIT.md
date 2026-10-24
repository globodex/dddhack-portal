# Direct admin credit values: independent boundary audit

Reviewed backend source: `1e89fa82df2f5a03a363a764ec058464852cf205`.
The later `af9473d` stylesheet/SSR adjustment does not change this backend.
This audit adds tests and evidence only; it changes no runtime source.

Six independent cases passed: three on disposable SQLite and the same three
through the production PostgreSQL adapter backed by PGlite.

| Boundary | Verified behavior |
| --- | --- |
| Authorization | Owner/admin may read values. Anonymous, Viewer, participant, judge and volunteer are denied before any credit inventory, allocation or history query. The same authenticated admin identity is denied immediately after owner revocation, despite its legacy `users.role='admin'`. |
| Private HTTP | Actual `handlePortal` GET responses, including denials, use `private, no-store, max-age=0`, identity `Vary` and `nosniff`. An untrusted presentation version does not enable a credit cache or omit fresh data. |
| Pagination and filters | Sixty synthetic codes return 25/25/10 distinct rows. Assigned/available views, case-insensitive recipient search, an SQL-like search string and the last permitted empty page retain their boundaries. Each row has only the intended mapping fields and `value`, `codeAvailability`, `codeError`. |
| Legacy values | Valid legacy ciphertext decrypts. Only the selected page accesses the key. Broken ciphertext, an encrypted empty value, and absent/invalid keys produce explicit fixed errors without ciphertext or key material. Valid plaintext codes remain available without a key. |
| Read-only GET | Exact before/after snapshots of stock, allocations, code history, retired tombstones, category mappings, imports, batches, columns and audit logs are identical. Existing actor identity reconciliation is outside the new stock GET and is unchanged. |
| Personal and public privacy | Actual public-route responses and personal credit metadata contain no admin code values/storage fields. Personal reveal still returns only the checked-in recipient's allocation; a cross-user argument is rejected, and a non-checked-in recipient remains denied. |

Source review also confirms the Next API route remains dynamic; the backend
proxy and the stock component fetch with `cache: 'no-store'`. The proxy forces
private/no-store responses. The existing admin presentation cache supports only
participant/team labels, not credit stock. These source observations are not a
browser cache or clipboard test.

Run:

```sh
npx tsx --test --test-concurrency=1 tests/admin-credit-direct-independent.test.ts
npx tsc --noEmit
```

Evidence: `evidence/admin-credit-direct-independent/tests.log`,
`typecheck.log`, and `verification.json`. The preserved first harness run failed
on a test-only composite-key ordering mistake and invalid synthetic storage
shapes. Those fixtures were corrected to obey the real storage guards; no guard
was disabled and no runtime defect was inferred from that run.

No blocker was found within these boundaries. All values and keys were synthetic;
no hosted database, real voucher/key, outbound provider call, migration, email,
deployment or push was used. PGlite is not native multi-connection PostgreSQL
concurrency evidence. Browser rendering, Copy interaction and the final integrated
application suite remain the source owner's/parent's checks.
