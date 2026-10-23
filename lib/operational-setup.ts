import { auditReason } from "./security";
import { z } from "zod";
import type { PortalService } from "./service";
import { assertPreviousWrite, type SQL } from "./db";
import { demand, sha256 } from "./security";
import { policySchema, operationalBlockers, ist, type Policy } from "./policy";
import {
  indefiniteRetentionNotice,
  optionalDeploymentRule,
} from "./operational-setup-contract";
const inputSchema = z
  .object({
    version: z.number().int().min(0),
    operation: z.enum(["submissions", "checkin"]),
    privacyConfirmed: z.literal(true),
    rulesConfirmed: z.literal(true),
    reason: auditReason(),
    token: z.string().optional(),
    confirmation: z.literal("CONFIRM_OPERATIONAL_SETUP").optional(),
  })
  .strict();
export async function operationalSetup(
  s: PortalService,
  action: string,
  input: unknown,
) {
  if (!["preview-operational-setup", "save-operational-setup"].includes(action))
    return null;
  const owner = await s.staff(true),
    d = inputSchema.parse(input),
    current = await s.settings(true);
  demand(d.version === current.version, 409, "POLICY_CHANGED_RELOAD");
  const required =
    d.operation === "submissions"
      ? ([
          "submissionOpen",
          "submissionCutoff",
          "deploymentRule",
          "privacyRetention",
        ] as const)
      : (["lumaPolicy", "privacyRetention"] as const);
  const next: Policy = policySchema.parse({
    ...current.policy,
    retentionNotice: indefiniteRetentionNotice,
    ...(d.operation === "submissions"
      ? { deploymentRule: optionalDeploymentRule }
      : { lumaRequired: false }),
    confirmations: [...new Set([...current.policy.confirmations, ...required])],
  });
  const blockers = operationalBlockers(next, d.operation);
  demand(
    blockers.length === 0,
    422,
    "OPERATION_POLICY_INCOMPLETE",
    blockers.join(", "),
  );
  const token = await sha256(
    JSON.stringify({
      owner: owner.id,
      version: current.version,
      operation: d.operation,
      policy: next,
      reason: d.reason,
    }),
  );
  if (action === "preview-operational-setup")
    return {
      token,
      version: current.version,
      operation: d.operation,
      retentionNotice: indefiniteRetentionNotice,
      ...(d.operation === "submissions"
        ? {
            open: next.submissionOpen,
            close: next.submissionClose,
            openIST: ist(next.submissionOpen),
            closeIST: ist(next.submissionClose!),
            deploymentRule: next.deploymentRule,
          }
        : {
            attendanceRule:
              "Individual portal Going approval is required. Luma is for registration only.",
          }),
      enablesOperations: false,
      scoringPolicyChanged: false,
      message: "Preview only. No configuration or operation was changed.",
    };
  demand(
    d.token === token && d.confirmation === "CONFIRM_OPERATIONAL_SETUP",
    422,
    "OPERATION_PREVIEW_CONFIRMATION_REQUIRED",
  );
  await s.unfrozen();
  const serialized = JSON.stringify(next);
  const sql: SQL[] =
    current.version === 0
      ? [
          [
            "INSERT INTO event_settings(id,policy,active,version) SELECT 1,?,0,1 WHERE NOT EXISTS(SELECT 1 FROM event_settings) AND NOT EXISTS(SELECT 1 FROM result_snapshots)",
            serialized,
          ],
        ]
      : [
          [
            "UPDATE event_settings SET policy=?,version=version+1 WHERE id=1 AND version=? AND NOT EXISTS(SELECT 1 FROM result_snapshots)",
            serialized,
            current.version,
          ],
        ];
  await s.mutate(
    owner.id,
    action,
    "event-policy",
    [
      ...sql,
      ...assertPreviousWrite(),
      [
        "INSERT INTO event_policy_history VALUES(?,?,?,?,?)",
        current.version + 1,
        serialized,
        owner.id,
        s.now(),
        d.reason,
      ],
    ],
    {
      operation: d.operation,
      policyVersion: current.version + 1,
      confirmationsAdded: required.filter(
        (v) => !current.policy.confirmations.includes(v),
      ),
      retention: "indefinite-until-authorized-manual-removal",
      activeUnchanged: true,
      scoringPolicyChanged: false,
    },
    d.reason,
  );
  return {
    version: current.version + 1,
    message: `${d.operation === "submissions" ? "Submission" : "Check-in"} setup confirmed. Operations were not enabled; use the separate Enable action when ready.`,
  };
}
