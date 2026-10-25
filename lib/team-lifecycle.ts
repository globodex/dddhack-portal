/** Read-only lifecycle, independent from personal attendance and manual display overrides. */
export function teamLifecycle(input: {
  locked: boolean;
  attempts: number;
  total: number;
  approved: number;
  windowOpened?: boolean;
}) {
  if (input.attempts > 0) return "Submitted";
  if (!input.locked) return "Forming";
  if (input.total > 0 && input.total === input.approved)
    return input.windowOpened ? "Yet to submit" : "Approved";
  return "Locked";
}
export function submissionWindowHasOpened(
  policy: { submissionOpen?: unknown; submissionClose?: unknown },
  now: string,
) {
  const start =
    typeof policy.submissionOpen === "string"
      ? Date.parse(policy.submissionOpen)
      : NaN;
  const end =
    typeof policy.submissionClose === "string"
      ? Date.parse(policy.submissionClose)
      : NaN;
  const current = Date.parse(now);
  return (
    Number.isFinite(start) &&
    Number.isFinite(end) &&
    end > start &&
    Number.isFinite(current) &&
    current >= start
  );
}
