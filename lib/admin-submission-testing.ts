import type { PortalService } from "./service";
import { one, assertPreviousWrite, type SQL } from "./db";
import { demand } from "./security";
import { z } from "zod";

/** Exact server-created capability; client flags never grant testing rights. */
export function adminSubmissionAuthority(
  actor: Awaited<ReturnType<PortalService["actor"]>>,
  teamId: string,
): SQL[] {
  const token = "admin-submission-authority:" + crypto.randomUUID();
  return [
    [
      `INSERT INTO write_guards VALUES(?,CASE WHEN EXISTS(
        SELECT 1 FROM users u LEFT JOIN portal_roles pr ON pr.user_id=u.id
        JOIN teams t ON t.leader_id=u.id JOIN memberships m ON m.team_id=t.id AND m.user_id=u.id
        WHERE u.id=? AND t.id=? AND (?=1 OR COALESCE(pr.role,u.role)='admin')
        AND NOT EXISTS(SELECT 1 FROM record_removals r WHERE r.active=1 AND ((r.kind='participant' AND r.target_id=u.id) OR (r.kind='team' AND r.target_id=t.id)))
        AND NOT EXISTS(SELECT 1 FROM terminal_record_deletions d WHERE (d.kind='participant' AND d.target_id=u.id) OR (d.kind='team' AND d.target_id=t.id))
      ) AND NOT EXISTS(SELECT 1 FROM result_snapshots) THEN 1 ELSE 0 END)`,
      token,
      actor.id,
      teamId,
      actor.owner ? 1 : 0,
    ],
    ["DELETE FROM write_guards WHERE token=?", token],
  ];
}

export async function removeOwnTestProject(
  s: PortalService,
  action: string,
  input: unknown,
) {
  if (action !== "admin-remove-own-test-project") return null;
  const actor = await s.staff();
  await s.unfrozen();
  const d = z
    .object({
      projectId: z.string().min(1).max(150),
      confirmation: z.literal("REMOVE_TEST_PROJECT"),
    })
    .strict()
    .parse(input);
  const team = await s.team(actor.id);
  demand(team && team.leader_id === actor.id, 403, "LEADER_REQUIRED");
  const project = await one<{ id: string; team_id: string }>(
    s.db,
    "SELECT id,team_id FROM projects WHERE id=? AND team_id=?",
    d.projectId,
    team.id,
  );
  demand(project, 404, "PROJECT_NOT_FOUND");
  await s.mutate(
    actor.id,
    action,
    project.id,
    [
      ...adminSubmissionAuthority(actor, team.id),
      [
        `INSERT INTO record_removals(kind,target_id,active,reason,actor_id,updated_at,snapshot)
       SELECT 'project',p.id,1,'Administrator removed own test project',?,?,'{}' FROM projects p
       JOIN teams t ON t.id=p.team_id JOIN memberships m ON m.team_id=t.id AND m.user_id=t.leader_id
       WHERE p.id=? AND t.id=? AND t.leader_id=? AND NOT EXISTS(SELECT 1 FROM result_snapshots)
       ON CONFLICT(kind,target_id) DO UPDATE SET active=1,reason=excluded.reason,actor_id=excluded.actor_id,updated_at=excluded.updated_at`,
        actor.id,
        s.now(),
        project.id,
        team.id,
        actor.id,
      ],
      ...assertPreviousWrite(),
    ],
    {
      recoverable: true,
      attemptsUnchanged: true,
      historyPreserved: true,
      ownTeamOnly: true,
    },
  );
  return {
    message:
      "Test project removed. Submission attempts and history are preserved.",
    projectId: project.id,
  };
}
