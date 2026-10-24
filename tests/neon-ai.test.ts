import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { LocalDatabase } from "../lib/local-test/sqlite";
import { reportSchema } from "../lib/evaluation";
import {
  createOpenAIEvaluator,
  evaluationLimits,
  OPENAI_RESPONSES_ENDPOINT,
  prepareApprovedSnapshot,
  readApprovedSnapshot,
  validateApprovedSnapshot,
  type ApprovedEvaluationSnapshot,
  type OpenAIEvaluationEnv,
} from "../neon/ai";

const versionId = "synthetic-version",
  sha = "a".repeat(40);
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const source =
  'export function greeting() {\n  return "Hello from a synthetic project";\n}\n';
const env: OpenAIEvaluationEnv = {
  PORTAL_OPENAI_EVALUATION_APPROVED: "true",
  OPENAI_API_KEY: "synthetic-server-only-credential-1234567890",
  OPENAI_MODEL: "explicit-offline-fixture-model",
};
function snapshot(): ApprovedEvaluationSnapshot {
  return {
    versionId,
    commitSha: sha,
    approved: true,
    approvedPaths: ["src/main.ts"],
    descriptions: {
      projectName: "Synthetic project",
      description: "A small demonstration that greets a visitor.",
      features: "Displays a friendly greeting.",
    },
    files: [
      {
        path: "src/main.ts",
        content: source,
        commitSha: sha,
        sha256: hash(source),
      },
    ],
    commit: { sha, committedAt: "2026-11-01T03:00:00Z" },
  };
}
function modelOutput() {
  return {
    versionId,
    revision: sha,
    observations: [
      {
        area: "functionality",
        status: "NEEDS_MANUAL_REVIEW",
        explanation:
          "The selected source defines a greeting function; runtime behavior requires human review.",
        evidence: [{ source: "src/main.ts", startLine: 1, endLine: 3 }],
      },
    ],
  };
}
function providerResponse(
  result: unknown = modelOutput(),
  overrides: Record<string, unknown> = {},
) {
  return Response.json({
    id: "resp_synthetic",
    status: "completed",
    model: env.OPENAI_MODEL,
    error: null,
    incomplete_details: null,
    output: [
      {
        type: "message",
        role: "assistant",
        status: "completed",
        content: [{ type: "output_text", text: JSON.stringify(result) }],
      },
    ],
    ...overrides,
  });
}
function setup(
  options: {
    snapshot?: unknown;
    env?: OpenAIEvaluationEnv;
    fetch?: typeof fetch;
  } = {},
) {
  const requests: { url: string; init: RequestInit }[] = [];
  let reads = 0;
  const evaluator = createOpenAIEvaluator(options.env || env, {
    resolveApprovedSnapshot: async () => {
      reads++;
      return (
        options.snapshot === undefined ? snapshot() : options.snapshot
      ) as ApprovedEvaluationSnapshot | null;
    },
    fetch: async (input, init) => {
      requests.push({ url: String(input), init: init! });
      return options.fetch ? options.fetch(input, init) : providerResponse();
    },
  });
  return { evaluator, requests, reads: () => reads };
}
const rejected = (code: string) => (error: unknown) =>
  error instanceof Error &&
  error.message === code &&
  !error.stack?.includes("sensitive-provider-diagnostic");

test("OpenAI evaluation requires explicit approval, backend key and model before reading or transmitting data", async () => {
  for (const change of [
    { PORTAL_OPENAI_EVALUATION_APPROVED: undefined },
    { PORTAL_OPENAI_EVALUATION_APPROVED: "TRUE" },
    { OPENAI_API_KEY: undefined },
    { OPENAI_MODEL: undefined },
    { OPENAI_MODEL: "https://untrusted.example/model" },
  ]) {
    const f = setup({ env: { ...env, ...change } });
    await assert.rejects(
      f.evaluator.evaluate(versionId, { commitSha: sha }),
      rejected("OPENAI_NOT_CONFIGURED"),
    );
    assert.equal(f.reads(), 0);
    assert.equal(f.requests.length, 0);
  }
});

