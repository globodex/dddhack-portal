import { baseWeights, type Policy } from "./policy";
import { z } from "zod";
import { selectedSubmissionTools } from "./submission-tools";
import { ecosystemVerificationGuidance } from "./ecosystem-verification";
export const reportSchema = z
  .object({
    versionId: z.string(),
    status: z.enum(["needs_review", "finalized"]),
    model: z.string(),
    rubricVersion: z.number().int(),
    revision: z.string(),
    checks: z.array(
      z.object({
        id: z.string(),
        status: z.enum([
          "PASS",
          "FAIL",
          "UNKNOWN",
          "NOT_APPLICABLE",
          "NEEDS_MANUAL_REVIEW",
        ]),
        evidence: z.array(z.string().max(2048)),
        explanation: z.string().max(4000),
      }),
    ),
    dimensions: z
      .object({
        functionality: z.number().min(0).max(6),
        complexity: z.number().min(0).max(5),
        openai: z.number().min(0).max(4),
        cerebras: z.number().min(0).max(2),
        ux: z.number().min(0).max(3),
        docs: z.number().min(0).max(2),
        contributors: z.number().min(0).max(2),
        deployment: z.number().min(0).max(2),
        readiness: z.number().min(0).max(3),
        seo: z.number().min(0).max(1),
      })
      .nullable(),
    suspectedFalseClaims: z.array(z.enum(["openai", "cerebras"])),
  })
  .strict();
export type Report = z.infer<typeof reportSchema>;
export interface Evaluator {
  evaluate(versionId: string, payload: unknown): Promise<Report>;
}
export const disabledEvaluator: Evaluator = {
  async evaluate(versionId, payload) {
    const declared =
      payload && typeof payload === "object"
        ? (payload as Record<string, unknown>)
        : {};
    const claims = selectedSubmissionTools(
      declared.ecosystemSelections ?? declared.tools,
    );
    return {
      versionId,
      status: "needs_review",
      model: "disabled-no-external-calls",
      rubricVersion: 1,
      revision: "unverified",
      checks: [
        {
          id: "github",
          status: "UNKNOWN",
          evidence: [],
          explanation:
            "No credentialed external integration or network fetch is enabled. Organizer review required.",
        },
        ...claims.map((claim) => ({
          id: `ecosystem:${claim}`,
          status: "UNKNOWN" as const,
          evidence: [],
          explanation:
            ecosystemVerificationGuidance[
              claim as keyof typeof ecosystemVerificationGuidance
            ],
        })),
      ],
      dimensions: null,
      suspectedFalseClaims: [],
    };
  },
};
export function githubEligibility(
  meta: {
    public: boolean;
    createdAt: string;
    firstCommit: string | null;
  } | null,
) {
  if (!meta) return "NEEDS_MANUAL_REVIEW";
  if (
    !meta.firstCommit ||
    !Number.isFinite(Date.parse(meta.createdAt)) ||
    !Number.isFinite(Date.parse(meta.firstCommit))
  )
    return "NEEDS_MANUAL_REVIEW";
  const cutoff = Date.parse("2026-11-01T02:30:00Z");
  // Inaccessibility/private repositories cannot establish a timing violation.
  if (!meta.public) return "NEEDS_MANUAL_REVIEW";
  return Date.parse(meta.createdAt) > cutoff &&
    Date.parse(meta.firstCommit) > cutoff
    ? "ELIGIBLE"
    : "INELIGIBLE";
}
export function score(input: {
  human: number[];
  weights?: Policy["weights"];
  astra: number;
  codex: number;
  diversity: number;
  votes: number;
  maxVotes: number;
  voteFormula: "sqrt-relative" | "fixed-target";
  voteTarget: number;
  feedback: number;
  feedbackTarget: number;
  falseClaims: number;
  eligible: boolean;
}) {
  if (!input.eligible) return null;
  if (
    input.human.some((v) => !Number.isFinite(v) || v < 0 || v > 10) ||
    !input.human.length
  )
    throw new Error("INVALID_HUMAN_SCORES");
  for (const [n, v, max] of [
    ["astra", input.astra, 30],
    ["codex", input.codex, 5],
    ["diversity", input.diversity, 10],
    ["falseClaims", input.falseClaims, 2],
  ] as const)
    if (!Number.isFinite(v) || v < 0 || v > max)
      throw new Error("INVALID_" + n);
  const weights = input.weights || baseWeights;
  const human =
    (input.human.reduce((a, b) => a + b, 0) / input.human.length / 10) *
    weights.human;
  const astra = (input.astra / 30) * weights.ai,
    diversity = (input.diversity / 10) * weights.diversity,
    codex = (input.codex / 5) * weights.codex;
  const voting =
    input.voteFormula === "sqrt-relative"
      ? input.maxVotes
        ? weights.votes * Math.sqrt(input.votes / input.maxVotes)
        : 0
      : weights.votes * Math.min(1, input.votes / input.voteTarget);
  const bonus =
    weights.feedback * Math.min(1, input.feedback / input.feedbackTarget);
  const penalties = input.falseClaims * 5;
  return {
    human,
    astra,
    voting,
    diversity,
    codex,
    bonus,
    penalties,
    total: Math.max(
      0,
      human + astra + voting + diversity + codex + bonus - penalties,
    ),
  };
}
