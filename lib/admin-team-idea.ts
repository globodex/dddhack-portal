import { z } from "zod";
import type { PortalService } from "./service";
import { one, assertPreviousWrite, type SQL } from "./db";
import { demand, text, sha256 } from "./security";

/** Admin correction is creation only: never an upsert or implicit idea override. */
export async function addMissingTeamIdea(
  s: PortalService,
  action: string,
  input: unknown,
) {
  if (action !== "admin-add-team-idea") return null;
  const actor = await s.staff();
  await s.unfrozen();
  const data = z
    .object({
      teamId: z.string().trim().min(1).max(200),
      title: text(120).min(2),
      description: text(500),
      confirmation: z.literal("ADD_TEAM_IDEA"),
    })
    .strict()
    .parse(input);
  const activeTeam = () =>
    one(
      s.db,
      `SELECT t.id FROM teams t WHERE t.id=? AND NOT EXISTS(SELECT 1 FROM record_removals r WHERE r.kind='team' AND r.target_id=t.id AND r.active=1) AND NOT EXISTS(SELECT 1 FROM terminal_record_deletions d WHERE d.kind='team' AND d.target_id=t.id)`,
      data.teamId,
    );
  demand(await activeTeam(), 404, "TEAM_NOT_FOUND");
  const exists = () =>
    one(s.db, "SELECT team_id FROM ideas WHERE team_id=?", data.teamId);
  demand(
    !(await exists()),
    409,
    "TEAM_IDEA_EXISTS",
    "This team already has a saved idea. Refresh its card.",
  );
  const hash = await sha256(
      JSON.stringify({ title: data.title, description: data.description }),
    ),
    time = s.now();
  const capability =
    "admin-add-idea:" + JSON.stringify([data.teamId, hash, time]);
  const authority = "admin-add-idea-authority:" + crypto.randomUUID();
  const sql: SQL[] = [
    [
      `INSERT INTO write_guards VALUES(?,CASE WHEN EXISTS(SELECT 1 FROM users u LEFT JOIN portal_roles p ON p.user_id=u.id JOIN teams t ON t.id=? WHERE u.id=? AND (?=1 OR COALESCE(p.role,u.role)='admin') AND NOT EXISTS(SELECT 1 FROM record_removals r WHERE r.active=1 AND ((r.kind='participant' AND r.target_id=u.id) OR (r.kind='team' AND r.target_id=t.id))) AND NOT EXISTS(SELECT 1 FROM terminal_record_deletions d WHERE (d.kind='participant' AND d.target_id=u.id) OR (d.kind='team' AND d.target_id=t.id))) AND NOT EXISTS(SELECT 1 FROM result_snapshots) THEN 1 ELSE 0 END)`,
      authority,
      data.teamId,
      actor.id,
      actor.owner ? 1 : 0,
    ],
    ["DELETE FROM write_guards WHERE token=?", authority],
    ["INSERT INTO write_guards VALUES(?,1)", capability],
    [
      "INSERT INTO ideas(team_id,title,core,description,hash,updated_at) SELECT ?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM ideas WHERE team_id=?) ON CONFLICT(team_id) DO NOTHING",
      data.teamId,
      data.title,
      data.description,
      data.description,
      hash,
      time,
      data.teamId,
    ],
    ...assertPreviousWrite(),
    [
      "INSERT INTO idea_revisions VALUES(?,?,?,?)",
      crypto.randomUUID(),
      data.teamId,
      JSON.stringify({
        title: data.title,
        core: data.description,
        description: data.description,
        hash,
        author: actor.id,
        previous: null,
        adminAdded: true,
      }),
      time,
    ],
    ["DELETE FROM write_guards WHERE token=?", capability],
  ];
  try {
    await s.mutate(
      actor.id,
      action,
      data.teamId,
      sql,
      { teamId: data.teamId, title: data.title, hash, createdOnly: true },
      "Administrator added missing team idea",
    );
  } catch (error) {
    // A stale card/concurrent create fails the conditional-write guard and rolls
    // back audit/revision/capability writes. Never turn this into an overwrite.
    if (
      /write_guards|CHECK constraint failed|duplicate key|serialization/i.test(
        error instanceof Error ? error.message : String(error),
      )
    ) {
      await s.staff();
      await s.unfrozen();
      demand(await activeTeam(), 404, "TEAM_NOT_FOUND");
      demand(
        !(await exists()),
        409,
        "TEAM_IDEA_EXISTS",
        "This team already has a saved idea. Refresh its card.",
      );
    }
    throw error;
  }
  return {
    message: "Team idea added. Membership and lock are unchanged.",
    teamId: data.teamId,
  };
}