test("provider request uses only approved evidence, a pinned endpoint, store:false and strict structured output", async () => {
  const f = setup();
  const report = await f.evaluator.evaluate(versionId, {
    commitSha: sha,
    phone: "UNAPPROVED-PHONE-MARKER",
    contributions: [{ name: "UNRELATED-PROFILE-MARKER" }],
    voucher: "UNAPPROVED-VOUCHER-MARKER",
    ignoredSecret: "UNAPPROVED-CREDENTIAL-MARKER",
    github: "https://untrusted.example/repo",
  });
  assert(reportSchema.safeParse(report).success);
  assert.equal(report.status, "needs_review");
  assert.equal(report.dimensions, null);
  assert.deepEqual(report.suspectedFalseClaims, []);
  assert.equal(report.revision, sha);
  assert.equal(report.model, env.OPENAI_MODEL);
  assert.equal(report.checks[1].status, "NEEDS_MANUAL_REVIEW");
  assert.deepEqual(report.checks[1].evidence, ["src/main.ts:L1-L3"]);
  assert.equal(f.requests.length, 1);
  const { url, init } = f.requests[0];
  assert.equal(url, OPENAI_RESPONSES_ENDPOINT);
  assert.equal(url, "https://api.openai.com/v1/responses");
  assert.equal(init.redirect, "error");
  assert.equal(init.credentials, "omit");
  assert.equal(init.referrerPolicy, "no-referrer");
  assert(init.signal instanceof AbortSignal);
  const body = JSON.parse(String(init.body));
  assert.equal(body.model, env.OPENAI_MODEL);
  assert.equal(body.store, false);
  assert.equal(body.stream, false);
  assert.equal(body.max_output_tokens, evaluationLimits.outputTokens);
  assert.deepEqual(body.tools, []);
  assert.equal(body.tool_choice, "none");
  assert.equal(body.text.format.type, "json_schema");
  assert.equal(body.text.format.strict, true);
  assert.equal(body.text.format.schema.additionalProperties, false);
  const project = JSON.parse(body.input[0].content[0].text);
  assert.deepEqual(Object.keys(project).sort(), [
    "commit",
    "commitSha",
    "descriptions",
    "files",
    "versionId",
  ]);
  assert.deepEqual(Object.keys(project.files[0]).sort(), ["content", "path"]);
  for (const excluded of [
    "UNAPPROVED-",
    "UNRELATED-",
    env.OPENAI_API_KEY!,
    "untrusted.example",
    "approvedPaths",
  ])
    assert(!String(init.body).includes(excluded));
  assert(!JSON.stringify(report).includes(source));
});

test("missing or stale snapshot/version/SHA/file digest fails closed without a provider call", async () => {
  const variants: unknown[] = [
    null,
    { ...snapshot(), versionId: "stale" },
    { ...snapshot(), commitSha: "b".repeat(40) },
    { ...snapshot(), commit: { sha: "b".repeat(40) } },
    { ...snapshot(), approved: false },
    {
      ...snapshot(),
      files: [{ ...snapshot().files[0], commitSha: "b".repeat(40) }],
    },
    {
      ...snapshot(),
      files: [{ ...snapshot().files[0], content: "modified after approval" }],
    },
  ];
  for (const value of variants) {
    const f = setup({ snapshot: value });
    await assert.rejects(f.evaluator.evaluate(versionId, { commitSha: sha }));
    assert.equal(f.requests.length, 0);
  }
  const invalid = setup();
  await assert.rejects(
    invalid.evaluator.evaluate(versionId, { commitSha: "branch-name" }),
  );
  assert.equal(invalid.reads(), 0);
});

