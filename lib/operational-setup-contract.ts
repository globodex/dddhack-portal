import { automaticAuditReason } from "./audit-contract";
export const eventRetentionNotice =
  "Unnecessary private participant data has a 90-day retention period after the event. Removal is handled manually; contact hey@itsparam.in. Public project showcase content remains unless removal is requested. Owner-only audit logs are retained indefinitely. Credit secrets are excluded from logs and ordinary exports.";
// Preserve the existing export for callers and stored-policy compatibility.
export const indefiniteRetentionNotice = eventRetentionNotice;
export const optionalDeploymentRule =
  "Deployment link is optional for every project. Missing deployment does not make a submission ineligible.";
export type SetupOperation = "submissions" | "checkin";
export type OperationalSetupRequest = {
  version: number;
  operation: SetupOperation;
  privacyConfirmed: true;
  rulesConfirmed: true;
  reason: string;
};
/** Used by the real Settings form and its API integration tests. No implicit checks. */
export function operationalSetupRequest(input: {
  version: number;
  operation: string;
  privacyConfirmed: boolean;
  rulesConfirmed: boolean;
  reason?: string;
}): OperationalSetupRequest {
  if (!Number.isInteger(input.version) || input.version < 0)
    throw new Error("Reload the current policy version before confirming.");
  if (input.operation !== "submissions" && input.operation !== "checkin")
    throw new Error("Choose submissions or check-in.");
  if (input.privacyConfirmed !== true || input.rulesConfirmed !== true)
    throw new Error("Review and explicitly confirm both policy statements.");
  const reason = input.reason?.trim() || automaticAuditReason;
  if (reason.length < 5 || reason.length > 1000)
    throw new Error("Invalid audit annotation.");
  return {
    version: input.version,
    operation: input.operation,
    privacyConfirmed: true,
    rulesConfirmed: true,
    reason,
  };
}
export function operationalSetupSave(
  request: OperationalSetupRequest,
  preview: { token: string; version: number; operation: string },
) {
  if (
    !preview.token ||
    preview.version !== request.version ||
    preview.operation !== request.operation
  )
    throw new Error("Preview the current operation and policy version first.");
  return {
    ...request,
    token: preview.token,
    confirmation: "CONFIRM_OPERATIONAL_SETUP" as const,
  };
}
