import { z } from "zod";
import type { PortalService } from "./service";
import { one, rows, assertPreviousWrite, type SQL } from "./db";
import { demand } from "./security";
import { OWNER_EMAIL } from "./identity";

type Kind = "participant" | "team";
export async function terminallyDeleted(
  s: Pick<PortalService, "db">,
  kind: Kind,
  target: string,
) {
  return !!(await one(
    s.db,
    "SELECT target_id FROM terminal_record_deletions WHERE kind=? AND target_id=?",
    kind,
    target,
  ));
}
const context = (kind: Kind, target: string) =>
  `cascade-${kind}:` + JSON.stringify([target]);
const tombstone = (
  kind: Kind,
  target: string,
  actor: string,
  time: string,
): SQL[] => [
  [
    "INSERT INTO terminal_record_deletions(kind,target_id,deleted_at) VALUES(?,?,?)",
    kind,
    target,
    time,
  ],
  [
    "INSERT INTO record_removals(kind,target_id,active,reason,actor_id,updated_at,snapshot) VALUES(?,?,1,'Admin irreversible deletion',?,?,'{}') ON CONFLICT(kind,target_id) DO UPDATE SET active=1,reason=excluded.reason,actor_id=excluded.actor_id,updated_at=excluded.updated_at,snapshot='{}'",
    kind,
    target,
    actor,
    time,
  ],
];
function teamStatements(teamId: string): SQL[] {
  const projects = "SELECT id FROM projects WHERE team_id=?";
  const versions = "SELECT id FROM submission_versions WHERE team_id=?";
  return [
    [
      "DELETE FROM project_feedback_reviews WHERE version_id IN (" +
        versions +
        ") OR comment_id IN (SELECT id FROM project_comments WHERE project_id IN (" +
        projects +
        "))",
      teamId,
      teamId,
    ],
    ...[
      "project_upvotes",
      "project_comments",
      "project_assignments",
      "project_review_history",
      "evaluation_runs",
      "project_eligibility",
      "eligibility_history",
      "repository_evidence",
      "winner_reveals",
    ].map((table): SQL => [
      "DELETE FROM " + table + " WHERE project_id IN (" + projects + ")",
      teamId,
    ]),
    ["DELETE FROM project_commit_receipts WHERE team_id=?", teamId],
    ...[
      "reviews",
      "human_scores",
      "judge_assignments",
      "votes",
      "feedback",
      "tie_resolutions",
    ].map((table): SQL => [
      "DELETE FROM " + table + " WHERE team_id=?",
      teamId,
    ]),
    ["DELETE FROM astra_jobs WHERE version_id IN (" + versions + ")", teamId],
    [
      "DELETE FROM record_removals WHERE (kind='project' AND target_id IN (" +
        projects +
        ")) OR (kind='submission' AND target_id IN (" +
        versions +
        "))",
      teamId,
      teamId,
    ],
    ["DELETE FROM projects WHERE team_id=?", teamId],
    ["DELETE FROM submission_versions WHERE team_id=?", teamId],
    ...[
      "idea_revisions",
      "ideas",
      "team_actions",
      "memberships",
      "team_styles",
      "team_status_overrides",
      "team_locks",
    ].map((table): SQL => [
      "DELETE FROM " + table + " WHERE team_id=?",
      teamId,
    ]),
    ["DELETE FROM teams WHERE id=?", teamId],
    ...assertPreviousWrite(),
  ];
}
function participantStatements(userId: string, email: string): SQL[] {
  return [
    [
      "DELETE FROM project_feedback_reviews WHERE comment_id IN (SELECT id FROM project_comments WHERE author_id=?)",
      userId,
    ],
    ["DELETE FROM project_comments WHERE author_id=?", userId],
    ["DELETE FROM project_upvotes WHERE user_id=?", userId],
    ["DELETE FROM votes WHERE voter_id=?", userId],
    ["DELETE FROM feedback WHERE author_id=?", userId],
    ...[
      "team_actions",
      "memberships",
      "credit_allocations",
      "profile_photos",
      "profile_details",
      "participant_profiles",
      "profiles",
      "automatic_absences",
      "manual_checkins",
      "check_ins",
      "participant_status_overrides",
      "private_venue_managers",
    ].map((table): SQL => [
      "DELETE FROM " + table + " WHERE user_id=?",
      userId,
    ]),
    ["DELETE FROM import_previews WHERE actor_id=?", userId],
    ["DELETE FROM registration_absences WHERE email=?", email],
    ["DELETE FROM roster_prefills WHERE email=?", email],
    ["DELETE FROM luma_roster WHERE email=?", email],
    ["DELETE FROM registrations WHERE email=?", email],
    // Auth and indefinite audit FK references require this minimal identity row.
    // Terminal actor checks prevent a stale sign-in from rebuilding portal data.
    ["UPDATE users SET name='Deleted participant' WHERE id=?", userId],
  ];
}

