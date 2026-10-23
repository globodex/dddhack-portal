import { z } from "zod";
import type { PortalService } from "./service";
import { one, assertPreviousWrite } from "./db";
import { demand } from "./security";

const id = z.string().trim().min(1).max(200);
export const teamLeaderTransferSchema = z
  .object({
    teamId: id,
    userId: id,
    expectedLeaderId: id,
    confirmation: z.literal("TRANSFER_TEAM_LEADER"),
  })
  .strict();

type TeamTarget = {
  id: string;
  name: string;
  leader_id: string;
  leader_name: string;
};

/** Staff-only correction of the crown. No membership, lock or project mutation. */
export async function transferTeamLeader(s: PortalService, input: unknown) {
  const actor = await s.staff();
  const d = teamLeaderTransferSchema.parse(input);
  await s.unfrozen();
  const team = await one<TeamTarget>(
    s.db,
    "SELECT t.id,t.name,t.leader_id,COALESCE(NULLIF(pp.display_name,''),u.name) leader_name FROM teams t JOIN users u ON u.id=t.leader_id LEFT JOIN participant_profiles pp ON pp.user_id=u.id WHERE t.id=? AND NOT EXISTS(SELECT 1 FROM record_removals r WHERE r.kind='team' AND r.target_id=t.id AND r.active=1)",
    d.teamId,
  );
  demand(team, 404, "TEAM_NOT_FOUND");
  demand(
    team.leader_id === d.expectedLeaderId,
    409,
    "TEAM_LEADER_CHANGED",
    "The team leader changed. Refresh the team before transferring leadership.",
  );
  demand(team.leader_id !== d.userId, 409, "ALREADY_TEAM_LEADER");
  const next = await one<{ id: string; name: string }>(
    s.db,
    "SELECT u.id,COALESCE(NULLIF(pp.display_name,''),u.name) name FROM memberships m JOIN users u ON u.id=m.user_id LEFT JOIN participant_profiles pp ON pp.user_id=u.id WHERE m.team_id=? AND m.user_id=? AND NOT EXISTS(SELECT 1 FROM record_removals r WHERE r.kind='participant' AND r.target_id=u.id AND r.active=1)",
    team.id,
    d.userId,
  );
  demand(
    next,
    409,
    "CURRENT_TEAMMATE_REQUIRED",
    "Choose an active current teammate.",
  );
  // The locked-team trigger recognizes only this exact old/new/team tuple, and
  // still rejects changes to all other team fields. The guard lives in the same
  // transaction as the CAS, its result assertion, cleanup and safe audit row.
  const guard =
    "admin-leader-transfer:" +
    JSON.stringify([team.id, team.leader_id, next.id]);
  await s.mutate(
    actor.id,
    "transfer-team-leader",
    team.id,
    [
      ["INSERT INTO write_guards VALUES(?,1)", guard],
      [
        "UPDATE teams SET leader_id=? WHERE id=? AND leader_id=? AND EXISTS(SELECT 1 FROM memberships m WHERE m.team_id=teams.id AND m.user_id=?) AND NOT EXISTS(SELECT 1 FROM record_removals r WHERE r.active=1 AND ((r.kind='team' AND r.target_id=teams.id) OR (r.kind='participant' AND r.target_id=?))) AND NOT EXISTS(SELECT 1 FROM result_snapshots)",
        next.id,
        team.id,
        d.expectedLeaderId,
        next.id,
        next.id,
      ],
      ...assertPreviousWrite(),
      ["DELETE FROM write_guards WHERE token=?", guard],
    ],
    {
      team: { id: team.id, name: team.name },
      oldLeader: { id: team.leader_id, name: team.leader_name },
      newLeader: { id: next.id, name: next.name },
      membershipPreserved: true,
      lockPreserved: true,
    },
  );
  return {
    teamId: team.id,
    leaderId: next.id,
    previousLeaderId: team.leader_id,
    message: "Team leader updated.",
  };
}
