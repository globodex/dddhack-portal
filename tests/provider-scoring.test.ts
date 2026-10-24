import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import {
  createOpenAIEvaluator,
  type ApprovedEvaluationSnapshot,
} from "../neon/ai";
import { modelReviewReport, reviewAreas } from "../neon/ai/output";
import { reportSchema } from "../lib/evaluation";

const versionId = "synthetic_numeric_version",
  commitSha = "b".repeat(40);
const content = "export const demonstration = true;\n";
const caps = {
  functionality: 6,
  complexity: 5,
  openai: 4,
  cerebras: 2,
  ux: 3,
  docs: 2,
  contributors: 2,
  deployment: 2,
  readiness: 3,
  seo: 1,
};
const snapshot: ApprovedEvaluationSnapshot = {
  approved: true,
  versionId,
  commitSha,
  approvedPaths: ["src/demo.ts"],
  descriptions: {
    projectName: "Synthetic scoring fixture",
    description: "Synthetic selected project evidence.",
  },
  files: [
    {
      path: "src/demo.ts",
      content,
      commitSha,
      sha256: createHash("sha256").update(content).digest("hex"),
    },
  ],
  commit: { sha: commitSha },
};
const numeric = () => ({
  versionId,
  revision: commitSha,
  observations: reviewAreas.map((area) => ({
    area,
    status: "SCORED",
    score: caps[area],
    explanation:
      "Synthetic rubric assessment of the cited selected source, without runtime verification.",
    evidence: [{ source: "src/demo.ts", startLine: 1, endLine: 1 }],
  })),
});
const rejected = (error: unknown) =>
  (error as Error).message === "OPENAI_OUTPUT_INVALID";
