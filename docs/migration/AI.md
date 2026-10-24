# OpenAI evidence evaluation

The user approved sending project descriptions, explicitly selected source files and commit metadata to OpenAI for project evaluation. Credentials, redemption/voucher codes, phone numbers and unrelated participant profiles remain excluded. The user chose to reuse a key entered manually in the Cloud/backend environment. No key is available in this execution environment (`OPENAI_API_KEY_PRESENT=no`); no live provider request has been made. This implementation and its tests use only synthetic fixtures.

## Backend contract

```ts
import { createOpenAIEvaluator, readApprovedSnapshot } from "../../neon/ai";

const evaluator = createOpenAIEvaluator(env, {
  resolveApprovedSnapshot: (versionId) => readApprovedSnapshot(db, versionId),
});
// Inject evaluator into PortalService through the backend runtime.
```

The factory returns the existing `Evaluator` interface. Its optional `fetch` dependency is a server-controlled offline test seam; participant requests cannot select a provider, model, endpoint or transport. It uses Node.js native fetch and the existing Zod dependency; no new package is required.

Backend configuration requires all three values before a snapshot is read:

- `PORTAL_OPENAI_EVALUATION_APPROVED=true`: explicit server configuration recording the approved data/destination scope.
- `OPENAI_API_KEY`: manually supplied backend-only credential. Never retrieve it from Sites, another environment, browser variables or participant input.
- `OPENAI_MODEL`: explicitly selected model with Responses API Structured Outputs support. There is no model default, invented Astra model ID or automatic provider fallback. Actual model availability still requires a credentialed test.

The code pins `https://api.openai.com/v1/responses`, rejects redirects, sets `store:false`, and enables no tools, streaming or conversation continuation. `store:false` is a request setting, **not a claim of zero retention**; organization settings and applicable abuse-monitoring rules still apply. Credentials stay in the Authorization header and are excluded from project JSON and reports.

## Explicit approval and immutable input

`evaluate(versionId, payload)` reads only `payload.commitSha` for binding. It never transmits the participant payload itself, which may contain media, contributions or unrelated fields. The trusted resolver supplies a separate strict object:

```ts
type ApprovedEvaluationSnapshot = {
  versionId: string;
  commitSha: string; // normalized full 40-character SHA
  approved: true;
  approvedPaths: string[]; // exact list approved by an authorized admin
  descriptions: {
    description: string;
    projectName?: string;
    problemSolution?: string;
    features?: string;
    gtm?: string;
  };
  files: {
    path: string;
    content: string;
    commitSha: string;
    sha256: string; // SHA-256 of exact UTF-8 content
  }[];
  commit: { sha: string; committedAt?: string };
};
```

Unknown fields at every level are rejected. Version, top-level commit, commit metadata and each file must match the immutable job version/SHA. Selected paths and supplied files must match exactly, with no duplicates. Digests detect content changes after approval; the authorized reviewer must first verify that the selected content actually belongs to the recorded repository commit. A self-declared SHA or `approved:true` in participant input does not establish approval or repository authenticity.

Only relative text-source paths with approved extensions are accepted. Hidden directories, traversal, encoded paths, credential/secret/token files, contact/profile/voucher directories, binaries and dependency lockfiles are rejected. Inputs are capped at 24 files, 32 KiB per file, 128 KiB total file content and 16 KiB descriptions, with a 192 KiB final request bound.

Conservative screening rejects recognizable provider keys, private keys, credentialed URLs, JWTs, hardcoded credential assignments, bearer tokens, voucher assignments, email contacts, phone-shaped numbers and control/obfuscation characters. Common escaped/percent-encoded forms are screened too. Source references such as `process.env.OPENAI_API_KEY` can pass without their runtime values. Screening cannot certify arbitrary text as non-sensitive: the exact manifest and contents must be reviewed before approval. Rejected material requires a new clean selection; the evaluator never silently strips a secret and sends the rest.

## Durable approval repository

`prepareApprovedSnapshot(input, {versionId,commitSha})` validates and returns `{snapshotJson,snapshotSha256,commitSha}`. It performs no write or authorization itself. Call it only after an authenticated operational admin is authorized for the project/version and the commit is bound to existing immutable repository evidence.

