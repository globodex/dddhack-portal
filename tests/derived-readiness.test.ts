import { test } from "node:test";
import assert from "node:assert/strict";
import {
  deriveOperational,
  deriveScorePolicyBlockers,
} from "../lib/derived-readiness";
import { draftPolicy, type Policy } from "../lib/policy";
import { rehearsalPolicy } from "./helpers";
const now = "2026-11-01T04:00:00.000Z";
const staleFlags = (): Policy => ({
  ...draftPolicy,
  operationScopes: [],
  confirmations: [],
  lumaRequired: true,
  retentionNotice: "",
  deploymentRule: "",
});

test("check-in derives readiness without old scopes, acknowledgments or Luma flag", () => {
  const actual = deriveOperational(staleFlags(), "checkin", now);
  assert.deepEqual(actual, {
    configured: true,
    enabled: true,
    allowed: true,
    state: "ready",
    message: "Check-in is ready.",
    blockers: [],
  });
});
test("submission readiness derives actual finite window and exact boundaries without old flags", () => {
  const policy = staleFlags();
  assert.equal(deriveOperational(policy, "submissions", now).allowed, true);
  assert.equal(
    deriveOperational(policy, "submissions", "2026-11-01T02:29:59.999Z").state,
    "scheduled",
  );
  assert.equal(
    deriveOperational(policy, "submissions", policy.submissionOpen).state,
    "open",
  );
  assert.equal(
    deriveOperational(policy, "submissions", policy.submissionClose!).state,
    "closed",
  );
  assert.equal(
    deriveOperational(policy, "submissions", "2026-11-02T04:00:00.000Z")
      .allowed,
    false,
  );
  for (const invalid of [
    null,
    "not-a-date",
    policy.submissionOpen,
    "2026-10-31T04:00:00.000Z",
  ]) {
    const state = deriveOperational(
      { ...policy, submissionClose: invalid },
      "submissions",
      now,
    );
    assert.equal(state.configured, false);
    assert.equal(state.enabled, false);
    assert.equal(state.allowed, false);
    assert.deepEqual(state.blockers, ["valid submission window"]);
  }
  assert.equal(
    deriveOperational(policy, "submissions", "invalid-now").allowed,
    false,
  );
  assert.ok(
    deriveOperational(policy, "submissions", "invalid-now").blockers.includes(
      "valid current time",
    ),
  );
  assert.equal(
    deriveOperational(
      {
        ...policy,
        submissionOpen: "2026-11-01T08:00:00+05:30",
        submissionClose: "2026-11-01T16:00:00+05:30",
      },
      "submissions",
      now,
    ).allowed,
    true,
  );
});
test("resolved actual synthetic scoring data ignores acknowledgment booleans and confirmation array", () => {
  const policy: Policy = {
    ...rehearsalPolicy,
    confirmations: [],
    operationScopes: [],
    scoringDisclosure: {
      ...rehearsalPolicy.scoringDisclosure!,
      confirmed: false,
    },
  };
  const before = JSON.stringify(policy);
  assert.deepEqual(deriveScorePolicyBlockers(policy), []);
  assert.equal(JSON.stringify(policy), before);
  const qualified: Policy = {
    ...policy,
    projectEngagementRule: "score-with-approved-normalization",
    engagementQualification: {
      confirmed: false,
      version: 1,
      voters: "other-team",
      feedbackAuthors: "other-team",
      feedbackReview: "staff-qualified",
      feedbackDuplicates: "staff-reviewed",
    },
  };
  assert.deepEqual(deriveScorePolicyBlockers(qualified), []);
});
test("removing manual acknowledgments does not resolve absent scoring decisions or weights", () => {
  const draft = deriveScorePolicyBlockers({
    ...draftPolicy,
    confirmations: [],
  });
  for (const blocker of [
    "valid judging window",
    "valid engagement window",
    "non-demographic diversity rubric",
    "public engagement scoring policy",
    "aiFallback",
    "tieBreak",
    "codexReviewer",
    "appeal deadline",
    "scoring criteria and weightage",
  ])
    assert.ok(draft.includes(blocker), blocker);
  for (const weights of [
    undefined,
    { ...rehearsalPolicy.weights, human: NaN },
    { ...rehearsalPolicy.weights, ai: -1 },
    { human: 0, ai: 0, votes: 0, diversity: 0, codex: 0, feedback: 0 },
  ]) {
    assert.ok(
      deriveScorePolicyBlockers({
        ...rehearsalPolicy,
        weights,
      } as Policy).includes("explicit valid scoring weights"),
    );
  }
  assert.ok(
    deriveScorePolicyBlockers({
      ...rehearsalPolicy,
      scoringDisclosure: { criteria: "", weightage: "", confirmed: true },
    }).includes("scoring criteria and weightage"),
  );
  assert.ok(
    deriveScorePolicyBlockers({
      ...rehearsalPolicy,
      projectEngagementRule: "score-with-approved-normalization",
      engagementQualification: null,
    }).includes("engagement qualification rules"),
  );
});