test("strict snapshot allowlist rejects unrelated records and metadata fields", async () => {
  const values: unknown[] = [
    { ...snapshot(), profiles: [] },
    { ...snapshot(), phone: "SENSITIVE" },
    {
      ...snapshot(),
      descriptions: {
        ...snapshot().descriptions,
        participantEmail: "SENSITIVE",
      },
    },
    { ...snapshot(), commit: { sha, authorEmail: "SENSITIVE" } },
    { ...snapshot(), files: [{ ...snapshot().files[0], token: "SENSITIVE" }] },
    { ...snapshot(), approvedPaths: [] },
    { ...snapshot(), files: [] },
    { ...snapshot(), approvedPaths: ["src/main.ts", "src/main.ts"] },
    { ...snapshot(), files: [snapshot().files[0], snapshot().files[0]] },
  ];
  for (const value of values) {
    const f = setup({ snapshot: value });
    await assert.rejects(
      f.evaluator.evaluate(versionId, { commitSha: sha }),
      rejected("OPENAI_INPUT_REJECTED"),
    );
    assert.equal(f.requests.length, 0);
  }
});

test("selected source rejects sensitive filenames, traversal, encoded paths, binaries and hidden directories", async () => {
  for (const path of [
    "../private.ts",
    "/src/main.ts",
    "src\\main.ts",
    "src/%2e%2e/main.ts",
    ".env",
    ".env.local",
    ".git/config",
    "keys/private.pem",
    "credentials.json",
    "src/secrets.ts",
    "src/token.json",
    "profiles/user.json",
    "vouchers/codes.txt",
    "node_modules/dependency.js",
    "image.png",
    "src/1234567890.ts",
  ]) {
    const input = snapshot();
    input.approvedPaths = [path];
    input.files[0].path = path;
    const f = setup({ snapshot: input });
    await assert.rejects(
      f.evaluator.evaluate(versionId, { commitSha: sha }),
      rejected("OPENAI_INPUT_REJECTED"),
      path,
    );
    assert.equal(f.requests.length, 0);
  }
});

test("secret-shaped credentials, personal contacts, phones and voucher material never reach fetch", async () => {
  const sensitive = [
    "sk-proj-" + "S".repeat(30),
    "AKIA" + "A".repeat(16),
    "ghp_" + "a".repeat(30),
    "postgres://user:private-password@db.example.test/portal",
    "-----BEGIN PRIVATE KEY-----",
    'const apiKey = "sensitive-value";',
    'const AUTH_SECRET = "sensitive-value";',
    'const accessToken = "sensitive-value";',
    'const voucherCode = "ABCD-EFGH-1234";',
    "Contact person@private.example",
    "Phone: +1 (202) 555-0199",
    "Bearer " + "B".repeat(30),
    "sk%2dproj%2d" + "S".repeat(30),
    "sk\\u002dproj\\u002d" + "S".repeat(30),
    "binary\u0000payload",
    "obfuscated\u200btext",
  ];
  for (const content of sensitive) {
    const input = snapshot();
    input.files[0].content = content;
    input.files[0].sha256 = hash(content);
    const f = setup({ snapshot: input });
    await assert.rejects(
      f.evaluator.evaluate(versionId, { commitSha: sha }),
      rejected("OPENAI_INPUT_REJECTED"),
    );
    assert.equal(f.requests.length, 0);
  }
  const description = setup({
    snapshot: {
      ...snapshot(),
      descriptions: { description: "Contact person@private.example" },
    },
  });
  await assert.rejects(
    description.evaluator.evaluate(versionId, { commitSha: sha }),
  );
  assert.equal(description.requests.length, 0);
});

test("source references to environment variables remain usable without exposing their runtime values", async () => {
  const input = snapshot();
  input.files[0].content =
    "const client = new OpenAI({apiKey:process.env.OPENAI_API_KEY});";
  input.files[0].sha256 = hash(input.files[0].content);
  const f = setup({
    snapshot: input,
    fetch: async () =>
      providerResponse({
        versionId,
        revision: sha,
        observations: [
          {
            area: "openai",
            status: "UNKNOWN",
            explanation:
              "An environment reference cannot establish successful API execution.",
            evidence: [],
          },
        ],
      }),
  });
  assert.equal(
    (await f.evaluator.evaluate(versionId, { commitSha: sha })).checks[1]
      .status,
    "UNKNOWN",
  );
});

