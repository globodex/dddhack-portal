import { z } from "zod";
import type { PortalService } from "./service";
import type { PortalViewOptions } from "./discover-participants";
import { one, rows, assertPreviousWrite, type SQL } from "./db";
import { demand, PortalError, sha256 } from "./security";
import { registeredEmailPredicate } from "./roster";

const active = (kind: "participant" | "team", id: string) =>
  `NOT EXISTS(SELECT 1 FROM record_removals r WHERE r.kind='${kind}' AND r.target_id=${id} AND r.active=1)
   AND NOT EXISTS(SELECT 1 FROM terminal_record_deletions td_lock WHERE td_lock.kind='${kind}' AND td_lock.target_id=${id})`;
const teamColumns = "t.id,t.name,t.leader_id,t.created_at";
const teamFrom = `FROM teams t WHERE t.id=? AND ${active("team", "t.id")}`;
const memberColumns = `m.user_id,m.joined_at,u.email,pp.completed_at,CAST(pp.gender_confirmed AS TEXT),
 CASE WHEN ${registeredEmailPredicate("u.email")} THEN '1' ELSE '0' END,
 CASE WHEN ${active("participant", "u.id")} THEN '1' ELSE '0' END`;
const memberFrom = `FROM memberships m JOIN users u ON u.id=m.user_id
 LEFT JOIN participant_profiles pp ON pp.user_id=u.id WHERE m.team_id=?`;
const ideaColumns = "i.title,i.core,i.description,i.hash,i.updated_at";
const ideaFrom = "FROM ideas i WHERE i.team_id=?";

async function snapshot(s: PortalService, teamId: string) {
  const team = await one<{
    id: string;
    name: string;
    leader_id: string;
    snapshot: string;
  }>(
    s.db,
    `SELECT t.id,t.name,t.leader_id,json_array(${teamColumns}) snapshot ${teamFrom}`,
    teamId,
  );
  demand(team, 404, "TEAM_NOT_FOUND");
  const members = await rows<{
    id: string;
    registered: number;
    active: number;
    snapshot: string;
  }>(
    s.db,
    `SELECT u.id,CASE WHEN ${registeredEmailPredicate("u.email")} THEN 1 ELSE 0 END registered,
    CASE WHEN ${active("participant", "u.id")} THEN 1 ELSE 0 END active,
    json_array(${memberColumns}) snapshot ${memberFrom} ORDER BY u.id LIMIT 6`,
    teamId,
  );
  const idea = await one<{ snapshot: string }>(
    s.db,
    `SELECT json_array(${ideaColumns}) snapshot ${ideaFrom}`,
    teamId,
  );
  const state = await one<{
    locked_at: string | null;
    attempts: number;
    durable_attempts: number;
    frozen: number;
  }>(
    s.db,
    `SELECT l.locked_at,COALESCE((SELECT MAX(attempt) FROM submission_versions WHERE team_id=t.id),0) attempts,
    COALESCE((SELECT attempts FROM submission_attempt_ledger WHERE team_id=t.id),0) durable_attempts,
    CASE WHEN EXISTS(SELECT 1 FROM result_snapshots) THEN 1 ELSE 0 END frozen
    FROM teams t LEFT JOIN team_locks l ON l.team_id=t.id WHERE t.id=?`,
    teamId,
  );
  const blocker = state!.frozen
    ? { code: "RESULTS_FROZEN", message: "Final results are frozen." }
    : Math.max(state!.attempts, state!.durable_attempts) > 0
      ? {
          code: "TEAM_HAS_SUBMISSIONS",
          message: "Committed submissions protect this team's lock state.",
        }
      : !members.length || members.length > 5
        ? {
            code: "TEAM_MEMBERS_INVALID",
            message: "A team must have between one and five members.",
          }
        : !members.some((member) => member.id === team.leader_id)
          ? {
              code: "TEAM_LEADER_CHANGED",
              message: "The team leader must be a current member.",
            }
          : members.some((member) => !member.active)
            ? {
                code: "PARTICIPANT_REMOVED",
                message: "Resolve removed team members before locking.",
              }
            : members.some((member) => !member.registered)
              ? {
                  code: "REGISTERED_ACCOUNT_REQUIRED",
                  message: "Every member must be on the registration roster.",
                }
              : null;
  // The lock itself is excluded so an exact duplicate is harmless. Every
  // participant-owned fact reviewed before confirmation remains bound.
  const snapshotDigest = await sha256(
    JSON.stringify([
      team.snapshot,
      members.map((m) => m.snapshot),
      idea?.snapshot ?? null,
    ]),
  );
  return { team, members, idea, state: state!, blocker, snapshotDigest };
}

export async function adminTeamLockView(
  s: PortalService,
  path: string,
  options: PortalViewOptions,
) {
  if (path !== "/admin/team-lock") return null;
  const me = await s.staff();
  const state = await snapshot(
    s,
    z.string().trim().min(1).max(200).parse(options.focus),
  );
  return {
    me,
    team: {
      id: state.team.id,
      name: state.team.name,
      locked: !!state.state.locked_at,
    },
    memberCount: state.members.length,
    ideaPresent: !!state.idea,
    snapshotDigest: state.snapshotDigest,
    canLock: !state.blocker,
    blockedReason: state.blocker?.message ?? null,
  };
}

