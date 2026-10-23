export type Confirmation = {
  title: string;
  target: string;
  description: string;
  confirmLabel: string;
  critical: boolean;
};
export class ActionCancelled extends Error {
  constructor() {
    super("Action cancelled.");
  }
}
const labels: Record<string, string> = {
  "admin-status-bulk": "Change selected participant statuses",
  "admin-status": "Change individual or team status",
  "record-repository-evidence": "Record repository evidence",
  "lock-team": "Lock completed team",
  "update-credit-instructions": "Update shared Markdown instructions",
  "activate-operations": "Enable event operation",
  "qualify-project-feedback": "Record scoring feedback qualification",
  "save-workspace-idea": "Update team idea",
  "complete-profile": "Update profile",
  "save-project": "Update project draft",
  "submit-project": "Submit project version",
  "admin-idea-override":"Override private locked idea",
  "rename-team": "Rename your team",
  "team-style": "Update team appearance",
  "remove-workspace-member": "Remove team member",
  "respond-team": "Update membership request",
  "participant-bulk": "Update participants",
  "content-save": "Update event content draft",
  "content-publish": "Publish event content",
  "portal-role": "Update portal role",
  "venue-manager": "Update private venue permission",
  "publish-submission-extension": "Publish submission deadline extension",
  "publish-policy-weights": "Publish global scoring weights",
  "freeze-results": "Freeze final score snapshot",
  "reveal-ai-scores": "Reveal AI scores",
  "reveal-final-scores": "Reveal Final score",
  "unveil-winner": "Unveil award",
  logout: "Log out",
  "upvote-project": "Upvote project",
  "comment-project": "Post public comment",
  "review-project": "Save private review",
  review: "Update rubric review",
  "assign-project": "Update reviewer assignment",
  "set-project-eligibility": "Update project eligibility",
  "commit-import": "Import participants",
  "request-team": "Request team membership",
  "create-workspace-team": "Create team",
  "reevaluate-project": "Request AI re-evaluation",
};
export function confirmationFor(
  action: string,
  values: Record<string, any>,
  target: string,
): Confirmation {
  const critical = [
    "reveal-ai-scores",
    "reveal-final-scores",
    "unveil-winner",
    "freeze-results",
    "content-publish",
    "activate-operations",
    "lock-team",
    "submit-project",
    "publish-submission-extension",
    "publish-policy-weights",
  ].includes(action);
  const title = labels[action] || action.replaceAll("-", " ");
  let description =
    "Review this change before continuing. Cancel keeps the current state.";
  if (action === "content-publish")
    description =
      values.scope === "private"
        ? "Publish these directions to Going team members and authorized venue operators. The previous revision remains in protected history."
        : "Publish this content to everyone visiting the public Site. The previous revision remains in history.";
  if (action === "reveal-ai-scores")
    description =
      "Make persisted AI scores public and change leaderboard ordering. Public disclosure cannot be undone. This does not reveal the formula or private feedback.";
  if (action === "reveal-final-scores")
    description =
      "Start the public final-award stage. Top-five awards stay hidden until the manual unveiling; all remaining final positions stay undisclosed until every top-five award has been unveiled. Public disclosures cannot be undone.";
  if (action === "unveil-winner")
    description = `Reveal award ${values.position} to everyone. Its identity, position and score become public and cannot be withdrawn by this action.`;
  if (action === "publish-submission-extension")
    description =
      "Extend the public deadline for everyone by the previewed positive number of minutes. No existing submission is changed.";
  if (action === "publish-policy-weights")
    description =
      "Apply the previewed global weights to every team in one policy version. No team-specific override is possible. Frozen results block this change.";
  if (action === "activate-operations")
    description =
      "Enable only the selected operation under its confirmed operational rules. Judging and score reveals remain separately gated.";
  if (["admin-status", "admin-status-bulk"].includes(action))
    description =
      "Record this manual status with an audit reason. Attendance history, team lock and the three-submission limit remain intact. A Submitted label alone creates no public project. Checked in records manual attendance; personal credits remain bound to their recipient.";
  if (action === "lock-team")
    description =
      "Freeze this team’s membership and details for admin review. There is no unlock action. This does not approve any member.";
  if (action === "submit-project")
    description = `Commit submission ${Number(values.attemptsUsed || 0) + 1} of 3. This consumes one attempt; ${Math.max(0, 2 - Number(values.attemptsUsed || 0))} remain afterward. The third committed submission makes the entire project read-only. Draft saves consume no attempts.`;
  if (action === "logout")
    description =
      "End this Site session using managed ChatGPT sign-out. You can sign in again later.";
  if (action === "remove-workspace-member")
    description =
      "Remove this person from the team. Their private team access and Going-only venue access are checked again on the next request.";
  return {
    title,
    target,
    description,
    confirmLabel:
      action === "submit-project"
        ? "Commit submission"
        : action === "lock-team"
          ? "Lock team"
          : action === "logout"
            ? "Log out"
            : critical
              ? "Confirm public action"
              : "Confirm change",
    critical,
  };
}
export class ConfirmationGate {
  pending: Confirmation | null = null;
  private resolver: ((approved: boolean) => void) | null = null;
  constructor(private changed: (value: Confirmation | null) => void) {}
  ask(value: Confirmation) {
    if (this.resolver)
      throw new Error("Another action is awaiting confirmation.");
    this.pending = value;
    this.changed(value);
    return new Promise<boolean>((resolve) => {
      this.resolver = resolve;
    });
  }
  decide(approved: boolean) {
    const resolve = this.resolver;
    if (!resolve) return;
    this.resolver = null;
    this.pending = null;
    this.changed(null);
    resolve(approved);
  }
}
export function revealConfirmation(
  action: string,
  values: Record<string, any>,
) {
  return action==="admin-idea-override" ? "OVERRIDE_TEAM_IDEA" : ["admin-status", "admin-status-bulk"].includes(action)
    ? "CHANGE_STATUS"
    : action === "lock-team"
      ? "LOCK_TEAM"
      : action === "activate-operations"
        ? values.operation === "submissions"
          ? "ENABLE_SUBMISSIONS"
          : "ENABLE_CHECKIN"
        : action === "publish-submission-extension"
          ? "EXTEND_DEADLINE"
          : action === "publish-policy-weights"
            ? "GLOBAL_SCORING"
            : action === "reveal-ai-scores"
              ? "PUBLIC_AI"
              : action === "reveal-final-scores"
                ? "PUBLIC_FINAL"
                : action === "unveil-winner"
                  ? `UNVEIL_${values.position}`
                  : undefined;
}