`readApprovedSnapshot(db, versionId)` reads an unrevoked record, verifies the stored JSON digest, and revalidates the embedded version/SHA and allowlist. Missing/revoked records return null; corrupted/unavailable storage fails with a fixed error. The versioned0101 migration and authenticated POST /api/evaluation/snapshots route enforce current admin authorization and current published repository evidence. POST /api/evaluation/snapshots/revoke makes approval permanently inactive. Records and source contents remain in private Postgres; audits include only the digest and selected-file count. The table is:

```sql
CREATE TABLE approved_evaluation_snapshots (
  version_id TEXT PRIMARY KEY REFERENCES submission_versions(id),
  commit_sha TEXT NOT NULL,
  snapshot_json TEXT NOT NULL,
  snapshot_sha256 TEXT NOT NULL,
  approved_by TEXT NOT NULL REFERENCES users(id),
  approved_at TEXT NOT NULL,
  revoked_at TEXT
);
```

Keep all columns immutable except one-way revocation, with the integrator's schema/trigger conventions. Store JSON as TEXT so its exact digest remains stable. Never commit approved project contents to Git, automatically fetch a repository or accept an unprivileged client's approval flag. Description-only evaluation can use an empty approved path/file list while retaining version/SHA binding.

## Output, timeout and failure behavior

The Responses request uses `text.format` with a strict JSON schema and `additionalProperties:false`. Provider output must be completed, have one JSON output message, contain no tool calls or refusals, bind to the same version/SHA, and cite only approved descriptions, commit fields or valid lines in selected files. Unexpected fields, numeric scores, finalization, unsupported statuses, invalid references, duplicate review areas or sensitive-looking output are rejected.

The final report always has `status:"needs_review"`, `dimensions:null` and `suspectedFalseClaims:[]`. Model observations are `UNKNOWN` or `NEEDS_MANUAL_REVIEW`. The sole automatic PASS establishes locally checked snapshot binding; it does not establish runtime behavior, provider success, eligibility or authorship. The existing scoring formula and human review requirements are unchanged.

Provider calls have at most two 20-second attempts, with a 200 ms retry delay, and at most 3,000 output tokens/128 KiB response content. Only explicit HTTP 429/500/502/503/504 failures retry once. Authentication/validation failures, refusals, malformed output, network errors and ambiguous timeouts are not automatically retried. Provider bodies, submitted contents, credentials and raw validation details are never retained in thrown errors. Job processing can preserve the submission and offer an authorized retry/fallback through existing service behavior.

## Validation and remaining live check

Run `tsx --test tests/neon-ai.test.ts`. Tests inject every fetch response and never contact OpenAI, SMTP, OAuth, GitHub or a repository. They cover data projection/exclusion, immutable bindings, strict input/output, sensitive-content rejection, path/size bounds, transport controls, retry limits, redacted failures and durable snapshot digest/revocation reads.

The authorized real evaluation test remains pending in a fresh runtime where the manually configured key is present, an explicit supported model is configured, root integration is installed and the exact clean snapshot is approved. No provider success or deployment is claimed by the offline tests. The one approved login email test is separate from this evaluator and is not sent by this workstream.

Official references checked for this implementation:

- [Responses API](https://developers.openai.com/api/reference/resources/responses/methods/create)
- [Structured Outputs, refusals and incomplete responses](https://developers.openai.com/api/docs/guides/structured-outputs)
- [OpenAI data controls and Responses storage](https://developers.openai.com/api/docs/guides/your-data)

Runtime integration injects the evaluator only when the explicit server flag is true. Provider batches are limited to one job per explicit request, while offline fixture batches retain their existing maximum of five. The Neon handler awaits bounded processing in that same invocation; durable leases/results remain in Postgres. There is no automatic cron or in-memory background loop. Provider evidence is labeled `provider` with its explicit model configuration while numeric scores stay null, so reveal prerequisites are not fabricated.

An explicitly approved one-request synthetic smoke is available with `PORTAL_OPENAI_SMOKE_APPROVED=1 node --env-file=.env.backend.local --import tsx neon/scripts/evaluation-smoke.ts`. It requires the explicit model/key, reads no repository or user records, permits at most one outbound request (including retries), and prints metadata only. The real project evaluation flow still requires a reviewed selected snapshot.
