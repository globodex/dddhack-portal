import { z } from "zod";
import type { Report } from "../../lib/evaluation";
import {
  assertSafeEvaluationText,
  requireEvaluation,
  validateApprovedSnapshot,
  type ApprovedEvaluationSnapshot,
} from "./input";

export const reviewAreas = [
  "functionality",
  "complexity",
  "openai",
  "cerebras",
  "ux",
  "docs",
  "contributors",
  "deployment",
  "readiness",
  "seo",
] as const;
// Existing reportSchema rubric, unchanged: total30. These are dimension caps,
// not global result weights or an automatic project eligibility decision.
export const reviewAreaCaps = {
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
} as const;
const observationSchema = z
  .object({
    area: z.enum(reviewAreas),
    status: z.enum(["UNKNOWN", "NEEDS_MANUAL_REVIEW"]),
    explanation: z.string().min(1).max(2000),
    evidence: z
      .array(
        z
          .object({
            source: z.string().max(200),
            startLine: z.number().int().positive().nullable(),
            endLine: z.number().int().positive().nullable(),
          })
          .strict(),
      )
      .max(8),
  })
  .strict();
const resultSchema = z
  .object({
    versionId: z.string(),
    revision: z.string(),
    observations: z.array(observationSchema).min(1).max(reviewAreas.length),
  })
  .strict();
const gradedObservationSchema = observationSchema
  .extend({
    status: z.enum(["SCORED", "UNKNOWN", "NEEDS_MANUAL_REVIEW"]),
    score: z.number().finite().nullable(),
  })
  .strict();
const gradedResultSchema = resultSchema
  .extend({
    observations: z.array(gradedObservationSchema).length(reviewAreas.length),
  })
  .strict();
const referenceJSONSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    source: { type: "string", maxLength: 200 },
    startLine: { type: ["integer", "null"], minimum: 1 },
    endLine: { type: ["integer", "null"], minimum: 1 },
  },
  required: ["source", "startLine", "endLine"],
} as const;
export const structuredReviewSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    versionId: { type: "string" },
    revision: { type: "string" },
    observations: {
      type: "array",
      minItems: reviewAreas.length,
      maxItems: reviewAreas.length,
      items: {
        anyOf: reviewAreas.map((area) => ({
          type: "object",
          additionalProperties: false,
          properties: {
            area: { type: "string", enum: [area] },
            status: {
              type: "string",
              enum: ["SCORED", "UNKNOWN", "NEEDS_MANUAL_REVIEW"],
            },
            score: {
              type: ["number", "null"],
              minimum: 0,
              maximum: reviewAreaCaps[area],
            },
            explanation: { type: "string", minLength: 1, maxLength: 2000 },
            evidence: {
              type: "array",
              maxItems: 8,
              items: referenceJSONSchema,
            },
          },
          required: ["area", "status", "score", "explanation", "evidence"],
        })),
      },
    },
  },
  required: ["versionId", "revision", "observations"],
} as const;

export function modelReviewReport(
  input: unknown,
  snapshot: ApprovedEvaluationSnapshot,
  model: string,
): Report {
  // Revalidate at the mapping boundary too, rather than trusting a caller's type
  // assertion or a mutable snapshot after a provider response.
  try {
    snapshot = validateApprovedSnapshot(
      snapshot,
      snapshot.versionId,
      snapshot.commitSha,
    );
  } catch {
    requireEvaluation(false, "OPENAI_OUTPUT_INVALID");
  }
  const graded = gradedResultSchema.safeParse(input);
  const parsed = graded.success ? graded : resultSchema.safeParse(input);
  requireEvaluation(parsed.success, "OPENAI_OUTPUT_INVALID");
  const result = parsed.data;
  requireEvaluation(
    result.versionId === snapshot.versionId &&
      result.revision === snapshot.commitSha &&
      new Set(result.observations.map((item) => item.area)).size ===
        result.observations.length,
    "OPENAI_OUTPUT_INVALID",
  );
  const checks: Report["checks"] = [
    {
      id: "approved-snapshot",
      status: "PASS",
      evidence: [`commit:${snapshot.commitSha}`],
      explanation:
        "Approved version and file digests match locally. Only the explicitly selected project evidence was transmitted; runtime behavior, eligibility, authorship and claims remain unverified.",
    },
  ];
  const dimensions = {} as NonNullable<Report["dimensions"]>;
  let complete = graded.success;
  for (const item of result.observations) {
    try {
      assertSafeEvaluationText(item.explanation);
    } catch {
      requireEvaluation(false, "OPENAI_OUTPUT_INVALID");
    }
    // Keep summaries and citations, never reproduce substantial selected source.
    const explanation = item.explanation.replace(/\s+/g, " ").trim();
    requireEvaluation(
      !item.explanation.includes("```") &&
        !snapshot.files.some((file) =>
          file.content.split(/\r?\n/).some((line) => {
            const selected = line.replace(/\s+/g, " ").trim();
            return selected.length >= 24 && explanation.includes(selected);
          }),
        ),
      "OPENAI_OUTPUT_INVALID",
    );
    requireEvaluation(
      item.status !== "NEEDS_MANUAL_REVIEW" || item.evidence.length > 0,
      "OPENAI_OUTPUT_INVALID",
    );
    const evidence = item.evidence.map((reference) => {
      if (reference.source.startsWith("description:")) {
        requireEvaluation(
          Object.hasOwn(
            snapshot.descriptions,
            reference.source.slice("description:".length),
          ) &&
            reference.startLine === null &&
            reference.endLine === null,
          "OPENAI_OUTPUT_INVALID",
        );
        return reference.source;
      }
      if (
        reference.source === "commit:sha" ||
        reference.source === "commit:committedAt"
      ) {
        requireEvaluation(
          (reference.source !== "commit:committedAt" ||
            snapshot.commit.committedAt) &&
            reference.startLine === null &&
            reference.endLine === null,
          "OPENAI_OUTPUT_INVALID",
        );
        return reference.source;
      }
      const file = snapshot.files.find(
        (file) => file.path === reference.source,
      );
      requireEvaluation(
        file &&
          reference.startLine !== null &&
          reference.endLine !== null &&
          reference.endLine >= reference.startLine &&
          reference.endLine <= file.content.split("\n").length,
        "OPENAI_OUTPUT_INVALID",
      );
      return `${file.path}:L${reference.startLine}-L${reference.endLine}`;
    });
    const scored = "score" in item;
    if (scored) {
      requireEvaluation(
        item.status === "SCORED"
          ? typeof item.score === "number" &&
              Number.isFinite(item.score) &&
              item.score >= 0 &&
              item.score <= reviewAreaCaps[item.area] &&
              evidence.length > 0
          : item.score === null,
        "OPENAI_OUTPUT_INVALID",
      );
      if (item.status === "SCORED")
        dimensions[item.area] = item.score as number;
      else complete = false;
    } else complete = false;
    checks.push({
      id: `ai-evidence:${item.area}`,
      status: item.status === "SCORED" ? "PASS" : item.status,
      evidence,
      explanation: item.explanation,
    });
  }
  return {
    versionId: snapshot.versionId,
    status: complete ? "finalized" : "needs_review",
    model,
    rubricVersion: 1,
    revision: snapshot.commitSha,
    checks,
    dimensions: complete ? dimensions : null,
    suspectedFalseClaims: [],
  };
}
