import { createHash } from "node:crypto";
import {
  createOpenAIEvaluator,
  type ApprovedEvaluationSnapshot,
} from "../ai/index";

// Explicit one-request provider smoke only. No repository, roster, credentials,
// participant data or project records are read. The key is never printed.
if (process.env.PORTAL_OPENAI_SMOKE_APPROVED !== "1")
  throw new Error("ONE_REQUEST_SMOKE_APPROVAL_REQUIRED");
if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY_REQUIRED");
if (!process.env.OPENAI_MODEL)
  throw new Error("EXPLICIT_OPENAI_MODEL_REQUIRED");
const commitSha = "a".repeat(40);
const content = 'export function greet() { return "Hello, builder"; }\n';
const snapshot: ApprovedEvaluationSnapshot = {
  versionId: "synthetic-provider-smoke",
  commitSha,
  approved: true,
  approvedPaths: ["src/greet.ts"],
  descriptions: {
    projectName: "Synthetic provider smoke",
    description:
      "A tiny synthetic greeting function for a bounded integration check.",
  },
  files: [
    {
      path: "src/greet.ts",
      content,
      commitSha,
      sha256: createHash("sha256").update(content).digest("hex"),
    },
  ],
  commit: { sha: commitSha },
};
let requests = 0;
const evaluator = createOpenAIEvaluator(
  {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_MODEL: process.env.OPENAI_MODEL,
    PORTAL_OPENAI_EVALUATION_APPROVED: "true",
  },
  {
    resolveApprovedSnapshot: async () => snapshot,
    fetch: async (input, init) => {
      if (requests++ !== 0) throw new Error("ONE_REQUEST_BUDGET_EXHAUSTED");
      return fetch(input, init);
    },
  },
);
try {
  const report = await evaluator.evaluate(snapshot.versionId, { commitSha });
  console.log(
    JSON.stringify({
      requests,
      model: report.model,
      status: report.status,
      checks: report.checks.length,
      score: null,
      syntheticOnly: true,
    }),
  );
} catch (error) {
  console.error(
    JSON.stringify({
      requests: Math.min(requests, 1),
      code: error instanceof Error ? error.message : "PROVIDER_SMOKE_FAILED",
      syntheticOnly: true,
    }),
  );
  process.exitCode = 1;
}
