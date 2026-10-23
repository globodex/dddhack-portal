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
    voteFormula: z.enum(["unconfirmed", "sqrt-relative", "fixed-target"]),
    voteTarget: z.number().int().min(1).max(160),
    aiFallback: z.string().max(4000),
    feedbackTarget: z.number().int().min(1).max(160),
    feedbackMin: z.number().int().min(30).max(500),
    feedbackMax: z.number().int().min(30).max(500),
    minJudges: z.number().int().min(2).max(20),
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
  voteFormula: "unconfirmed",
  voteTarget: 10,
  aiFallback: "",
  feedbackTarget: 10,
  feedbackMin: 30,
  feedbackMax: 500,
  minJudges: 2,
  tieBreak: "",
  codexReviewer: "",
  appealClose: null,
  deploymentRule: "",
  lumaRequired: false,
  penaltyApproved: false,
  retentionNotice: "",
  confirmations: ["capacity", "teamFormation", "submissionCutoff"],
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
  const b: string[] = decisions.filter((d) => !p.confirmations.includes(d));

  if (!p.teamFormationRule.trim()) b.push("confirmed team-formation rule");
  if (p.projectEngagementRule === "unconfirmed")
    b.push("public engagement scoring policy");
  if (!p.submissionClose || p.submissionClose <= p.submissionOpen)
    b.push("valid submission window");
  if (
    !p.judgingClose ||
    !p.submissionClose ||
    p.judgingClose <= p.submissionClose
  )
    b.push("valid judging window");
  if (
    !p.engagementOpen ||
    !p.engagementClose ||
    p.engagementClose <= p.engagementOpen ||
    p.engagementOpen < p.ideaReveal
  )
    b.push("valid engagement window");
  if (
    !p.diversityRubric.trim() ||
    /gender|entropy|demograph/i.test(p.diversityRubric)
  )
    b.push("non-demographic diversity rubric");
  if (p.voteFormula === "unconfirmed") b.push("vote formula");
  for (const k of [
    "aiFallback",
    "tieBreak",
    "codexReviewer",
    "deploymentRule",
    "retentionNotice",
  ] as const)
    if (!p[k].trim()) b.push(k);
  if (!p.appealClose || !p.judgingClose || p.appealClose > p.judgingClose)
    b.push("appeal deadline");
  if (p.feedbackMax < p.feedbackMin) b.push("feedback limits");
  return [...new Set(b)];
}
export { ist } from "./time";
