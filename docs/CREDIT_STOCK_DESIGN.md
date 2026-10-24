# Credit stock and restock proposal

Audit baseline: `ba7d03db0aab5a783ed109a1bd2d0f1f0f71be9c`. The proposal was reviewed before isolated implementation; root integration is separate. All future migrations/tests in this lane are local and synthetic. Production migration, allocation, publication and provider configuration are excluded.

Current code rejects an existing heading, allocates a newly published column only once, does not allocate on the new quick/bulk check-in path, and has no durable consumed-code history after deletion. Existing uniqueness protects one inventory row per category/fingerprint, one assignment per inventory row and one assignment per category/person. Current credit presentation/reveal includes role, roster and approval gates beyond the personal attendance check.

## Schema

Add SQLite `0024_credit_stock.sql` and PostgreSQL `0005_credit_stock.sql`, plus matching Drizzle declarations. Preserve existing table row shapes and historical migration checksums.

- `credit_category_keys(source_key PRIMARY KEY, type_id UNIQUE REFERENCES credit_types)`: trimmed, case-normalized original CSV header maps to the stable existing category. Existing display heading and Markdown survive restock. Backfill from `credit_batch_columns.source_heading`, or the legacy category name.
- `credit_code_history(fingerprint PRIMARY KEY, inventory_id UNIQUE, type_id, source_key, first_seen_at, assigned, exposed)`: retain hashes and consumed/exposed booleans after active inventory/category deletion. No recipient ID, email, assignment time, raw code or cascading foreign key. Stock identity fields cannot change; consumed/exposed flags may advance once. Existing inventory and assignments backfill atomically.
- `credit_stock_imports(digest PRIMARY KEY, created_at, result JSON text)`: an atomic idempotency receipt containing IDs/counts only, never CSV or codes.
- Add global unique inventory fingerprint protection and assignment-history triggers. A deleted or previously exposed code cannot silently become fresh stock for another recipient. Existing category/person and inventory assignment uniqueness remains.

An upgrade with duplicate canonical headers or global fingerprints must abort atomically for explicit manual review. It must never merge/delete existing categories or reassign a code automatically. This lane will not inspect or migrate a hosted database.

## Commands and views

`preview-credit-batch` remains an internal preparation call, with no new preview page. It retains the existing15-minute actor-bound preparation receipt and audit metadata, with no raw CSV/code and no allocation. It returns a count-bound digest, column mappings (`new` or `restock`), added/duplicate/retired counts, preserved heading/Markdown and no raw values. The UI can show the exact restock count in its existing confirmation.

`publish-credit-batch` accepts the existing CSV/column/digest shape and `PUBLISH_CREDIT_BATCH`. Its transaction creates only genuinely new categories, appends deduplicated stock to existing categories, retains active publication, fills waiting recipients and records the idempotency receipt/audit. Same-file retries do not add stock or repeat assignment.

`repair-credit-allocations` is an explicit staff action, not polling. Shared assignment SQL runs within publish/restock/check-in/manual Checked in transactions. It pairs current personal checked-in recipients lacking a category assignment with available stock, using stable order. It never removes existing assignments on uncheck-in or recheck-in. Allocation does not depend on role, team, completed profile, extra roster membership or another participant's approval. The existing definition of current personal check-in remains the attendance authority.

`/personal/credits` is a self-only GET projection for every role, independent of team/profile presentation. `reveal-credit {typeId}` continues to bind the allocation to the current identity and recipient email, requires current personal check-in and accepts no other user ID. Remove the separate judge exclusion and duplicate approval/roster gate. Existing removed-user protection remains.

Staff-only GET view `/admin/credit-stock/<typeId>[/assigned|available]` uses existing `q`/`page` parameters and a bounded25-row page. Rows contain inventory ID, person/email where assigned, masked code, assignment time and Assigned/Available status. Counters are Total, Assigned, Available, Waiting and exhausted. `/admin/credits` category/batch summaries expose the same counters. No raw code is included by default.

`admin-reveal-credit {inventoryId}` is an explicit owner/admin action returning one value, with only masked/ID metadata in audit. Copy uses that explicit reveal response. It does not send mail or claim redemption.

Existing delete-column/delete-batch confirmation contracts remain. Remove active mappings, stock and category keys, retain code hashes/assignment tombstones and idempotency receipts. Audit stores counts and at most five masked source rows per column; no raw codes, CSV or voucher-bearing instructions leak.

## Verification and impact

Test both SQLite and PostgreSQL adapter semantics:50 stock with10 checked in gives10 Assigned/40 Available;10 later check-ins gives20/30; append100 fills any waiting recipients without republishing. Cover exhaustion, multiple categories, same/later/cross-category duplicates, publish/import retries, concurrent check-ins, manual attendance overrides, staff personal credits, nonchecked-in and cross-user denial, masked pagination/reveal authorization, deletion and no recycling. Preserve quick check-in Going-only CAS, one attendance audit and legacy allocation retries. Include the independently reproduced legacy check-in retry/absence-override regression.

No UI, SMTP, authentication/provider migration or heavy dependency changes are included. Root will review the schema/contract proposal before broad integration, assign the UI separately, rebuild the archive after validated integration, and retain manual publication/deployment.

## Retention and exact attendance boundary

The effective attendance predicate is the existing portal definition: current approved registration, no active participant removal, a Checked in status override or no conflicting override, and an existing check-in row or manual attendance bound to the current verified email. No role, team, profile-completion or additional roster predicate is added for personal credits. Only self `reveal-credit` bypasses the generic Viewer mutation gate, then applies this attendance predicate and allocation recipient/email binding. Every unrelated Viewer command remains denied.

Recipient identity/email and assignment time remain only in active `credit_allocations`, covered by eventual reviewed90-day post-event private-data cleanup. That reviewed cleanup can remove active mappings and their inventory together while retaining non-personal hash/consumed tombstones. No automatic90-day deletion job is introduced. New hash history has no recipient association; new import receipts have no actor/recipient association or raw CSV/code. Existing owner-only audit retention is a separate policy and is not changed here.
