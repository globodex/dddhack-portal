import type { Operation, Policy } from "./policy";

const textPresent = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;
const timestamp = (value: unknown) =>
  typeof value === "string" && value.trim() ? Date.parse(value) : NaN;
const windowValid = (open: unknown, close: unknown) => {
  const start = timestamp(open),
    end = timestamp(close);
  return Number.isFinite(start) && Number.isFinite(end) && end > start;
};

/** Read-only derivation. Historical active/scope/acknowledgment flags are ignored. */
export function deriveOperational(
  policy: Policy,
  operation: Operation,
  now: string,
) {
  if (operation === "checkin")
    return {
      configured: true,
      enabled: true,
      allowed: true,
      state: "ready",
      message: "Check-in is ready.",
      blockers: [] as string[],
    };
  const blockers = windowValid(policy.submissionOpen, policy.submissionClose)
    ? []
    : ["valid submission window"];
  const configured = blockers.length === 0;
  const current = timestamp(now);
  if (!Number.isFinite(current)) blockers.push("valid current time");
  const state =
    !configured || !Number.isFinite(current)
      ? "setup-pending"
      : current < timestamp(policy.submissionOpen)
        ? "scheduled"
        : current >= timestamp(policy.submissionClose)
          ? "closed"
          : "open";
  const messages = {
    "setup-pending": "Set a valid submission window.",
    scheduled: "Submissions have not opened yet.",
    closed:
      "The submission deadline has passed. Committed versions are preserved.",
    open: "Submissions are open.",
  };
  return {
    configured,
    enabled: configured,
    allowed: state === "open",
    state,
    message: Number.isFinite(current)
      ? messages[state]
      : "Submission availability could not be determined.",
    blockers,
  };
}

/** Actual scoring configuration only. Never resolves missing rules or supplies weights. */
export function deriveScorePolicyBlockers(policy: Policy): string[] {
  const blockers: string[] = [];
  if (!windowValid(policy.submissionOpen, policy.submissionClose))
    blockers.push("valid submission window");
  if (!windowValid(policy.submissionClose, policy.judgingClose))
    blockers.push("valid judging window");
  if (
    !windowValid(policy.engagementOpen, policy.engagementClose) ||
    !Number.isFinite(timestamp(policy.ideaReveal)) ||
    timestamp(policy.engagementOpen) < timestamp(policy.ideaReveal)
  )
    blockers.push("valid engagement window");
  if (
    !textPresent(policy.diversityRubric) ||
    policy.diversityAssessment !== "non-demographic-evidence"
  )
    blockers.push("non-demographic diversity rubric");
  if (!["sqrt-relative", "fixed-target"].includes(policy.voteFormula))
    blockers.push("vote formula");
  if (!textPresent(policy.teamFormationRule))
    blockers.push("team-formation rule");
  if (
    !["display-only", "score-with-approved-normalization"].includes(
      policy.projectEngagementRule,
    )
  )
    blockers.push("public engagement scoring policy");
  for (const key of ["aiFallback", "tieBreak", "codexReviewer"] as const)
    if (!textPresent(policy[key])) blockers.push(key);
  if (
    !Number.isFinite(timestamp(policy.appealClose)) ||
    !Number.isFinite(timestamp(policy.judgingClose)) ||
    timestamp(policy.appealClose) > timestamp(policy.judgingClose)
  )
    blockers.push("appeal deadline");
  if (
    !Number.isInteger(policy.feedbackMin) ||
    !Number.isInteger(policy.feedbackMax) ||
    policy.feedbackMin < 30 ||
    policy.feedbackMax > 500 ||
    policy.feedbackMax < policy.feedbackMin
  )
    blockers.push("feedback limits");
  if (
    ![policy.voteTarget, policy.feedbackTarget, policy.minJudges].every(
      (value) => Number.isInteger(value) && value > 0,
    )
  )
    blockers.push("positive scoring targets and judge count");
  const weights = policy.weights;
  const keys = [
    "human",
    "ai",
    "votes",
    "diversity",
    "codex",
    "feedback",
  ] as const;
  if (
    !weights ||
    !keys.every(
      (key) =>
        typeof weights[key] === "number" &&
        Number.isFinite(weights[key]) &&
        weights[key] >= 0 &&
        weights[key] <= 1000,
    ) ||
    !keys.some((key) => weights[key] > 0)
  )
    blockers.push("explicit valid scoring weights");
  if (
    !textPresent(policy.scoringDisclosure?.criteria) ||
    !textPresent(policy.scoringDisclosure?.weightage)
  )
    blockers.push("scoring criteria and weightage");
  if (policy.projectEngagementRule === "score-with-approved-normalization") {
    const rules = policy.engagementQualification;
    const audiences = [
      "all-signed-in",
      "other-team",
      "approved-checked-in-other-team",
    ];
    if (
      !rules ||
      !Number.isInteger(rules.version) ||
      rules.version < 1 ||
      !audiences.includes(rules.voters) ||
      !audiences.includes(rules.feedbackAuthors) ||
      rules.feedbackReview !== "staff-qualified" ||
      !["staff-reviewed", "exclude-exact-normalized-copies"].includes(
        rules.feedbackDuplicates,
      )
    )
      blockers.push("engagement qualification rules");
  }
  return [...new Set(blockers)];
}
