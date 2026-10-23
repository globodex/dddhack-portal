import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createOfflineVerificationEvaluator,
  offlineSnapshotLimits,
  type OfflineSnapshot,
} from "../lib/offline-verification";
import { reportSchema } from "../lib/evaluation";
const sha = "a".repeat(40);
const payload = {
  commitSha: sha,
  ecosystemSelections: [
    "OpenAI API",
    "Codex",
    "ChatGPT Sites",
    "Parallel Agents",
    "Parallel worktrees",
    "ChatGPT",
  ],
};
const sdk =
  'import OpenAI from "openai"; const client = new OpenAI({apiKey:process.env.OPENAI_API_KEY}); await client.responses.create({model:"fixture",input:"synthetic"});';
const snapshot = (): OfflineSnapshot => ({
  versionId: "synthetic-version",
  commitSha: sha,
  complete: true,
  files: [
    { path: "src/server.ts", content: sdk },
    { path: "evidence/workflows.json", content: '{"synthetic":true}' },
  ],
  workflow: [
    "Codex",
    "ChatGPT Sites",
    "Parallel Agents",
    "Parallel worktrees",
    "ChatGPT",
  ].map((tool) => ({
    tool: tool as NonNullable<OfflineSnapshot["workflow"]>[number]["tool"],
    artifactPath: "evidence/workflows.json",
    event: "completed",
  })),
});
test("offline complete binding yields evidence-only manual checks with no source, scores or provider invocation", async () => {
  const report = await createOfflineVerificationEvaluator(async () =>
    snapshot(),
  ).evaluate("synthetic-version", payload);
  assert.ok(reportSchema.safeParse(report).success);
  assert.equal(report.status, "needs_review");
  assert.equal(report.dimensions, null);
  assert.deepEqual(report.suspectedFalseClaims, []);
  assert.equal(report.checks[0].status, "PASS");
  assert.equal(
    report.checks
      .slice(1)
      .every((check) => check.status === "NEEDS_MANUAL_REVIEW"),
    true,
  );
  assert.equal(JSON.stringify(report).includes("apiKey"), false);
  assert.equal(JSON.stringify(report).includes("input:"), false);
});
test("missing/inaccessible/incomplete/mismatched snapshots remain unknown without a violation", async () => {
  for (const read of [
    async () => null,
    async () => {
      throw new Error("secret-provider-detail");
    },
    async () => ({ ...snapshot(), complete: false }),
    async () => ({ ...snapshot(), versionId: "stale" }),
    async () => ({ ...snapshot(), commitSha: "b".repeat(40) }),
  ]) {
    const report = await createOfflineVerificationEvaluator(read).evaluate(
      "synthetic-version",
      payload,
    );
    assert.ok(report.checks.every((check) => check.status === "UNKNOWN"));
    assert.equal(report.dimensions, null);
    assert.deepEqual(report.suspectedFalseClaims, []);
    assert.equal(
      JSON.stringify(report).includes("secret-provider-detail"),
      false,
    );
  }
  let reads = 0;
  const report = await createOfflineVerificationEvaluator(async () => {
    reads++;
    return snapshot();
  }).evaluate("synthetic-version", { ...payload, commitSha: "" });
  assert.equal(reads, 0);
  assert.ok(report.checks.every((check) => check.status === "UNKNOWN"));
});
test("env-only declarations, comments, source style and contributor names do not establish tool use", async () => {
  for (const content of [
    "const key=process.env.OPENAI_API_KEY;",
    "// " + sdk,
    "# from openai import OpenAI\n# client.responses.create()",
    "README claims OpenAI and Codex use",
  ]) {
    const report = await createOfflineVerificationEvaluator(async () => ({
      ...snapshot(),
      files: [{ path: "src/server.ts", content }],
      workflow: [],
    })).evaluate("synthetic-version", payload);
    assert.ok(
      report.checks.slice(1).every((check) => check.status === "UNKNOWN"),
    );
  }
});
test("snapshot path, duplicate, file-count and byte bounds fail closed without echoing content", async () => {
  const bad: OfflineSnapshot[] = [
    { ...snapshot(), files: [{ path: "../private.ts", content: sdk }] },
    {
      ...snapshot(),
      files: [{ path: ".env", content: "SYNTHETIC-SECRET-MARKER" }],
    },
    {
      ...snapshot(),
      files: [
        { path: "src/server.ts", content: sdk },
        { path: "src/server.ts", content: sdk },
      ],
    },
    {
      ...snapshot(),
      files: Array.from(
        { length: offlineSnapshotLimits.files + 1 },
        (_, i) => ({ path: `src/${i}.ts`, content: "" }),
      ),
    },
    {
      ...snapshot(),
      files: [
        {
          path: "src/server.ts",
          content: "x".repeat(offlineSnapshotLimits.fileBytes + 1),
        },
      ],
    },
    {
      ...snapshot(),
      files: Array.from({ length: 9 }, (_, i) => ({
        path: `src/${i}.ts`,
        content: "x".repeat(offlineSnapshotLimits.fileBytes),
      })),
    },
    {
      ...snapshot(),
      workflow: [
        { tool: "Codex", artifactPath: "missing.json", event: "completed" },
      ],
    },
  ];
  for (const value of bad) {
    const report = await createOfflineVerificationEvaluator(
      async () => value,
    ).evaluate("synthetic-version", payload);
    assert.ok(report.checks.every((check) => check.status === "UNKNOWN"));
    assert.equal(
      JSON.stringify(report).includes("SYNTHETIC-SECRET-MARKER"),
      false,
    );
  }
});

test("SDK pattern binds calls to the imported client and supports offline Python evidence", async () => {
  for (const [content, expected] of [
    [
      'import OpenAI from "openai"; const client = new OpenAI(); unrelated.responses.create({});',
      "UNKNOWN",
    ],
    [
      'from openai import OpenAI\nclient = OpenAI()\nclient.responses.create(model="fixture", input="synthetic")',
      "NEEDS_MANUAL_REVIEW",
    ],
  ] as const) {
    const report = await createOfflineVerificationEvaluator(async () => ({
      ...snapshot(),
      files: [{ path: "src/app.py", content }],
      workflow: [],
    })).evaluate("synthetic-version", payload);
    assert.equal(
      report.checks.find((check) => check.id === "ecosystem:OpenAI API")!
        .status,
      expected,
    );
    assert.equal(report.dimensions, null);
  }
});