test("file count, byte sizes and total approved source bounds reject oversized material", () => {
  const input = snapshot();
  const large = "🙂".repeat(10_000);
  assert.throws(() =>
    validateApprovedSnapshot(
      {
        ...input,
        files: [{ ...input.files[0], content: large, sha256: hash(large) }],
      },
      versionId,
      sha,
    ),
  );
  const many = Array.from({ length: evaluationLimits.files + 1 }, (_, i) => ({
    ...input.files[0],
    path: `src/file${i}.ts`,
  }));
  assert.throws(() =>
    validateApprovedSnapshot(
      { ...input, approvedPaths: many.map((file) => file.path), files: many },
      versionId,
      sha,
    ),
  );
  const total = Array.from({ length: 5 }, (_, i) => ({
    ...input.files[0],
    path: `src/file${i}.ts`,
    content: "x".repeat(evaluationLimits.fileBytes),
    sha256: hash("x".repeat(evaluationLimits.fileBytes)),
  }));
  assert.throws(() =>
    validateApprovedSnapshot(
      { ...input, approvedPaths: total.map((file) => file.path), files: total },
      versionId,
      sha,
    ),
  );
});

test("strict provider result rejects wrong version, extra scores, finalization and unapproved evidence references", async () => {
  const original = modelOutput(),
    observation = original.observations[0];
  const invalid = [
    { ...original, versionId: "stale" },
    { ...original, revision: "b".repeat(40) },
    { ...original, dimensions: { functionality: 6 } },
    { ...original, status: "finalized" },
    { ...original, observations: [{ ...observation, status: "PASS" }] },
    { ...original, observations: [{ ...observation, evidence: [] }] },
    {
      ...original,
      observations: [
        {
          ...observation,
          evidence: [{ source: "private.ts", startLine: 1, endLine: 2 }],
        },
      ],
    },
    {
      ...original,
      observations: [
        {
          ...observation,
          evidence: [{ source: "src/main.ts", startLine: 1, endLine: 999 }],
        },
      ],
    },
    {
      ...original,
      observations: [
        {
          ...observation,
          evidence: [
            { source: "description:phone", startLine: null, endLine: null },
          ],
        },
      ],
    },
    { ...original, observations: [observation, observation] },
    {
      ...original,
      observations: [
        { ...observation, explanation: "sk-proj-" + "S".repeat(30) },
      ],
    },
  ];
  for (const result of invalid) {
    const f = setup({ fetch: async () => providerResponse(result) });
    await assert.rejects(
      f.evaluator.evaluate(versionId, { commitSha: sha }),
      rejected("OPENAI_OUTPUT_INVALID"),
    );
    assert.equal(f.requests.length, 1);
  }
});

test("provider refusals, incomplete output, tool calls, malformed/multiple messages and oversized bodies are failures", async () => {
  const responses = [
    () =>
      providerResponse(undefined, {
        status: "incomplete",
        incomplete_details: { reason: "max_output_tokens" },
      }),
    () =>
      providerResponse(undefined, {
        output: [
          {
            type: "message",
            role: "assistant",
            status: "completed",
            content: [
              { type: "refusal", refusal: "sensitive-provider-diagnostic" },
            ],
          },
        ],
      }),
    () =>
      providerResponse(undefined, {
        output: [{ type: "function_call", name: "unexpected_tool" }],
      }),
    () => providerResponse(undefined, { output: [] }),
    () =>
      providerResponse(undefined, {
        output: [
          {
            type: "message",
            role: "assistant",
            status: "completed",
            content: [
              { type: "output_text", text: "{}" },
              { type: "output_text", text: "{}" },
            ],
          },
        ],
      }),
    () =>
      new Response("sensitive-provider-diagnostic", {
        headers: { "content-type": "application/json" },
      }),
    () => new Response("x".repeat(evaluationLimits.responseBytes + 1)),
  ];
  for (const response of responses) {
    const f = setup({ fetch: async () => response() });
    await assert.rejects(
      f.evaluator.evaluate(versionId, { commitSha: sha }),
      (error: unknown) =>
        error instanceof Error &&
        /^OPENAI_(?:OUTPUT_INVALID|REFUSED)$/.test(error.message) &&
        !String(error).includes("sensitive-provider"),
    );
    assert.equal(f.requests.length, 1);
  }
});

