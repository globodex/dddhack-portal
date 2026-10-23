import { z } from "zod";
import type { PortalService } from "./service";
import { one, assertPreviousWrite } from "./db";
import { demand, sha256 } from "./security";
import { ist, policySchema, weightsSchema, type Policy } from "./policy";
export function weightage(weights: Policy["weights"]) {
  return `${weights.human} human + ${weights.ai} AI + ${weights.votes} votes + ${weights.diversity} diversity + ${weights.codex} Codex; up to ${weights.feedback} feedback bonus (maximum ${Object.values(weights).reduce((a, b) => a + b, 0)}).`;
}
export async function policyControl(
  s: PortalService,
  action: string,
  input: unknown,
) {
  if (
    ![
      "preview-submission-extension",
      "publish-submission-extension",
      "preview-policy-weights",
      "publish-policy-weights",
    ].includes(action)
  )
    return null;
  const actor = await s.staff(true);
  const d = z
    .object({
      version: z.number().int().min(0),
      minutes: z.number().int().positive().max(525600).optional(),
      weights: weightsSchema.optional(),
      preview: z.string().optional(),
      confirmation: z.string().optional(),
      reason: z.string().trim().min(5).max(1000).optional(),
    })
    .strict()
    .parse(input);
  const current = await s.settings(true);
  demand(d.version === current.version, 409, "POLICY_CHANGED_RELOAD");
  const extending = action.includes("extension");
  const next: Policy = { ...current.policy };
  if (extending) {
    demand(
      d.minutes && current.policy.submissionClose,
      422,
      "POSITIVE_EXTENSION_REQUIRED",
    );
    const prior = Date.parse(current.policy.submissionClose),
      time = prior + d.minutes * 60000;
    demand(
      Number.isSafeInteger(time) &&
        time > prior &&
        Number.isFinite(new Date(time).getTime()),
      422,
      "INVALID_DEADLINE_EXTENSION",
    );
    next.submissionClose = new Date(time).toISOString();
  } else {
    demand(
      d.weights && Object.values(d.weights).some((n) => n > 0),
      422,
      "POSITIVE_SCORING_WEIGHT_REQUIRED",
    );
    next.weights = d.weights;
  }
  const preview = await sha256(
    JSON.stringify({
      version: current.version,
      kind: extending ? "deadline" : "weights",
      before: current.policy,
      after: next,
    }),
  );
  if (action.startsWith("preview-"))
    return {
      preview,
      version: current.version,
      warnings:
        extending &&
        current.policy.judgingClose &&
        next.submissionClose! >= current.policy.judgingClose
          ? [
              "The new deadline reaches the current judging close. Final scoring stays blocked until the owner confirms a later judging window.",
            ]
          : [],
      ...(extending
        ? {
            before: current.policy.submissionClose,
            after: next.submissionClose,
            label: ist(next.submissionClose!),
          }
        : { weights: next.weights, label: weightage(next.weights) }),
      message: "Preview only. No policy change was saved.",
    };
  demand(
    d.preview === preview &&
      d.confirmation === (extending ? "EXTEND_DEADLINE" : "GLOBAL_SCORING"),
    422,
    "POLICY_PREVIEW_CONFIRMATION_REQUIRED",
  );
  demand(d.reason, 422, "REASON_REQUIRED");
  // An immutable result snapshot binds one global policy version. Never mix weights after freeze.
  demand(
    !(await one(s.db, "SELECT id FROM result_snapshots LIMIT 1")),
    409,
    "RESULTS_FROZEN",
  );
  const serialized = JSON.stringify(policySchema.parse(next));
  await s.mutate(
    actor.id,
    action,
    "event-policy",
    [
      [
        "INSERT INTO event_settings(id,policy,active,version) SELECT 1,?,0,1 WHERE NOT EXISTS(SELECT 1 FROM event_settings) AND NOT EXISTS(SELECT 1 FROM result_snapshots) AND ?=0",
        serialized,
        d.version,
      ],
      // For an existing event, CAS is performed separately below. The first insert is
      // intentionally a no-op; its changes() must not be used as the write assertion.
      ...(current.version === 0
        ? []
        : [
            [
              "UPDATE event_settings SET policy=?,version=version+1 WHERE id=1 AND version=? AND NOT EXISTS(SELECT 1 FROM result_snapshots)",
              serialized,
              d.version,
            ] as [string, ...unknown[]],
          ]),
      ...assertPreviousWrite(),
      [
        "INSERT INTO event_policy_history VALUES(?,?,?,?,?)",
        current.version + 1,
        serialized,
        actor.id,
        s.now(),
        d.reason,
      ],
    ],
    {
      version: current.version + 1,
      ...(extending
        ? {
            before: current.policy.submissionClose,
            after: next.submissionClose,
            minutes: d.minutes,
          }
        : { before: current.policy.weights, after: next.weights }),
    },
    d.reason,
  );
  return {
    message: extending
      ? `Submission deadline extended to ${ist(next.submissionClose!)}.`
      : "Global scoring weights updated for every team.",
    version: current.version + 1,
  };
}
