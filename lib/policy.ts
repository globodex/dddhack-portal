import { z } from "zod";
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
  })
  .strict();
export type Policy = z.infer<typeof policySchema>;
export const draftPolicy: Policy = {
  timezone: "Asia/Kolkata",
  ideaLock: "2026-10-28T18:29:00.000Z",
  membershipFreeze: "2026-10-29T18:29:00.000Z",
  ideaReveal: "2026-11-01T02:30:00.000Z",
  submissionOpen: "2026-11-01T02:30:00.000Z",
  submissionClose: null,
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
  confirmations: [],
};
export function policyBlockers(p: Policy): string[] {
  const b: string[] = decisions.filter((d) => !p.confirmations.includes(d));
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
export function ist(value: string) {
  return (
    new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value)) + " IST"
  );
}
