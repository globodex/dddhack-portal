export type Confirmation = {
  title: string;
  target: string;
  description: string;
  confirmLabel: string;
  critical: boolean;
  badge?: string;
  note?: string;
  tone?: "default" | "positive" | "danger";
  opener?: HTMLElement | null;
  importWebsites?: { row: number; url: string }[];
};
export class ActionCancelled extends Error {
  constructor() {
    super("Action cancelled.");
  }
}
const labels: Record<string, string> = {
  "transfer-team-leader": "Transfer team leadership",
  "publish-credit-batch": "Publish credit batch",
  "delete-credit-batch": "Delete credit batch",
  "delete-credit-column": "Delete credit column",
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
  "admin-idea-override": "Override private locked idea",
  "admin-add-team-idea": "Add team idea",
  "rename-team": "Rename your team",
  "admin-add-team-member": "Add team member?",
  "admin-remove-team-member": "Remove team member?",
  "admin-remove-own-test-project": "Remove your test project?",
  "admin-rename-team": "Rename team?",
  "admin-unlock-team": "Unlock team?",
  "change-ai-model": "Change AI model?",
  "admin-lock-team": "Lock team?",
  "leave-workspace-team": "Leave team?",
  "admin-delete-participant": "Delete participant?",
  "admin-delete-team": "Delete team?",
  "team-style": "Update team appearance",
  "remove-workspace-member": "Remove team member",
  "respond-team": "Update membership request",
  "bulk-check-in": "Check in selected participants",
  "participant-bulk": "Update participants",
  "content-save": "Update event content draft",
  "content-publish": "Publish event content",
  "portal-role": "Update portal role",
  "add-admin": "Add admin",
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
  settings: "Save judging setup?",
};
export function confirmationFor(
  action: string,
  values: Record<string, any>,
  target: string,
): Confirmation {
  const critical = [
    "transfer-team-leader",
    "publish-credit-batch",
    "delete-credit-batch",
    "delete-credit-column",
    "reveal-ai-scores",
    "reveal-final-scores",
    "unveil-winner",
    "freeze-results",
    "content-publish",
    "activate-operations",
    "lock-team",
    "admin-unlock-team",
    "admin-lock-team",
    "submit-project",
    "publish-submission-extension",
    "publish-policy-weights",
  ].includes(action);
  const title = labels[action] || action.replaceAll("-", " ");
  let description = "";
  if (action === "leave-workspace-team")
    return {
      title,
      target,
      description: "You will lose access to this team's private workspace.",
      confirmLabel: "Leave team",
      critical: false,
      tone: "danger",
    };
  if (action === "admin-unlock-team")
    return {
      title,
      target,
      description:
        "Remove the team lock. Participant deadlines still apply; members and history stay intact.",
      confirmLabel: "Unlock team",
      critical: true,
    };
  if (action === "admin-lock-team")
    return {
      title,
      target: values.expectedName || target,
      description:
        "Lock team and idea editing. Member approval stays unchanged.",
      confirmLabel: "Lock team",
      critical: true,
    };
  if (action === "admin-delete-participant") {
    const summary = values.participantDeleteSummary;
    return {
      title,
      target,
      description:
        summary?.teamCount > 0
          ? `Their ${summary.teamCount > 1 ? `${summary.teamCount} teams, ideas, projects` : "team, idea, project"} and all submissions will also be deleted. Other members stay registered.`
          : `Delete their profile and participation.${summary?.memberTeamName ? " Their team stays intact." : ""}`,
      ...(summary?.teamNames?.length
        ? {
            badge:
              summary.teamNames.length < 3
                ? summary.teamNames.join(" · ")
                : `${summary.teamCount} teams`,
          }
        : {}),
      note: "This cannot be undone.",
      confirmLabel: "Delete participant",
      critical: true,
      tone: "danger",
    };
  }
  if (action === "admin-delete-team")
    return {
      title,
      target,
      description:
        "Delete this team, idea, project and all submissions. Members stay registered.",
      note: "This cannot be undone.",
      confirmLabel: "Delete team",
      critical: true,
      tone: "danger",
    };
  if (action === "change-ai-model") return { title, target: values.model, description: "Use this model for future evaluations. Existing scores stay unchanged. Saving does not verify API access.", confirmLabel: "Save model", critical: false };
  if (action === "settings")
    return {
      title,
      target: "Judging setup",
      description: "Save these judging settings. Scores stay private.",
      confirmLabel: "Save settings",
      critical: false,
    };
  if (action === "reevaluate-project")
    return {
      title: "Run AI evaluation?",
      target,
      description: "Evaluate this version using its approved source snapshot.",
      confirmLabel: "Run evaluation",
      critical: false,
    };
  if (action === "admin-add-team-member")
    return {
      title,
      target: `${values.email} → ${target}`,
      description: "They will gain access to this team's private details.",
      confirmLabel: "Add member",
      critical: false,
    };
  if (action === "admin-remove-team-member")
    return {
      title,
      target,
      description:
        "Remove them from this team. Their participant account stays intact.",
      confirmLabel: "Remove member",
      critical: false,
      tone: "danger",
    };
  if (action === "admin-remove-own-test-project")
    return {
      title,
      target,
      description:
        "Remove this project from view. Submission history and the three-attempt limit stay unchanged.",
      note: "An admin can restore it.",
      confirmLabel: "Remove test project",
      critical: true,
      tone: "danger",
    };
  if (action === "admin-rename-team")
    return {
      title,
      target: `${values.expectedName} → ${values.name}`,
      description: "",
      confirmLabel: "Rename team",
      critical: false,
    };
  if (action === "admin-add-team-idea") return { title: "Add team idea?", target, description: "Create the missing idea for this team. Existing ideas will not be overwritten.", confirmLabel: "Add idea", critical: false };
  if (action === "submit-project") {
    const used = Number(values.attemptsUsed);
    const attempt =
      Number.isInteger(used) && used >= 0 ? Math.min(3, used + 1) : 1;
    const left = 3 - attempt;
    return {
      title: "Submit project?",
      target,
      badge: `Commit submission ${attempt}/3`,
      description: left
        ? `You’ll have ${left} ${left === 1 ? "submission" : "submissions"} left.`
        : "No submissions left after this.",
      ...(left === 0 ? { note: "The project will be read-only." } : {}),
      confirmLabel: "Submit project",
      critical: true,
      tone: "positive",
    };
  }
  if (action === "transfer-team-leader")
    description =
      "Give this teammate the crown. Team and submission history stay intact.";
  if (action === "publish-credit-batch")
    description = "Assign available codes to eligible checked-in recipients.";
  if (action === "delete-credit-batch" || action === "delete-credit-column")
    description =
      "Delete this inventory and recipient mappings. Already shared codes cannot be recalled.";
  if (action === "content-publish")
    description =
      values.scope === "private"
        ? "Publish to Going or Checked in attendees and permitted staff."
        : "Publish this content to everyone.";
  if (action === "reveal-ai-scores")
    description = "Make AI scores public. This cannot be undone.";
  if (action === "reveal-final-scores")
    description =
      "Start final reveals. The top five stay hidden until you unveil them. Public reveals cannot be undone.";
  if (action === "unveil-winner")
    description = `Reveal award ${values.position} to everyone. This cannot be undone.`;
  if (action === "publish-submission-extension")
    description = "Apply the new submission deadline to everyone.";
  if (action === "publish-policy-weights")
    description = "Apply these scoring weights to every team.";
  if (action === "activate-operations")
    description = "Enable the selected event operation.";
  if (["admin-status", "admin-status-bulk"].includes(action))
    description =
      "Update the selected status. Attendance and submission history stay intact.";
  if (action === "lock-team")
    description =
      "Membership and idea details become read-only. Only an admin can reopen an eligible team.";
  if (action === "freeze-results")
    description =
      "Freeze the current final scores. Scoring changes will be blocked.";
  if (action === "remove-workspace-member")
    description = "They will lose access to this team's private details.";
  return {
    title,
    target,
    description,
    confirmLabel:
      action === "transfer-team-leader"
        ? "Transfer crown"
        : action === "review-project"
          ? "Save review"
          : action === "freeze-results"
            ? "Freeze scores"
            : action === "reveal-ai-scores"
              ? "Reveal AI scores"
              : action === "reveal-final-scores"
                ? "Reveal final scores"
                : action === "unveil-winner"
                  ? "Unveil award"
                  : action === "publish-credit-batch"
                    ? "Publish credits"
                    : ["delete-credit-batch", "delete-credit-column"].includes(
                          action,
                        )
                      ? "Delete credits"
                      : action === "submit-project"
                        ? "Commit submission"
                        : action === "lock-team"
                          ? "Lock team"
                          : action === "logout"
                            ? "Log out"
                            : critical
                              ? "Confirm public action"
                              : "Confirm change",
    critical,
    ...([
      "delete-credit-batch",
      "delete-credit-column",
      "remove-workspace-member",
    ].includes(action)
      ? { tone: "danger" as const }
      : {}),
  };
}
export class ConfirmationGate {
  pending: Confirmation | null = null;
  private resolver: ((approved: boolean) => void) | null = null;
  constructor(private changed: (value: Confirmation | null) => void) {}
  ask(value: Confirmation) {
    if (this.resolver)
      throw new Error("Another action is awaiting confirmation.");
    // Capture before a pending render disables the initiating control.
    const opener =
      typeof document === "undefined"
        ? null
        : (document.activeElement as HTMLElement | null);
    this.pending = opener ? { ...value, opener } : value;
    this.changed(this.pending);
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
  if (action === "change-ai-model") return "CHANGE_AI_MODEL";
  if (action === "admin-delete-participant") return "DELETE_PARTICIPANT";
  if (action === "admin-delete-team") return "DELETE_TEAM";
  if (action === "bulk-check-in") return "CHECK_IN_PARTICIPANTS";
  if (action === "transfer-team-leader") return "TRANSFER_TEAM_LEADER";
  if (action === "publish-credit-batch") return "PUBLISH_CREDIT_BATCH";
  if (action === "delete-credit-batch") return "DELETE_CREDIT_BATCH";
  if (action === "delete-credit-column") return "DELETE_CREDIT_COLUMN";
  if (action === "add-admin") return "ADD_ADMIN";
  if (action === "admin-add-team-member") return "ADD_TEAM_MEMBER";
  if (action === "admin-add-team-idea") return "ADD_TEAM_IDEA";
  if (action === "admin-remove-team-member") return "REMOVE_TEAM_MEMBER";
  if (action === "admin-remove-own-test-project") return "REMOVE_TEST_PROJECT";
  if (action === "admin-rename-team") return "RENAME_TEAM";
  if (action === "admin-unlock-team") return "UNLOCK_TEAM";
  if (action === "admin-lock-team") return "ADMIN_LOCK_TEAM";
  if (action === "leave-workspace-team") return "LEAVE_TEAM";
  return action === "admin-idea-override"
    ? "OVERRIDE_TEAM_IDEA"
    : ["admin-status", "admin-status-bulk"].includes(action)
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

export function requiresActionConfirmation(action: string) {
  return ![
    "upvote-project",
    "complete-profile",
    "profile",
    "quick-check-in",
    "admin-reveal-credit",
    "repair-credit-allocations",
  ].includes(action);
}
