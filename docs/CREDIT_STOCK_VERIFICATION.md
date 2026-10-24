# Credit stock backend verification

Runtime source: `a8f608fe252008699f6f9ab58ac7f771ce37d306`. Feature branch: `feat/credit-stock-restock`. All work used disposable synthetic fixtures. No hosted migration, production allocation, provider/credential change, email send or deployment was performed.

Source sequence, after the separately integrated legacy retry repair:

| Commit | Change |
| --- | --- |
| `be4fd8c` | Stable CSV-header category identity, restock/dedup receipts, event-triggered allocation, masked paged stock, self-only credits and additive schema |
| `7e15030` | Immutable allocation ownership, atomic overlapping-stock failure and count refresh, legacy-upgrade repair proof and guarded UI fixtures |
| `7685b91` | Removed personal-credit readers receive403 PARTICIPANT_REMOVED without credit data or an extra query |
| `a8f608f` | Competing new canonical headers cannot create two categories even when edited display headings differ |
| `9999263` | Existing domain regressions reflect the approved personally checked-in role-independent credit rule |

Both author and committer on every owned commit are `Parampreet Singh <rubercuber.30@gmail.com>`. The existing main-only Vercel Git deployment configuration remains present.

Verified behavior:

- 50 stock with10 checked in produces10 Assigned/40 Available. Ten later check-ins produce20/30. When65 recipients exhaust50 stock, appending100 fills the15 waiting recipients, giving150 Total/65 Assigned/85 Available/0 Waiting without republishing.
- Same source CSV header, case/trim normalized, retains the category ID, existing display heading, Markdown and active publication. Duplicate values within the file, later imports and other categories do not create another physical code. Identical import retries return an idempotent receipt.
- Publish, restock, quick/bulk/legacy check-in and explicit manual Checked in transitions append the shared allocation SQL inside the existing transaction. GET never repairs or allocates, and there is no polling. Explicit repair fills legacy already checked-in admin/owner recipients without republishing, rechecking in or changing previous assignments.
- Uncheck-in/recheck-in preserves an existing assignment. Confirmed deletion removes active category mappings and inventory but retains non-personal hashes/consumed flags, so deleted codes cannot become fresh stock. Direct ownership UPDATE and code reassignment are rejected by database guards.
- Owner/admin stock pages return25 masked rows with person/email, assignment time, Assigned/Available status and counters. Only explicit authorized reveal returns one value. Personal reads/reveals are current-attendance and recipient-self/email bound, independent of role/team/profile-completion presentation. Other Viewer writes remain denied. Removed personal readers receive403/no credit payload/no-store.
- Existing code bytes and mappings survive the additive schema upgrade. Duplicate canonical legacy headers or global fingerprints abort the upgrade atomically without merging or deleting data. The history has no recipient ID, email or assignment time; eventual reviewed private-data cleanup can delete active mappings and inventory while retaining the hash protection. No automatic retention purge was introduced.

Verification records:

| Run | Outcome | Evidence |
| --- | --- | --- |
| Credit/quick-check-in/PostgreSQL service compatibility |45 passed | `evidence/credit-stock/focused-verification.txt` |
| Updated stock, migrations and PostgreSQL schema/trigger parity |19 passed | `evidence/credit-stock/followup-verification.txt` |
| Expanded legacy upgrade and explicit admin/owner repair |6 passed | `evidence/credit-stock/legacy-upgrade-repair-verification.txt` |
| Actual HTTP removed-self privacy and actionable error |2 passed | `evidence/credit-stock/personal-removal-verification.txt` |
| Divergent display-heading category race and safe retry |2 passed | `evidence/credit-stock/category-key-race-verification.txt` |
| Existing domain/roster/manual status and independent quick-check-in audit |48 passed | `evidence/credit-stock/domain-regressions.txt` |
| Legacy local/hosted D1 migration parity | Passed | `evidence/credit-stock/d1-initial-run.txt` |
| Legacy complete D1 binding/schema/atomicity/concurrent flow | Passed in isolation | `evidence/credit-stock/d1-isolated-retry.txt` |
| Independent audit, owned by Profile lane |14 passed + typecheck | `018a040df75f4e84c19d3ae25339e5a1565dde30` on `test/credit-stock-independent-audit` |

The runs overlap; their counts are not additive. Typecheck and diff checks passed. The first combined D1 run exceeded its existing30-second deadline under contention; the same file passed alone in17.5 seconds without changing source or timeout. Both outcomes are retained. These are local functional results, not a production-speed or hosted-capacity claim. PGlite verifies PostgreSQL SQL/trigger semantics through the production adapter; native multi-connection PostgreSQL was not exercised in this lane.

`docs/CREDIT_STOCK_FIXTURES.md` provides validated fresh local states for UI evidence:50/10/40/0, legacy waiting50/9/41/1, and exhausted5/5/0/5. The helper prints no code values and records source/runtime fingerprints. Actual rendered screenshots and touch/keyboard flows are owned by the UI lane; backend tests alone do not establish visual readiness.

The additive SQLite0024, legacy mirror0027 and PostgreSQL0005 migration files require reviewed application before this runtime is deployed. Root integration, the final app build/browser matrix and rebuilt backend archive are separate; publication remains manual.
