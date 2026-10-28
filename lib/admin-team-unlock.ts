import { z } from "zod";
import type { PortalService } from "./service";
import { one, assertPreviousWrite, type SQL } from "./db";
import { demand, PortalError } from "./security";

export function teamUnlockBlocker(input: {
  frozen: boolean;
  attempts: number;
  now: string;
  membershipFreeze: string;
  ideaLock: string;
}) {
  if (input.frozen)
    return { code: "RESULTS_FROZEN", message: "Final results are frozen." };
  if (input.attempts > 0)
    return {
      code: "TEAM_HAS_SUBMISSIONS",
      message: "Committed submissions prevent unlocking this team.",
    };
  return null;
}

export async function adminTeamUnlock(
  s: PortalService,
  action: string,
  input: unknown,
) {
  if (action !== "admin-unlock-team") return null;
  const actor = await s.staff();
  const d = z
    .object({
      teamId: z.string().trim().min(1).max(200),
      expectedLockedAt: z.string().min(1).max(80),
      confirmation: z.literal("UNLOCK_TEAM"),
    })
    .strict()
    .parse(input);
  const read = () =>
    one<{
      id: string;
      locked_at: string | null;
      locked_by: string | null;
      attempts: number;
      durable_attempts: number;
      frozen: number;
    }>(
      s.db,
      `SELECT t.id,l.locked_at,l.locked_by,
      COALESCE((SELECT MAX(attempt) FROM submission_versions WHERE team_id=t.id),0) attempts,
      COALESCE((SELECT attempts FROM submission_attempt_ledger WHERE team_id=t.id),0) durable_attempts,
      CASE WHEN EXISTS(SELECT 1 FROM result_snapshots) THEN 1 ELSE 0 END frozen
      FROM teams t LEFT JOIN team_locks l ON l.team_id=t.id
      WHERE t.id=? AND NOT EXISTS(SELECT 1 FROM record_removals r WHERE r.kind='team' AND r.target_id=t.id AND r.active=1)`,
      d.teamId,
    );
  const validate = async () => {
    const team = await read();
    demand(team, 404, "TEAM_NOT_FOUND");
    const { policy } = await s.settings(true);
    const blocker = teamUnlockBlocker({
      frozen: !!team.frozen,
      attempts: Math.max(Number(team.attempts), Number(team.durable_attempts)),
      now: s.now(),
      membershipFreeze: policy.membershipFreeze,
      ideaLock: policy.ideaLock,
    });
    demand(
      !blocker,
      409,
      blocker?.code || "TEAM_UNLOCK_BLOCKED",
      blocker?.message,
    );
    if (team.locked_at)
      demand(
        team.locked_at === d.expectedLockedAt,
        409,
        "TEAM_LOCK_CHANGED",
        "The team lock changed. Refresh before unlocking.",
      );
    return team;
  };
  const team = await validate();
  if (!team.locked_at)
    return {
      changed: false,
      teamId: team.id,
      message: "Team is already unlocked.",
    };
  const guard =
    "admin-team-unlock:" + JSON.stringify([team.id, d.expectedLockedAt]);
  const authority = "admin-unlock-authority:" + crypto.randomUUID();
  const sql: SQL[] = [
    [
      "INSERT INTO write_guards VALUES(?,CASE WHEN ?=1 OR EXISTS(SELECT 1 FROM users u LEFT JOIN portal_roles p ON p.user_id=u.id WHERE u.id=? AND COALESCE(p.role,u.role)='admin') THEN 1 ELSE 0 END)",
      authority,
      actor.owner ? 1 : 0,
      actor.id,
    ],
    ["DELETE FROM write_guards WHERE token=?", authority],
    ["INSERT INTO write_guards VALUES(?,1)", guard],
    [
      `DELETE FROM team_locks WHERE team_id=? AND locked_at=?
      AND NOT EXISTS(SELECT 1 FROM result_snapshots)
      AND NOT EXISTS(SELECT 1 FROM submission_versions WHERE team_id=?)
      AND NOT EXISTS(SELECT 1 FROM submission_attempt_ledger WHERE team_id=? AND attempts>0)
      AND NOT EXISTS(SELECT 1 FROM record_removals WHERE kind='team' AND target_id=? AND active=1)`,
      team.id,
      d.expectedLockedAt,
      team.id,
      team.id,
      team.id,
    ],
    ...assertPreviousWrite(),
    ["DELETE FROM write_guards WHERE token=?", guard],
    // Clear only a stale lock display override. All other lifecycle records,
    // memberships, ideas, drafts, committed versions and attempts stay intact.
    [
      "DELETE FROM team_status_overrides WHERE team_id=? AND status='Locked'",
      team.id,
    ],
  ];
  try {
    await s.mutate(
      actor.id,
      action,
      team.id,
      sql,
      {
        previousLock: { lockedAt: team.locked_at, lockedBy: team.locked_by },
        unlocked: true,
        membershipsPreserved: true,
        ideaPreserved: true,
        submissionHistoryPreserved: true,
      },
      "Administrator reopened team and idea editing",
    );
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !/constraint|IMMUTABLE|CHECK|TEAM_LOCK|TEAM_HAS_COMMITTED_SUBMISSIONS|RESULTS_FROZEN/i.test(
        error.message,
      )
    )
      throw error;
    await s.staff();
    const latest = await validate();
    if (!latest.locked_at)
      return {
        changed: false,
        teamId: team.id,
        message: "Team is already unlocked.",
      };
    throw new PortalError(
      409,
      "TEAM_UNLOCK_CHANGED",
      "The team changed. Refresh before unlocking.",
    );
  }
  return {
    changed: true,
    teamId: team.id,
    message: "Team unlocked. Participant deadlines still apply.",
  };
}
