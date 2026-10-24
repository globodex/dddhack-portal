const errors: Record<string, string> = {
  APPROVAL_REQUIRED: "Registration approval is needed for this action.",
  SIGN_IN_REQUIRED: "Sign in to continue.",
  AUTH_REQUIRED: "Sign in to continue.",
  ADMIN_REQUIRED: "This page is available to event administrators.",
  OWNER_REQUIRED: "This action is available to the event owner.",
  LEADER_REQUIRED: "Only your team leader can make this change.",
  TEAM_FULL: "This team already has five members.",
  ALREADY_IN_TEAM: "You already belong to a team.",
  MEMBERSHIP_FROZEN: "Team membership is locked for the event.",
  TEAM_LOCKED: "This team is locked. Contact an organizer if it needs a correction.",
  REGISTERED_ACCOUNT_REQUIRED: "Invite someone whose registered account is approved.",
  REQUEST_NOT_PENDING: "This invitation or request has already been answered. Refresh to see its status.",
};

export function portalErrorText(body: { code?: string; message?: string }) {
  // Preserve specific server explanations and every unknown actionable error.
  if (body.message && body.message !== body.code) return body.message;
  return errors[body.code || ""] || body.message || body.code || "The request could not be completed.";
}

const successes: Record<string, string> = {
  "complete-profile": "Profile saved.",
  "create-workspace-team": "Team created.",
  "save-workspace-idea": "Team idea saved.",
  "team-style": "Team color updated.",
  "team-invite": "Invitation added to the portal.",
  "review-project": "Review saved.",
  review: "Score saved.",
  "content-save": "Draft saved.",
  "content-publish": "Content published.",
  "admin-status": "Status updated.",
  "admin-status-bulk": "Statuses updated.",
  "update-credit-instructions": "Credit instructions saved.",
};
export function portalSuccessText(action: string, message?: string) {
  return successes[action] || message || "Saved.";
}
