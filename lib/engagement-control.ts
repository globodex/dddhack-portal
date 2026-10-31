import { communityVotingWindow } from "./community-window";
import type { PortalService } from "./service";
import { one } from "./db";
import { demand } from "./security";
export async function engagementState(s: PortalService) {
  const row = await one<{
    voting_paused: number;
    feedback_paused: number;
    version: number;
  }>(
    s.db,
    "SELECT voting_paused,feedback_paused,version FROM engagement_controls WHERE id=1",
  );
  const settings = await s.settings(true);
  const window = communityVotingWindow(settings.active === 1 ? settings.policy : {}, s.now());
  return {
    votingWindow: window,
    settingsVersion: settings.version,
    votingPaused: !window.allowed,
    feedbackPaused: false,
    version: row?.version || 0,
  };
}
/** Retired mutable controls are rejected, not silently applied by stale clients. */
export async function engagementControl(s: PortalService, action: string, _input: unknown) {
  if (action !== "engagement-control") return null;
  await s.staff();
  demand(false, 409, "ENGAGEMENT_CONTROLS_RETIRED", "Voting follows the submission window; comments remain open.");
  return null;
}
