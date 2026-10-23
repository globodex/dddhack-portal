import { z } from "zod";
import type { PortalService } from "./service";
import { one, assertPreviousWrite } from "./db";
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
  return {
    votingPaused: !!row?.voting_paused,
    feedbackPaused: !!row?.feedback_paused,
    version: row?.version || 0,
  };
}
export async function engagementControl(
  s: PortalService,
  action: string,
  input: unknown,
) {
  if (action !== "engagement-control") return null;
  const actor = await s.staff(),
    d = z
      .object({
        votingPaused: z.boolean(),
        feedbackPaused: z.boolean(),
        version: z.number().int().min(0),
        reason: z.string().trim().min(5).max(1000),
        confirmation: z.literal("CHANGE_ENGAGEMENT"),
      })
      .strict()
      .parse(input);
  const current = await engagementState(s);
  demand(current.version === d.version, 409, "ENGAGEMENT_CHANGED_RELOAD");
  await s.mutate(
    actor.id,
    action,
    "community-engagement",
    [
      [
        "INSERT INTO engagement_controls VALUES(1,?,?,1,?,?) ON CONFLICT(id) DO UPDATE SET voting_paused=excluded.voting_paused,feedback_paused=excluded.feedback_paused,version=engagement_controls.version+1,actor_id=excluded.actor_id,updated_at=excluded.updated_at WHERE engagement_controls.version=?",
        d.votingPaused ? 1 : 0,
        d.feedbackPaused ? 1 : 0,
        actor.id,
        s.now(),
        d.version,
      ],
      ...assertPreviousWrite(),
    ],
    {
      before: current,
      after: { votingPaused: d.votingPaused, feedbackPaused: d.feedbackPaused },
      frozenScoresUnchanged: true,
    },
    d.reason,
  );
  return {
    message:
      "Community engagement controls updated. Existing frozen score snapshots are unchanged.",
    engagement: {
      votingPaused: d.votingPaused,
      feedbackPaused: d.feedbackPaused,
      version: d.version + 1,
    },
  };
}
