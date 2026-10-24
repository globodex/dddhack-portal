# Neon project media storage

Implemented in `neon/storage/`. No bucket, CORS rule, credential, deployment, production record or scheduled runner is created by this module. The selected backend contract is one **private** `project-media` bucket (`NEON_MEDIA_BUCKET`), with `logos/` and `banners/` prefixes. This supersedes the earlier two-bucket draft in SETUP.md.

## Backend wiring

```ts
import {
  createMediaDatabase,
  createNeonStorageClient,
  createS3ObjectStore,
  createProjectMediaStorage,
  createDatabaseMediaRepository,
  createPortalMediaAuthorizer,
  createStorageApiHandler,
} from "./storage";

const objectStore = createS3ObjectStore(createNeonStorageClient(env));
const db = createMediaDatabase(baseDatabase, {
  objectStore,
  mediaBucket: env.NEON_MEDIA_BUCKET ?? "project-media",
});
// Pass db to the existing PortalService and publicProjectImage paths.
// Pass baseDatabase to the media receipt repository.
```

Only the Neon backend receives the injected `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_ENDPOINT_URL_S3` and `AWS_REGION`. Missing/invalid configuration fails closed. No storage secret belongs on Vercel or in `NEXT_PUBLIC_*`. Neon supplies these variables in Functions; the client explicitly sets path-style addressing. [Neon authentication](https://neon.com/docs/storage/authentication)

Runtime dependencies, coordinated with the sole package owner: `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` (tested at 3.1156.0), and `sharp` (tested at 0.35.5). Node.js 24 is used in offline verification. Neon Function packaging must declare `externalPackages: ["sharp"]` so its Linux ARM64 glibc native files ship separately from the JavaScript bundle; the default single-file bundle cannot contain a native addon. This remains a packaging rehearsal item before any approved deployment. [Neon native binaries reference](https://github.com/neondatabase/agent-skills/blob/main/skills/neon-functions/SKILL.md#native-binaries-and-custom-builds)

## Existing UI compatibility and private persistence

`createMediaDatabase(baseDatabase, { objectStore, mediaBucket })` implements the existing `Database` interface. Existing service authorization, payload schemas, project revision guards and submission transaction guards remain responsible for access control. Wrap only the backend service database after synthetic fixture seeding.

The decorator externalizes PNG/JPEG data URIs in the exact current runtime project draft INSERT/UPDATE and submission version INSERT statements. It fully decodes each bounded image, retains the original bytes, and writes a new server-only object key. The persisted JSON contains a strict versioned reference with bucket, kind, object key, MIME, byte length, dimensions and SHA-256. Client-supplied reference objects are rejected. Other scalar fields, immutable version behavior and request hashes are preserved. Unknown project payload write forms fail closed and must be explicitly reviewed if runtime SQL changes.

Reads of `draft` and `payload` from project/submission queries restore original data URIs after validating the reference's exact shape, configured bucket, key namespace, raster MIME, length, digest, dimensions and signature. Existing inline data URI rows remain readable. Object fetches happen after the original SQL query; an ineligible public image query returns no row and fetches no private image. Public responses keep the existing PNG/JPEG, `nosniff`, sandbox CSP and private/no-store headers.

Within one submission transaction, draft and version copies share two object writes. Upload failures prevent the DB transaction from starting. A transaction that later rolls back can leave private orphan objects, because S3 and Postgres do not share a transaction. No automatic cleanup runs. Any future cleanup must preserve every object referenced by draft JSON, immutable submission JSON and durable receipts, and use a conservative grace period for in-flight writes. There is no cross-request cache or durable state in process memory.

## Optional direct signed-upload API

`createStorageApiHandler({ appOrigin, authenticate, storageFor })` exports two backend handlers. It returns `null` for unrelated paths so the integrator can compose it into `neon/api.ts`. `authenticate` must use verified server-side identity. Construct a request-scoped `PortalService` and `createPortalMediaAuthorizer(service)` in `storageFor`; use `createDatabaseMediaRepository(baseDatabase)` for durable claims. Origins are compared to configured `APP_ORIGIN`, currently `https://dddhack-portal.vercel.app`; browser requests go through the same-origin Next `/api/*` proxy.

| Endpoint                   | JSON body                         | Result                                                    |
| -------------------------- | --------------------------------- | --------------------------------------------------------- |
| POST `/api/media/uploads`  | `{ teamId, revision, kind: "logo" | "banner", contentType: "image/png"                        | "image/jpeg", byteLength }` | `{ uploadId, url, method: "PUT", headers, expiresAt, finalizeBefore }` |
| POST `/api/media/finalize` | `{ uploadId, teamId, revision }`  | `{ receiptId, teamId, revision, kind, expiresAt, image }` |

Both routes require exact allowed Origin, authenticated identity, JSON, and a streamed 4 KiB request-body limit. SDK errors are redacted. Upload issuance checks current approved team leadership, completed participant profile, personal check-in, open submission access, remaining attempts, removal state, frozen results and exact current draft revision. Finalization and receipt resolution repeat those checks.

Signed PUT expires after **90 seconds**, targets only a fresh server-generated staging key, and signs `Content-Type` plus `Content-Length`. Browser JavaScript passes the returned headers and Blob to `fetch`; the browser sets Content-Length automatically. The declaration is limited to **32–131072 bytes**. No client-selected bucket, key or fetch URL is accepted. Before browser direct PUT is enabled, the approved bucket configuration must permit PUT CORS from the exact frontend origin; this task does not change that configuration.

Neon documents SigV4 signed GET/PUT and configurable expiry, path-style addressing, core Get/Put operations, custom metadata and CORS. Its object versioning and lifecycle rules are not enforced. [Neon S3 compatibility](https://neon.com/docs/storage/s3-compatibility)

Finalization must finish within five minutes of issuance. It obtains an atomic durable 60-second claim, downloads at most 128 KiB plus an overflow sentinel, and compares both declared and actual size and content type. It checks PNG/JPEG signatures, fully decodes pixels with a 4096×4096 limit, rejects animation/truncation, enforces square logos or 16:9 banners and existing 64–4096 dimensions, then strips metadata and encodes one canonical raster. The resulting raster also remains within 128 KiB.

The finalizer writes the actual validated bytes to a **different** unique server-only object key. It never copies or binds the mutable presigned staging object. Reusing a still-valid PUT cannot replace a published object. A second authorization check precedes the durable receipt update. Lost claims cannot complete; repeating a successfully finalized request returns the same receipt. Ready receipts expire after thirty minutes. SHA-256 is verified again whenever the server restores image bytes.

## Durable receipt migration and version binding

`repository.ts` exports `mediaTableDDL` as reference DDL for the numbered Postgres migration owner. It defines `portal_media_uploads`, with actor/team/revision, expected MIME/size, staging key, state/claim lease, immutable image metadata, expiry and consumed version, plus an expiry index. The module never runs DDL implicitly. The signed API requires this table; the database decorator does not.

`mediaConsumeStatements({ actorId, teamId, revision, versionId, receipts, now })` returns guarded SQL for the existing `PortalService.mutate` batch. Append it **after** the submission version INSERT and project revision increment in that same transaction. `receipts` is an array of one or two `{ receiptId, kind }` records; duplicate IDs/kinds are rejected. The helper validates durable receipt ownership and exact original revision, expiry, unconsumed ready state, current leader membership/personal check-in, record removals, unfrozen results, target version's team, and the incremented project revision. `assertPreviousWrite()` turns any mismatch into a rollback of the entire submission. Existing submission authorization and validation must still run before the batch.

For optional signed-API integration, `storage.resolveReceipt(actorId, { uploadId, teamId, revision, kind })` reads validated metadata. `storage.receiptDataUri(...)` is a server-only bridge to the existing draft schema. The integrator must call the transaction helper if it binds a receipt to a committed version. The default database-decorator integration needs no client receipt fields or UI changes.

## Verification and limits

`npx tsx --test tests/neon-storage*.test.ts` passes **20 offline synthetic tests**. Coverage includes real existing save/submit commands and replay, private persistence, eligible public image access, checked-in leader authorization, wrong actor/revision/version, transaction rollback, claim recovery, request limits, signed header configuration, malformed raster bytes, MIME/length mismatch, object tampering and mutable-staging replacement. Storage and test sources also pass isolated strict TypeScript checking. No real object service, secret or production record is used.

Neon's platform ceilings are 5 GiB for a single upload, 10 GiB multipart and 5 GB/project on the Free plan. They do not change this application's 128 KiB cap. The SDK uses bounded retries for transient responses; the platform may return `503 SlowDown`. [Neon storage limits](https://neon.com/docs/storage/overview#limits)

No AI provider code or model call is added. Any future AI evaluation or cleanup work must use explicitly invoked, authenticated durable jobs with lease ownership, retries and idempotency; activation, approved data destinations and provider credentials remain separate gates. No background loop, cron or trigger is activated here.
