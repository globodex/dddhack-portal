# PostgreSQL portal database

`createNeonDatabase(env)` in `index.ts` implements the existing `lib/db.ts`
contract. It uses a backend-only native `pg` pool (maximum five connections),
prefers `DATABASE_URL_UNPOOLED` for interactive transactions, and falls back to
`DATABASE_URL`. A Node Function can reuse one module-scope adapter. Call
`db.close()` when its owning process shuts down, not after every request.
Never expose either database URL to Next.js browser code.

Every operation runs on one connection in a SERIALIZABLE transaction. A batch
commits all statements together. The exact `INSERT INTO write_guards
VALUES(?,changes())` assertion receives the preceding direct mutation's
`rowCount`; trigger writes do not inflate it. A zero/multiple-row assertion fails
the existing `valid=1` constraint and rolls back the complete batch. Guards
cannot run standalone, after a read, or in a foreign adapter's batch. Only known
aborted PostgreSQL serialization failures (`40001`) and deadlocks (`40P01`) are
retried (six retries, bounded backoff). Connection errors and uncertain COMMIT
outcomes are returned without replay. Service request keys/receipts still govern
client retries.

The migrations require SERIALIZABLE for **all** portal table mutations,
including callers using Drizzle/direct SQL. This preserves SQLite's protection
against concurrent predicate/count races. The inherited `scoring_revision`
triggers also serialize scoring changes and reject stale frozen snapshots.
Serialization contention is a capacity consideration; local tests do not establish
hosted latency or load capacity.

## Schema and migration order

1. `0000_compatibility.sql`: citext and narrowly scoped JSON/string/time helpers.
2. `0001_portal.sql`: all 63 final portal tables, constraints and explicit indexes.
3. `0002_invariants.sql`: all 191 active final SQLite trigger guards converted to
   PostgreSQL trigger functions, including immutable attempts/audits/history,
   personal leader attendance, third-attempt lock, locked Crown transfer, removals,
   credit ownership, engagement pauses, and frozen result revisions.
4. `0003_transaction_safety.sql`: SERIALIZABLE enforcement for all portal tables.
5. `0004_media_uploads.sql`: revision-scoped private upload receipts and state checks.
6. Apply the separately reviewed `neon/auth-migrations` after the portal tables.
   Auth and storage runtime modules do not implicitly run DDL.

This is an **empty database baseline**. No SQLite/production records or secrets
are read, exported or copied. `baseline-manifest.json` records SHA-256 hashes of
all historical SQLite migrations and the final table/index/trigger names.
`python3 neon/scripts/build-baseline.py` regenerates only `0001`, `0002` and the
manifest by applying historical DDL to in-memory SQLite. Review any output diff.
The historical migrations remain unchanged.

`schema.ts` is the PostgreSQL Drizzle model. Preserve the reviewed SQL migrations
as the source for invariant functions/triggers. Do not use `drizzle-kit push` to
replace the baseline: it cannot recreate those functions/triggers. For future
changes generate with `neon/drizzle.config.ts`, review SQL and author the matching
invariants explicitly before applying it. `applyPortalMigrations` uses a transaction,
an advisory migration lock, SHA-256 validation, an append-only ordering check and
a ledger; changes to applied migration checksums fail closed.

JSON and timestamps remain TEXT, flags remain INTEGER, scores use DOUBLE
PRECISION, and text identity IDs remain unchanged. Only the existing NOCASE
columns (users.email, registrations.email, teams.name) use CITEXT; the referencing
registration_absences.email also uses CITEXT. CITEXT uses the PostgreSQL locale
for non-ASCII folding, while SQLite NOCASE folds ASCII; a future approved import
must check non-ASCII name/email collisions before moving records. The scoped
locked-team rename check explicitly compares text with the `C` collation.

Generated monotonic integer `rowid` columns exist only on credit_inventory,
project_review_history and project_feedback_reviews to retain stock ordering and
latest append-only review selection. They are trailing migration columns so
existing positional INSERT statements keep their defaults and order.

## Runtime SQL compatibility

The lexer translates positional `?` parameters without touching SQL literals,
keeps camelCase result aliases, quotes the `window` column, converts known
`json_extract`, `json_each`, `json_array`, `json_valid` and `instr` calls, and casts
complete directory NOCASE expressions to CITEXT. Two exact source query forms
repair SQLite's permissive team GROUP BY and unqualified request bucket upsert;
the existing boolean SUM in teamGoing uses an explicit CASE. PostgreSQL int8
counts become safe JavaScript numbers (overflow throws); selected boolean
expressions become SQLite-compatible 0/1.

Supported JSON extraction paths are one property (`$.identifier`), and JSON
iteration accepts arrays only. Submission instants require an explicit ISO
8601 timezone and reject malformed/ambiguous values. Multi-statement SQL, runtime
DDL, comments, transaction control, PRAGMA, INSERT OR, arbitrary changes(),
unsupported collations and unrecognized function calls fail before
connection acquisition. This is a compatibility adapter for trusted portal SQL,
not a general SQLite emulator or a query endpoint. New SQL needs an explicit
compatibility review and engine test.

## Offline and local verification

Dependencies: runtime `pg`, existing `drizzle-orm`; development `@types/pg`,
`@electric-sql/pglite`, existing `drizzle-kit`, `tsx` and TypeScript.
The PGlite fixture loads its real citext extension and applies the same SQL;
there is no altered test schema. PGlite has one connection and does not prove
multi-connection concurrency. `tests/neon-db-native.test.ts` additionally uses an
opt-in **loopback-only** native PostgreSQL URL and creates/drops a unique synthetic
schema. It tests simultaneous revision guards, five-member capacity, three votes,
ten synchronized attempt writers with snapshots established before MAX+1, and
competing frozen snapshots.

```sh
node --import tsx --test tests/neon-db*.test.ts
PORTAL_TEST_POSTGRES_URL=postgresql://synthetic@127.0.0.1:5432/postgres \
  node --import tsx --test tests/neon-db*.test.ts
node --import tsx neon/scripts/migrate.ts
```

The migration script defaults to checksum inspection and performs no writes.
Applying a separately approved empty/synthetic target requires both
`--apply-synthetic` and `PORTAL_SYNTHETIC_DATABASE=1` with
`DATABASE_URL_UNPOOLED`. The optional seed script additionally refuses remote
hosts and nonempty users, and inserts only the existing nonredeemable `.test`
fixtures. No account, project, branch, deployment or scheduler is provisioned.

Driver reference: [Neon connection methods](https://neon.com/docs/connect/choose-connection).
