import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import JudgingSettings, {
  judgingSettingsValues,
} from "../app/judging-settings";
import ResultVisibility, {
  currentResultSnapshots,
  PrivateAIEvaluation,
} from "../app/result-visibility";
import { Review } from "../app/portal";
import { draftPolicy } from "../lib/policy";
import { utcToISTInput } from "../app/owner-submission-window";
const run = async () => {
  throw new Error("No writes in render");
};
const owner = {
  id: "synthetic-owner",
  owner: true,
  role: "admin",
  email: "owner@example.invalid",
  name: "Owner",
};
const policy = {
  ...structuredClone(draftPolicy),
  judgingClose: "2026-11-02T12:00:21.000Z",
  engagementOpen: "2026-11-01T03:00:11.000Z",
  engagementClose: "2026-11-02T11:00:31.000Z",
  appealClose: "2026-11-02T10:00:42.000Z",
  diversityAssessment: "non-demographic-evidence" as const,
  diversityRubric: "Evidence of collaboration only.",
  codexReviewer: "Assigned Codex review owner",
  aiFallback:
    "Use reviewed existing evidence when automated grading is unavailable.",
  tieBreak: "Use the saved tie-break rules.",
  voteFormula: "sqrt-relative" as const,
  projectEngagementRule: "display-only" as const,
  scoringDisclosure: {
    criteria: "Saved criteria",
    weightage: "Saved weightage",
    confirmed: false,
  },
};
const input = () =>
  Object.fromEntries([
    ...["judgingClose", "engagementOpen", "engagementClose", "appealClose"].map(
      (key) => [
        key,
        utcToISTInput(policy[key as keyof typeof policy] as string),
      ],
    ),
    ...[
      "diversityAssessment",
      "diversityRubric",
      "codexReviewer",
      "aiFallback",
      "tieBreak",
      "voteFormula",
      "projectEngagementRule",
      "minJudges",
      "voteTarget",
      "feedbackTarget",
      "feedbackMin",
      "feedbackMax",
    ].map((key) => [key, String(policy[key as keyof typeof policy])]),
    ["criteria", "Saved criteria"],
    ["weightage", "Saved weightage"],
  ]);
const html = (component: any, props: any) =>
  renderToStaticMarkup(createElement(component, props));
