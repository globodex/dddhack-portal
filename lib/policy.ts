import {
  deriveOperational,
  deriveScorePolicyBlockers,
} from "./derived-readiness";
import {
  indefiniteRetentionNotice,
  optionalDeploymentRule,
} from "./operational-setup-contract";
import { z } from "zod";
export const baseWeights = {
  human: 50,
  ai: 30,
  votes: 5,
  diversity: 10,
  codex: 5,
  feedback: 5,
};
export const weightsSchema = z
  .object({
    human: z.number().finite().min(0).max(1000),
    ai: z.number().finite().min(0).max(1000),
    votes: z.number().finite().min(0).max(1000),
    diversity: z.number().finite().min(0).max(1000),
    codex: z.number().finite().min(0).max(1000),
    feedback: z.number().finite().min(0).max(1000),
  })
  .strict();
export const decisions = [
  "submissionCutoff",
  "submissionOpen",
  "diversity",
  "voteNormalization",
  "aiFallback",
  "engagementWindows",
  "feedback",
  "codexReviewer",
  "appeals",
  "judging",
  "tieBreak",
  "deploymentRule",
  "lumaPolicy",
  "penalties",
  "privacyRetention",
  "capacity",
  "teamFormation",
  "projectEngagement",
] as const;
const instant = z
  .string()
  .datetime()
  .transform((v) => new Date(v).toISOString());
export const qualificationSchema = z
  .object({
    confirmed: z.boolean(),
    version: z.number().int().positive(),
    voters: z.enum([
      "all-signed-in",
      "other-team",
      "approved-checked-in-other-team",
    ]),
    feedbackAuthors: z.enum([
      "all-signed-in",
      "other-team",
      "approved-checked-in-other-team",
    ]),
    feedbackReview: z.literal("staff-qualified"),
    feedbackDuplicates: z.enum([
      "staff-reviewed",
      "exclude-exact-normalized-copies",
    ]),
  })
  .strict();
export type Operation = "submissions" | "checkin";
export const operationalDecisions = [
  "submissionOpen",
  "submissionCutoff",
  "deploymentRule",
  "privacyRetention",
  "lumaPolicy",
  "capacity",
  "teamFormation",
] as const;
export const policySchema = z
  .object({
    timezone: z.literal("Asia/Kolkata"),
    ideaLock: instant,
    membershipFreeze: instant,
    ideaReveal: instant,
    submissionOpen: instant,
    submissionClose: instant.nullable(),
    judgingClose: instant.nullable(),
    engagementOpen: instant.nullable(),
    engagementClose: instant.nullable(),
    diversityRubric: z.string().max(4000),
    diversityAssessment: z
      .enum(["unconfirmed", "non-demographic-evidence"])
      .default("unconfirmed"),
    engagementQualification: qualificationSchema.nullable().default(null),
    operationScopes: z
      .array(z.enum(["submissions", "checkin"]))
      .nullable()
      .default(null),
    voteFormula: z.enum(["unconfirmed", "sqrt-relative", "fixed-target"]),
    voteTarget: z.number().int().min(1).max(160),
    aiFallback: z.string().max(4000),
    feedbackTarget: z.number().int().min(1).max(160),
    feedbackMin: z.number().int().min(30).max(500),
    feedbackMax: z.number().int().min(30).max(500),
    minJudges: z.number().int().min(1).max(1000),
    tieBreak: z.string().max(2000),
    codexReviewer: z.string().max(500),
    appealClose: instant.nullable(),
    deploymentRule: z.string().max(1000),
    lumaRequired: z.boolean(),
    penaltyApproved: z.boolean(),
    retentionNotice: z.string().max(4000),
    confirmations: z.array(z.enum(decisions)),
    scoringDisclosure: z
      .object({
        criteria: z.string().max(4000),
        weightage: z.string().max(4000),
        confirmed: z.boolean(),
      })
      .strict()
      .nullable()
      .default(null),
    weights: weightsSchema.default(baseWeights),
    capacityRule: z.literal("no-strict-cap").default("no-strict-cap"),
    revealOrder: z.literal("manual").default("manual"),
    capacity: z.number().int().min(1).max(1000).nullable().default(null),
    teamFormationRule: z.string().max(2000).default(""),
    projectEngagementRule: z
      .enum([
        "unconfirmed",
        "display-only",
        "score-with-approved-normalization",
      ])
      .default("unconfirmed"),
  })
  .strict();
export type Policy = z.infer<typeof policySchema>;
export const draftPolicy: Policy = {
  timezone: "Asia/Kolkata",
  ideaLock: "2026-10-29T18:29:00.000Z",
  membershipFreeze: "2026-10-29T18:29:00.000Z",
  ideaReveal: "2026-11-01T02:30:00.000Z",
  submissionOpen: "2026-11-01T02:30:00.000Z",
  submissionClose: "2026-11-01T10:30:00.000Z",
  judgingClose: null,
  engagementOpen: null,
  engagementClose: null,
  diversityRubric: "",
  diversityAssessment: "unconfirmed",
  engagementQualification: null,
  operationScopes: null,
  voteFormula: "sqrt-relative",
  voteTarget: 10,
  aiFallback: "",
  feedbackTarget: 10,
  feedbackMin: 30,
  feedbackMax: 500,
  minJudges: 1,
  tieBreak: "",
  codexReviewer: "",
  appealClose: null,
  deploymentRule: optionalDeploymentRule,
  lumaRequired: false,
  penaltyApproved: false,
  retentionNotice: indefiniteRetentionNotice,
  confirmations: [
    "capacity",
    "teamFormation",
    "submissionCutoff",
    "submissionOpen",
    "deploymentRule",
    "lumaPolicy",
  ],
  weights: baseWeights,
  capacityRule: "no-strict-cap",
  revealOrder: "manual",
  capacity: null,
  scoringDisclosure: null,
  teamFormationRule:
    "Pre-made teams: roster and idea lock together on October 29, 2026 at 23:59 IST.",
  projectEngagementRule: "unconfirmed",
};
export function policyBlockers(p: Policy): string[] {
  return deriveScorePolicyBlockers(p);
}
export function qualificationBlockers(p: Policy): string[] {
  if (p.projectEngagementRule !== "score-with-approved-normalization")
    return ["engagement qualification rules"];
  return deriveScorePolicyBlockers(p).filter((b) =>
    [
      "engagement qualification rules",
      "valid engagement window",
      "feedback limits",
    ].includes(b),
  );
}
export function operationalBlockers(p: Policy, operation: Operation): string[] {
  return deriveOperational(p, operation, new Date().toISOString()).blockers;
}
export function operationEnabled(
  settings: { active: number; policy: Policy },
  operation: Operation,
) {
  return deriveOperational(settings.policy, operation, new Date().toISOString())
    .enabled;
}
export function setupReadiness(
  settings: { active: number; version: number; policy: Policy },
  now: string,
) {
  const scoringBlockers = deriveScorePolicyBlockers(settings.policy);
  return {
    initialized: settings.version > 0,
    submissions: deriveOperational(settings.policy, "submissions", now),
    checkin: deriveOperational(settings.policy, "checkin", now),
    scoring: { ready: scoringBlockers.length === 0, blockers: scoringBlockers },
  };
}
export { ist } from "./time";