test("only transient HTTP statuses retry once; auth failures, transport errors and ambiguous timeouts do not retry", async () => {
  for (const status of [429, 503]) {
    let attempts = 0;
    const f = setup({
      fetch: async () =>
        ++attempts === 1
          ? new Response("sensitive-provider-diagnostic", { status })
          : providerResponse(),
    });
    assert.equal(
      (await f.evaluator.evaluate(versionId, { commitSha: sha })).status,
      "needs_review",
    );
    assert.equal(attempts, 2);
    assert.equal(f.requests[0].init.body, f.requests[1].init.body);
  }
  for (const status of [400, 401, 403]) {
    const f = setup({
      fetch: async () =>
        new Response("sensitive-provider-diagnostic", { status }),
    });
    await assert.rejects(
      f.evaluator.evaluate(versionId, { commitSha: sha }),
      rejected("OPENAI_UNAVAILABLE"),
    );
    assert.equal(f.requests.length, 1);
  }
  for (const error of [
    new Error("sensitive-provider-diagnostic"),
    new DOMException("private", "TimeoutError"),
  ]) {
    const f = setup({
      fetch: async () => {
        throw error;
      },
    });
    await assert.rejects(
      f.evaluator.evaluate(versionId, { commitSha: sha }),
      rejected("OPENAI_UNAVAILABLE"),
    );
    assert.equal(f.requests.length, 1);
  }
  const exhausted = setup({
    fetch: async () => new Response("private", { status: 503 }),
  });
  await assert.rejects(
    exhausted.evaluator.evaluate(versionId, { commitSha: sha }),
    rejected("OPENAI_UNAVAILABLE"),
  );
  assert.equal(exhausted.requests.length, 2);
});

test("repository snapshot reads validate exact contents and digest and exclude revoked approvals", async () => {
  const db = new LocalDatabase(":memory:");
  db.raw.exec(
    "CREATE TABLE approved_evaluation_snapshots(version_id TEXT PRIMARY KEY,commit_sha TEXT,snapshot_json TEXT,snapshot_sha256 TEXT,revoked_at TEXT)",
  );
  try {
    const prepared = prepareApprovedSnapshot(snapshot(), {
      versionId,
      commitSha: sha,
    });
    db.raw
      .prepare("INSERT INTO approved_evaluation_snapshots VALUES(?,?,?,?,NULL)")
      .run(versionId, sha, prepared.snapshotJson, prepared.snapshotSha256);
    assert.deepEqual(await readApprovedSnapshot(db, versionId), snapshot());
    assert.equal(await readApprovedSnapshot(db, "missing-version"), null);
    db.raw
      .prepare("UPDATE approved_evaluation_snapshots SET snapshot_json=?")
      .run(prepared.snapshotJson + " ");
    await assert.rejects(
      readApprovedSnapshot(db, versionId),
      rejected("OPENAI_SNAPSHOT_UNAVAILABLE"),
    );
    db.raw
      .prepare(
        "UPDATE approved_evaluation_snapshots SET snapshot_json=?,revoked_at='2026-11-01'",
      )
      .run(prepared.snapshotJson);
    assert.equal(await readApprovedSnapshot(db, versionId), null);
    assert.throws(() =>
      prepareApprovedSnapshot(
        { ...snapshot(), phone: "unapproved" },
        { versionId, commitSha: sha },
      ),
    );
  } finally {
    db.close();
  }
});
