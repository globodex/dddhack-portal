import { z } from "zod";
import type { Report } from "../../lib/evaluation";
import {
  assertSafeEvaluationText,
  requireEvaluation,
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
export const structuredReviewSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    versionId: { type: "string" },
    revision: { type: "string" },
    observations: {
      type: "array",
      minItems: 1,
      maxItems: reviewAreas.length,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          area: { type: "string", enum: [...reviewAreas] },
          status: { type: "string", enum: ["UNKNOWN", "NEEDS_MANUAL_REVIEW"] },
          explanation: { type: "string", minLength: 1, maxLength: 2000 },
          evidence: {
            type: "array",
            maxItems: 8,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                source: { type: "string", maxLength: 200 },
                startLine: { type: ["integer", "null"], minimum: 1 },
                endLine: { type: ["integer", "null"], minimum: 1 },
              },
              required: ["source", "startLine", "endLine"],
            },
          },
        },
        required: ["area", "status", "explanation", "evidence"],
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
  const parsed = resultSchema.safeParse(input);
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
  for (const item of result.observations) {
    try {
      assertSafeEvaluationText(item.explanation);
    } catch {
      requireEvaluation(false, "OPENAI_OUTPUT_INVALID");
    }
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
    checks.push({
      id: `ai-evidence:${item.area}`,
      status: item.status,
      evidence,
      explanation: item.explanation,
    });
  }
  return {
    versionId: snapshot.versionId,
    status: "needs_review",
    model,
    rubricVersion: 1,
    revision: snapshot.commitSha,
    checks,
    dimensions: null,
    suspectedFalseClaims: [],
  };
}