test("judging save preserves all protected values and unchanged timestamp precision", () => {
  const result = judgingSettingsValues(policy, {
    ...input(),
    codexReviewer: "Different assigned reviewer",
  });
  assert.ok(result.policy);
  assert.equal(result.policy.codexReviewer, "Different assigned reviewer");
  for (const key of Object.keys(policy).filter(
    (key) => key !== "codexReviewer",
  ))
    assert.deepEqual(
      result.policy[key as keyof typeof policy],
      policy[key as keyof typeof policy],
      key,
    );
});
test("judging validates real IST dates, ordering, exact limits and explicit qualifications without defaults", () => {
  const invalid = judgingSettingsValues(policy, {
    ...input(),
    judgingClose: "2026-02-30T18:00",
    codexReviewer: "x".repeat(501),
    minJudges: "",
    feedbackMin: "501",
  });
  assert.ok(invalid.errors);
  for (const key of [
    "judgingClose",
    "codexReviewer",
    "minJudges",
    "feedbackMin",
  ])
    assert.ok(invalid.errors[key]);
  const missing = judgingSettingsValues(policy, {
    ...input(),
    projectEngagementRule: "score-with-approved-normalization",
  });
  assert.ok(missing.errors?.voters);
  assert.ok(missing.errors?.feedbackAuthors);
  assert.ok(missing.errors?.feedbackReview);
  assert.ok(missing.errors?.feedbackDuplicates);
  const complete = judgingSettingsValues(policy, {
    ...input(),
    projectEngagementRule: "score-with-approved-normalization",
    voters: "other-team",
    feedbackAuthors: "other-team",
    feedbackReview: "staff-qualified",
    feedbackDuplicates: "staff-reviewed",
  });
  assert.ok(complete.policy);
  assert.equal(complete.policy.engagementQualification?.confirmed, false);
  assert.equal(complete.policy.engagementQualification?.version, 1);
});
test("owner judging form is prehydration POST guarded, existing fields populated, frozen/read-only and never shown to admins", () => {
  assert.equal(
    html(JudgingSettings, {
      data: { me: { ...owner, owner: false }, policy },
      run,
      initiallyOpen: true,
    }),
    "",
  );
  const markup = html(JudgingSettings, {
    data: {
      me: owner,
      policy,
      policyVersion: 4,
      resultSnapshots: [{ id: "snapshot" }],
    },
    run,
    initiallyOpen: true,
  });
  assert.match(markup, /<form[^>]*method="post"/);
  assert.match(markup, /<form[^>]*inert=""/);
  assert.match(markup, /<fieldset disabled=""/);
  assert.match(
    markup,
    /value="Different assigned reviewer"|value="Assigned Codex review owner"/,
  );
  assert.match(markup, /Judging settings are read-only/);
  assert.doesNotMatch(
    markup,
    /name="weights|name="confirmations|name="reason|type="checkbox"/,
  );
});
test("result stages trust current backend controls and keep manual final independent of AI", () => {
  const data = {
    me: owner,
    policyVersion: 7,
    readiness: { scoring: { ready: false } },
    resultControls: {
      ai: { allowed: false, reason: "No provider reports." },
      freeze: { allowed: false, reason: "Frozen." },
      final: { allowed: true, reason: "" },
    },
    resultSnapshots: [
      {
        id: "snap",
        policy_version: 7,
        created_at: "2026-11-02T10:00:00Z",
        entryCount: 12,
        eligibleCount: 9,
      },
    ],
    scoreRelease: { stage: "community", aiRevealed: false },
  };
  assert.equal(currentResultSnapshots(data)[0].id, "snap");
  assert.deepEqual(
    currentResultSnapshots({
      ...data,
      policyVersion: 8,
      resultControls: { final: { allowed: false } },
      resultSnapshots: [
        ...data.resultSnapshots,
        { id: "older", policy_version: 5 },
      ],
    }),
    [],
  );
  const markup = html(ResultVisibility, { data, run });
  assert.match(markup, /9 eligible projects/);
  assert.doesNotMatch(markup, /<select/);
  assert.match(markup, /Reveal final scores/);
  assert.doesNotMatch(markup, /readiness|name="reason"/);
  const final = html(ResultVisibility, {
    data: {
      ...data,
      scoreRelease: {
        stage: "final",
        aiRevealed: false,
        releaseId: "release",
        remainingAwards: [{ position: 5 }, { position: 2 }],
      },
    },
    run,
  });
  assert.match(final, /AI scores were not revealed/);
  assert.match(final, /Award 5[\s\S]*Award 2/);
  assert.doesNotMatch(final, /Reveal AI scores/);
});
test("private AI uses exact current report, attempts and actual action blocker without scoringReady gate", () => {
  const data = {
    me: owner,
    project: { id: "p" },
    version: { id: "v" },
    scoringReady: false,
    evaluationConfigured: true,
    evaluationControl: { allowed: true, reason: "" },
    evaluationJob: { attempts: 2, maxAttempts: 3 },
    evaluation: {
      score: 19,
      report: {
        versionId: "v",
        status: "finalized",
        dimensions: { functionality: 4 },
      },
    },
  };
  const markup = html(PrivateAIEvaluation, { data, run });
  assert.match(markup, /Scored/);
  assert.match(markup, /19/);
  assert.match(markup, /2 \/ 3 evaluation attempts/);
  assert.doesNotMatch(markup, /configuration is incomplete/);
  const old = html(PrivateAIEvaluation, {
    data: { ...data, selectedIsCurrent: false, version: { id: "old" } },
    run,
  });
  assert.doesNotMatch(old, />19</);
  assert.match(old, /previous submission/);
  assert.equal(
    html(PrivateAIEvaluation, {
      data: { ...data, me: { role: "judge" } },
      run,
    }),
    "",
  );
});
test("Review renders saved version answers once, unknown Cerebras stays unavailable and old rubric controls are removed", () => {
  const data = {
    me: owner,
    project: {
      id: "p",
      team_id: "t",
      teamName: "Team",
      draft: { description: "DRAFT DO NOT SHOW" },
    },
    version: {
      id: "v",
      attempt: 2,
      payload: {
        projectName: "Saved project",
        problemSolution: "Saved problem",
        description: "Unique saved description",
        github: "https://github.com/example/project",
        demo: "https://example.invalid/path",
        ecosystemSelections: ["OpenAI API", "Parallel Agents"],
        cerebrasIntegration: "no",
      },
    },
    reviewKind: "admin",
    eligibility: { status: "needs_review" },
  };
  const markup = html(Review, { data, run });
  assert.equal(markup.split("Unique saved description").length - 1, 1);
  assert.match(markup, /OpenAI API/);
  assert.match(markup, /Parallel Agents/);
  assert.match(markup, /integrate Cerebras\?<\/dt><dd>No/);
  assert.match(markup, /example\/project/);
  assert.match(markup, /example.invalid/);
  assert.match(markup, /aria-label="Back"/);
  assert.equal((markup.match(/name="rating"/g) || []).length, 10);
  assert.doesNotMatch(
    markup,
    /Final judging rubric|Assign a reviewer|name="codex"|name="diversity"|DRAFT DO NOT SHOW|role="tablist"/,
  );
  const legacy = html(Review, {
    data: {
      ...data,
      version: { ...data.version, payload: { projectName: "Legacy" } },
      selectedIsCurrent: false,
    },
    run,
  });
  assert.equal((legacy.match(/Unavailable in this version/g) || []).length, 4);
  assert.doesNotMatch(legacy, /integrate Cerebras\?<\/dt><dd>No/);
  assert.match(legacy, /Viewing a previous submission/);
});