function guard(condition: string, args: unknown[]): SQL[] {
  const token = "admin-team-lock-check:" + crypto.randomUUID();
  return [
    [
      `INSERT INTO write_guards VALUES(?,CASE WHEN ${condition} THEN 1 ELSE 0 END)`,
      token,
      ...args,
    ],
    ["DELETE FROM write_guards WHERE token=?", token],
  ];
}

export async function adminTeamLock(
  s: PortalService,
  action: string,
  input: unknown,
) {
  if (action !== "admin-lock-team") return null;
  const actor = await s.staff();
  const d = z
    .object({
      teamId: z.string().trim().min(1).max(200),
      expectedName: z.string().min(1).max(120),
      snapshotDigest: z.string().regex(/^[a-f0-9]{64}$/),
      confirmation: z.literal("ADMIN_LOCK_TEAM"),
    })
    .strict()
    .parse(input);
  const validate = async () => {
    const state = await snapshot(s, d.teamId);
    demand(
      !state.blocker,
      409,
      state.blocker?.code || "TEAM_LOCK_BLOCKED",
      state.blocker?.message,
    );
    demand(
      state.snapshotDigest === d.snapshotDigest &&
        state.team.name === d.expectedName,
      409,
      "TEAM_LOCK_CHANGED",
      "The team changed. Review its lock details again.",
    );
    return state;
  };
  const state = await validate();
  if (state.state.locked_at)
    return {
      teamId: d.teamId,
      changed: false,
      message: "Team is already locked.",
    };
  const lockedAt = s.now();
  const token =
    "admin-team-lock:" + JSON.stringify([d.teamId, actor.id, lockedAt]);
  const sql: SQL[] = [
    ...guard(
      `EXISTS(SELECT 1 FROM users u LEFT JOIN portal_roles p ON p.user_id=u.id
      WHERE u.id=? AND (?=1 OR COALESCE(p.role,u.role)='admin') AND ${active("participant", "u.id")})
      AND NOT EXISTS(SELECT 1 FROM result_snapshots)
      AND NOT EXISTS(SELECT 1 FROM submission_versions WHERE team_id=?)
      AND NOT EXISTS(SELECT 1 FROM submission_attempt_ledger WHERE team_id=? AND attempts>0)`,
      [actor.id, actor.owner ? 1 : 0, d.teamId, d.teamId],
    ),
    ...guard(`EXISTS(SELECT 1 ${teamFrom} AND json_array(${teamColumns})=?)`, [
      d.teamId,
      state.team.snapshot,
    ]),
    ...guard("(SELECT count(*) FROM memberships WHERE team_id=?)=?", [
      d.teamId,
      state.members.length,
    ]),
    ...state.members.flatMap((member) =>
      guard(
        `EXISTS(SELECT 1 ${memberFrom} AND u.id=? AND json_array(${memberColumns})=?)`,
        [d.teamId, member.id, member.snapshot],
      ),
    ),
    ...(state.idea
      ? guard(`EXISTS(SELECT 1 ${ideaFrom} AND json_array(${ideaColumns})=?)`, [
          d.teamId,
          state.idea.snapshot,
        ])
      : guard("NOT EXISTS(SELECT 1 FROM ideas WHERE team_id=?)", [d.teamId])),
    ["INSERT INTO write_guards VALUES(?,1)", token],
    [
      "INSERT INTO team_locks(team_id,locked_by,locked_at) VALUES(?,?,?) ON CONFLICT(team_id) DO NOTHING",
      d.teamId,
      actor.id,
      lockedAt,
    ],
    ...assertPreviousWrite(),
    ["DELETE FROM write_guards WHERE token=?", token],
    ["DELETE FROM team_status_overrides WHERE team_id=?", d.teamId],
  ];
  try {
    await s.mutate(
      actor.id,
      action,
      d.teamId,
      sql,
      {
        snapshotDigest: d.snapshotDigest,
        lockedAt,
        members: state.members.length,
        ideaPresent: !!state.idea,
        approvalChanged: false,
        participantPrerequisitesOverridden: true,
      },
      "Administrator locked team and idea editing",
    );
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !/constraint|write_guards|23514|TEAM_|RESULTS_FROZEN|ADMIN_REQUIRED/i.test(
        error.message,
      )
    )
      throw error;
    await s.staff();
    const fresh = await validate();
    if (fresh.state.locked_at)
      return {
        teamId: d.teamId,
        changed: false,
        message: "Team is already locked.",
      };
    throw new PortalError(
      409,
      "TEAM_LOCK_CHANGED",
      "The team changed. Review its lock details again.",
    );
  }
  return {
    teamId: d.teamId,
    changed: true,
    lockedAt,
    message: "Team locked. Approval is unchanged.",
  };
}