test("provider grading: complete cited10area rubric finalizes only validated numeric dimensions with unchanged30point caps", () => {
  const report = modelReviewReport(
    numeric(),
    snapshot,
    "synthetic-explicit-model",
  );
  assert.equal(report.status, "finalized");
  assert.deepEqual(report.dimensions, caps);
  assert.equal(
    Object.values(report.dimensions!).reduce((a, b) => a + b, 0),
    30,
  );
  assert.ok(reportSchema.safeParse(report).success);
  assert.deepEqual(report.suspectedFalseClaims, []);
  assert.equal(report.revision, commitSha);
  assert.ok(!JSON.stringify(report).includes(content));
});
test("provider grading: unknown and manual-review dimensions preserve uncertainty instead of inventing zero", () => {
  for (const status of ["UNKNOWN", "NEEDS_MANUAL_REVIEW"]) {
    const value = numeric();
    Object.assign(value.observations[3], {
      status,
      score: null,
      evidence: status === "UNKNOWN" ? [] : value.observations[3].evidence,
    });
    const report = modelReviewReport(
      value,
      snapshot,
      "synthetic-explicit-model",
    );
    assert.equal(report.status, "needs_review");
    assert.equal(report.dimensions, null);
  }
  const zero = numeric();
  zero.observations[0].score = 0;
  assert.equal(
    modelReviewReport(zero, snapshot, "synthetic-explicit-model").dimensions
      ?.functionality,
    0,
  );
});
test("provider grading: missing/duplicate areas, nonfinite/outofrange/string scores and uncited or unapproved grading fail closed", () => {
  const variants: any[] = [];
  const change = (mutate: (value: ReturnType<typeof numeric>) => void) => {
    const value = numeric();
    mutate(value);
    variants.push(value);
  };
  change((v) => {
    v.observations.pop();
  });
  change((v) => {
    v.observations[1] = { ...v.observations[0] };
  });
  for (const score of [-1, 6.1, NaN, Infinity, "6"])
    change((v) => {
      (v.observations[0] as any).score = score;
    });
  change((v) => {
    v.observations[0].evidence = [];
  });
  change((v) => {
    v.observations[0].status = "UNKNOWN";
  });
  change((v) => {
    (v.observations[0] as any).score = null;
  });
  change((v) => {
    v.observations[0].evidence[0].source = "private.ts";
  });
  change((v) => {
    v.observations[0].evidence[0].endLine = 999;
  });
  change((v) => {
    v.observations[0].explanation = content;
  });
  variants.push(
    { ...numeric(), eligibility: "eligible" },
    { ...numeric(), status: "finalized" },
    { ...numeric(), penalties: 0 },
    { ...numeric(), revision: "a".repeat(40) },
  );
  for (const value of variants)
    assert.throws(
      () => modelReviewReport(value, snapshot, "synthetic-explicit-model"),
      rejected,
    );
  for (const area of reviewAreas) {
    const value = numeric();
    value.observations.find((item) => item.area === area)!.score =
      caps[area] + 0.01;
    assert.throws(
      () => modelReviewReport(value, snapshot, "synthetic-explicit-model"),
      rejected,
      area,
    );
  }
});
test("provider grading: legacy evidence-only observations remain nonfinal and cannot smuggle score fields", () => {
  const legacy = {
    versionId,
    revision: commitSha,
    observations: [
      {
        area: "functionality",
        status: "NEEDS_MANUAL_REVIEW",
        explanation: "Selected source needs manual runtime assessment.",
        evidence: [{ source: "src/demo.ts", startLine: 1, endLine: 1 }],
      },
    ],
  };
  const report = modelReviewReport(
    legacy,
    snapshot,
    "synthetic-explicit-model",
  );
  assert.equal(report.status, "needs_review");
  assert.equal(report.dimensions, null);
  assert.throws(
    () =>
      modelReviewReport(
        { ...legacy, observations: [{ ...legacy.observations[0], score: 6 }] },
        snapshot,
        "synthetic-explicit-model",
      ),
    rejected,
  );
});
test("provider grading: mapper independently rechecks approval, file digest and exact snapshot commit binding", () => {
  for (const changed of [
    { ...snapshot, approved: false },
    { ...snapshot, commit: { sha: "a".repeat(40) } },
    { ...snapshot, files: [{ ...snapshot.files[0], sha256: "a".repeat(64) }] },
    {
      ...snapshot,
      files: [{ ...snapshot.files[0], commitSha: "a".repeat(40) }],
    },
    { ...snapshot, approvedPaths: [] },
  ])
    assert.throws(
      () =>
        modelReviewReport(
          numeric(),
          changed as any,
          "synthetic-explicit-model",
        ),
      rejected,
    );
});
test("provider grading: mock-only request remains bounded/private and uses strict10area nullable numeric schema plus configuration metadata", async () => {
  let requests = 0,
    captured: any;
  const evaluator = createOpenAIEvaluator(
    {
      OPENAI_API_KEY: "synthetic-only-key-never-live-123456",
      OPENAI_MODEL: "synthetic-explicit-model",
      PORTAL_OPENAI_EVALUATION_APPROVED: "true",
    },
    {
      resolveApprovedSnapshot: async () => snapshot,
      fetch: async (_input, init) => {
        requests++;
        captured = JSON.parse(String(init?.body));
        return Response.json({
          status: "completed",
          model: "synthetic-explicit-model",
          error: null,
          incomplete_details: null,
          output: [
            {
              type: "message",
              role: "assistant",
              status: "completed",
              content: [
                { type: "output_text", text: JSON.stringify(numeric()) },
              ],
            },
          ],
        });
      },
    },
  );
  const report = await evaluator.evaluate(versionId, {
    commitSha,
    phone: "UNAPPROVED-PRIVATE-PHONE",
    email: "UNAPPROVED-PRIVATE-EMAIL",
    key: "UNAPPROVED-PRIVATE-SECRET",
  });
  assert.equal(report.status, "finalized");
  assert.equal(requests, 1);
  assert.equal(
    evaluator.configuration,
    "openai-rubric-v2:synthetic-explicit-model",
  );
  assert.equal((evaluator as any).available, true);
  assert.equal(captured.store, false);
  assert.deepEqual(captured.tools, []);
  assert.equal(captured.tool_choice, "none");
  assert.equal(captured.text.format.strict, true);
  assert.equal(
    captured.text.format.schema.properties.observations.minItems,
    10,
  );
  assert.equal(
    captured.text.format.schema.properties.observations.maxItems,
    10,
  );
  const branches =
    captured.text.format.schema.properties.observations.items.anyOf;
  assert.equal(branches.length, 10);
  for (const branch of branches) {
    const area = branch.properties.area.enum[0] as keyof typeof caps;
    assert.equal(branch.additionalProperties, false);
    assert.ok(branch.required.includes("score"));
    assert.deepEqual(branch.properties.score.type, ["number", "null"]);
    assert.equal(branch.properties.score.minimum, 0);
    assert.equal(branch.properties.score.maximum, caps[area]);
  }
  assert.equal(JSON.stringify(captured).includes("UNAPPROVED-PRIVATE"), false);
  assert.equal(
    captured.instructions.includes("Do not claim to have run"),
    true,
  );
  const missing = createOpenAIEvaluator(
    {
      OPENAI_API_KEY: "synthetic-only-key-never-live-123456",
      PORTAL_OPENAI_EVALUATION_APPROVED: "true",
    },
    {
      resolveApprovedSnapshot: async () => {
        throw new Error("must not run");
      },
      fetch: async () => {
        throw new Error("must not run");
      },
    },
  );
  assert.equal((missing as any).available, false);
  assert.equal(
    (missing as any).unavailableReason,
    "AI model is not configured.",
  );
  await assert.rejects(missing.evaluate(versionId, { commitSha }), {
    message: "OPENAI_NOT_CONFIGURED",
  });
});