export async function terminalDeletionCommand(
  s: PortalService,
  action: string,
  input: unknown,
) {
  if (action !== "admin-delete-participant" && action !== "admin-delete-team")
    return null;
  const actor = await s.staff();
  await s.unfrozen();
  const participant = action === "admin-delete-participant";
  const data = participant
    ? z
        .object({
          userId: z.string().min(1).max(150),
          confirmation: z.literal("DELETE_PARTICIPANT"),
        })
        .strict()
        .parse(input)
    : z
        .object({
          teamId: z.string().min(1).max(150),
          confirmation: z.literal("DELETE_TEAM"),
        })
        .strict()
        .parse(input);
  const targetId = participant
    ? (data as { userId: string }).userId
    : (data as { teamId: string }).teamId;
  const kind: Kind = participant ? "participant" : "team";
  if (await terminallyDeleted(s, kind, targetId))
    return {
      changed: false,
      permanentlyDeleted: true,
      message: participant
        ? "Participant already deleted."
        : "Team already deleted.",
    };
  const user = participant
    ? await one<{ id: string; email: string; role: string }>(
        s.db,
        "SELECT u.id,u.email,COALESCE(pr.role,u.role) role FROM users u LEFT JOIN portal_roles pr ON pr.user_id=u.id WHERE u.id=?",
        targetId,
      )
    : undefined;
  if (participant) {
    demand(user, 404, "USER_NOT_FOUND");
    demand(
      user.id !== actor.id &&
        user.email.toLowerCase() !== OWNER_EMAIL &&
        user.role === "participant",
      409,
      "PROTECTED_ACCOUNT",
      "Owner, staff and your own account cannot be deleted here.",
    );
  }
  const teams = await rows<{ id: string; leader_id: string }>(
    s.db,
    participant
      ? "SELECT id,leader_id FROM teams WHERE leader_id=? ORDER BY id"
      : "SELECT id,leader_id FROM teams WHERE id=?",
    targetId,
  );
  if (!participant) demand(teams.length === 1, 404, "TEAM_NOT_FOUND");
  const token = "terminal-authority:" + crypto.randomUUID();
  const sql: SQL[] = [
    [
      "INSERT INTO write_guards VALUES(?,CASE WHEN EXISTS(SELECT 1 FROM users u LEFT JOIN portal_roles pr ON pr.user_id=u.id WHERE u.id=? AND (?=1 OR COALESCE(pr.role,u.role)='admin')) AND NOT EXISTS(SELECT 1 FROM record_removals WHERE kind='participant' AND target_id=? AND active=1) AND NOT EXISTS(SELECT 1 FROM terminal_record_deletions WHERE kind='participant' AND target_id=?) AND NOT EXISTS(SELECT 1 FROM result_snapshots) THEN 1 ELSE 0 END)",
      token,
      actor.id,
      actor.owner ? 1 : 0,
      actor.id,
      actor.id,
    ],
  ];
  const targetGuard = "terminal-target:" + crypto.randomUUID();
  if (participant) {
    const listed = teams.length
      ? " AND id NOT IN (" + teams.map(() => "?").join(",") + ")"
      : "";
    sql.push([
      "INSERT INTO write_guards VALUES(?,CASE WHEN EXISTS(SELECT 1 FROM users u LEFT JOIN portal_roles pr ON pr.user_id=u.id WHERE u.id=? AND u.id<>? AND lower(u.email)=? AND lower(u.email)<>? AND COALESCE(pr.role,u.role)='participant') AND (SELECT count(*) FROM teams WHERE leader_id=?)=? AND NOT EXISTS(SELECT 1 FROM teams WHERE leader_id=?" +
        listed +
        ") THEN 1 ELSE 0 END)",
      targetGuard,
      targetId,
      actor.id,
      user!.email.toLowerCase(),
      OWNER_EMAIL,
      targetId,
      teams.length,
      targetId,
      ...teams.map((t) => t.id),
    ]);
    sql.push([
      "INSERT INTO write_guards VALUES(?,1)",
      context("participant", targetId),
    ]);
    sql.push(...tombstone("participant", targetId, actor.id, s.now()));
  } else {
    sql.push([
      "INSERT INTO write_guards VALUES(?,CASE WHEN EXISTS(SELECT 1 FROM teams WHERE id=?) THEN 1 ELSE 0 END)",
      targetGuard,
      targetId,
    ]);
  }
  for (const team of teams) {
    sql.push([
      "INSERT INTO write_guards VALUES(?,1)",
      context("team", team.id),
    ]);
    sql.push(...tombstone("team", team.id, actor.id, s.now()));
    sql.push(...teamStatements(team.id));
    sql.push([
      "DELETE FROM write_guards WHERE token=?",
      context("team", team.id),
    ]);
  }
  if (participant) {
    sql.push(...participantStatements(targetId, user!.email));
    sql.push([
      "DELETE FROM write_guards WHERE token=?",
      context("participant", targetId),
    ]);
  }
  sql.push(
    ["DELETE FROM write_guards WHERE token=?", targetGuard],
    ["DELETE FROM write_guards WHERE token=?", token],
  );
  try {
    await s.mutate(
      actor.id,
      action,
      targetId,
      sql,
      {
        permanentlyDeleted: true,
        teamCount: teams.length,
        attemptsPreserved: true,
      },
      "Admin irreversible deletion",
    );
  } catch (error) {
    // Reclassify only concrete authorization/freeze/stale-target races. Other
    // failures propagate, and the transaction has already rolled back in full.
    await s.staff();
    await s.unfrozen();
    if (await terminallyDeleted(s, kind, targetId))
      return {
        changed: false,
        permanentlyDeleted: true,
        message: participant
          ? "Participant already deleted."
          : "Team already deleted.",
      };
    if (participant) {
      const current = await one<{ role: string; email: string }>(
        s.db,
        "SELECT u.email,COALESCE(pr.role,u.role) role FROM users u LEFT JOIN portal_roles pr ON pr.user_id=u.id WHERE u.id=?",
        targetId,
      );
      demand(
        current?.role === "participant" &&
          current.email.toLowerCase() !== OWNER_EMAIL,
        409,
        "PROTECTED_ACCOUNT",
        "The account's role changed. Reload before deleting it.",
      );
      demand(
        current.email.toLowerCase() === user!.email.toLowerCase(),
        409,
        "DELETION_TARGET_CHANGED",
        "The participant account changed. Reload before deleting it.",
      );
      const currentTeams = await rows<{ id: string }>(
        s.db,
        "SELECT id FROM teams WHERE leader_id=? ORDER BY id",
        targetId,
      );
      demand(
        JSON.stringify(currentTeams.map((t) => t.id)) ===
          JSON.stringify(teams.map((t) => t.id)),
        409,
        "DELETION_TARGET_CHANGED",
        "Team leadership changed. Reload before deleting this participant.",
      );
    }
    throw error;
  }
  return {
    changed: true,
    permanentlyDeleted: true,
    ...(participant ? { userId: targetId } : { teamId: targetId }),
    deletedTeamIds: teams.map((t) => t.id),
    message: participant
      ? "Participant permanently deleted."
      : "Team permanently deleted. Members remain participants.",
  };
}
