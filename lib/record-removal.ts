import { auditReason } from "./security";
import { z } from "zod";
import type { PortalService } from "./service";
import { one, assertPreviousWrite, type SQL } from "./db";
import { demand } from "./security";
import { OWNER_EMAIL } from "./identity";
export const notRemoved = (kind: string, id: string) =>
  `NOT EXISTS(SELECT 1 FROM record_removals removed WHERE removed.kind='${kind}' AND removed.target_id=${id} AND removed.active=1)`;
export async function removalCommand(
  s: PortalService,
  action: string,
  input: unknown,
) {
  if (action === "delete-own-team") {
    const actor = await s.actor();
    const d = z
      .object({
        reason: auditReason(),
        confirmation: z.literal("DELETE_OWN_TEAM"),
      })
      .strict()
      .parse(input);
    const team = await s.team(actor.id);
    demand(team && team.leader_id === actor.id, 403, "LEADER_REQUIRED");
    demand(
      !(await one(
        s.db,
        "SELECT team_id FROM team_locks WHERE team_id=?",
        team.id,
      )),
      409,
      "TEAM_LOCKED",
    );
    demand(
      s.now() < (await s.settings(true)).policy.membershipFreeze,
      409,
      "MEMBERSHIP_FROZEN",
    );
    demand(
      (
        await one<{ n: number }>(
          s.db,
          "SELECT count(*) n FROM memberships WHERE team_id=?",
          team.id,
        )
      )?.n === 1,
      409,
      "SOLE_MEMBER_REQUIRED",
    );
    demand(
      !(await one(
        s.db,
        "SELECT id FROM submission_versions WHERE team_id=? LIMIT 1",
        team.id,
      )),
      409,
      "SUBMISSION_HISTORY_REQUIRES_ADMIN_REVIEW",
    );
    await s.mutate(
      actor.id,
      action,
      team.id,
      [
        [
          "INSERT INTO record_removals(kind,target_id,active,reason,actor_id,updated_at,snapshot) SELECT 'team',?,1,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM team_locks WHERE team_id=?) AND (SELECT count(*) FROM memberships WHERE team_id=?)=1 AND EXISTS(SELECT 1 FROM memberships WHERE team_id=? AND user_id=?) AND NOT EXISTS(SELECT 1 FROM submission_versions WHERE team_id=?) ON CONFLICT(kind,target_id) DO NOTHING",
          team.id,
          d.reason,
          actor.id,
          s.now(),
          JSON.stringify({ leaderId: actor.id, teamName: team.name }),
          team.id,
          team.id,
          team.id,
          actor.id,
          team.id,
        ],
        ...assertPreviousWrite(),
        [
          "DELETE FROM memberships WHERE team_id=? AND user_id=?",
          team.id,
          actor.id,
        ],
        [
          "UPDATE team_actions SET status='declined' WHERE team_id=? AND status='pending'",
          team.id,
        ],
      ],
      { recoverable: true, historyPreserved: true },
      d.reason,
    );
    return {
      teamId: team.id,
      message:
        "Team removed. Its history is preserved; you may join or create another team.",
    };
  }
  if (action === "restore-removed-team") {
    const actor = await s.staff(),
      d = z
        .object({
          teamId: z.string().min(1).max(150),
          reason: auditReason(),
          confirmation: z.literal("RESTORE_TEAM"),
        })
        .strict()
        .parse(input);
    const team = await one<{ leader_id: string }>(
      s.db,
      "SELECT leader_id FROM teams WHERE id=?",
      d.teamId,
    );
    demand(team, 404, "TEAM_NOT_FOUND");
    const removed = await one<{ active: number }>(
      s.db,
      "SELECT active FROM record_removals WHERE kind='team' AND target_id=?",
      d.teamId,
    );
    if (!removed?.active) return { message: "Team is already active." };
    demand(
      !(await one(
        s.db,
        "SELECT user_id FROM memberships WHERE user_id=?",
        team.leader_id,
      )),
      409,
      "LEADER_ALREADY_IN_TEAM",
    );
    demand(
      !(await one(
        s.db,
        "SELECT target_id FROM record_removals WHERE kind='participant' AND target_id=? AND active=1",
        team.leader_id,
      )),
      409,
      "PARTICIPANT_REMOVED",
    );
    await s.mutate(
      actor.id,
      action,
      d.teamId,
      [
        [
          "UPDATE record_removals SET active=0,reason=?,actor_id=?,updated_at=? WHERE kind='team' AND target_id=? AND active=1",
          d.reason,
          actor.id,
          s.now(),
          d.teamId,
        ],
        ...assertPreviousWrite(),
        [
          "INSERT INTO memberships VALUES(?,?,?)",
          team.leader_id,
          d.teamId,
          s.now(),
        ],
      ],
      { historyPreserved: true },
      d.reason,
    );
    return {
      message: "Team restored with its original leader. History is preserved.",
    };
  }
  if (["participant-deactivate", "participant-restore"].includes(action)) {
    const actor = await s.staff();
    const d = z
      .object({
        userId: z.string().min(1).max(150),
        reason: auditReason(),
        confirmation: z.string(),
      })
      .strict()
      .parse(input);
    const active = action === "participant-deactivate";
    demand(
      d.confirmation ===
        (active ? "REMOVE_PARTICIPANT" : "RESTORE_PARTICIPANT"),
      422,
      "REMOVAL_CONFIRMATION_REQUIRED",
    );
    const user = await one<{ id: string; email: string; role: string }>(
      s.db,
      "SELECT u.id,u.email,COALESCE(r.role,u.role) role FROM users u LEFT JOIN portal_roles r ON r.user_id=u.id WHERE u.id=?",
      d.userId,
    );
    demand(user, 404, "USER_NOT_FOUND");
    demand(
      user.id !== actor.id &&
        user.email.toLowerCase() !== OWNER_EMAIL &&
        user.role === "participant",
      409,
      "PROTECTED_ACCOUNT",
    );
    demand(
      !active ||
        !(await one(
          s.db,
          "SELECT id FROM teams WHERE leader_id=? AND NOT EXISTS(SELECT 1 FROM record_removals r WHERE r.kind='team' AND r.target_id=teams.id AND r.active=1)",
          user.id,
        )),
      409,
      "TEAM_LEADER_REQUIRES_TRANSFER",
    );
    const old = await one<{ active: number }>(
      s.db,
      "SELECT active FROM record_removals WHERE kind='participant' AND target_id=?",
      user.id,
    );
    if ((old?.active || 0) === (active ? 1 : 0))
      return {
        message: active
          ? "Participant already removed."
          : "Participant already active.",
      };
    await s.mutate(
      actor.id,
      action,
      user.id,
      [
        [
          "INSERT INTO record_removals(kind,target_id,active,reason,actor_id,updated_at,snapshot) VALUES('participant',?,?,?,?,?,'{}') ON CONFLICT(kind,target_id) DO UPDATE SET active=excluded.active,reason=excluded.reason,actor_id=excluded.actor_id,updated_at=excluded.updated_at",
          user.id,
          active ? 1 : 0,
          d.reason,
          actor.id,
          s.now(),
        ],
      ],
      { recoverable: true, historyPreserved: true },
      d.reason,
    );
    return {
      message: active
        ? "Participant removed. History is preserved and access is revoked."
        : "Participant restored. Previous profile and history are preserved.",
    };
  }
  if (!["project-soft-delete", "project-restore"].includes(action)) return null;
  const actor = await s.staff(),
    d = z
      .object({
        projectId: z.string().min(1).max(150),
        scope: z.enum(["project", "submission", "both"]),
        versionId: z.string().min(1).max(150).optional(),
        reason: auditReason(),
        confirmation: z.string(),
      })
      .strict()
      .parse(input);
  const active = action === "project-soft-delete",
    target = d.scope === "both" ? "BOTH" : d.scope.toUpperCase();
  demand(
    d.confirmation === `${active ? "REMOVE" : "RESTORE"}_${target}`,
    422,
    "REMOVAL_CONFIRMATION_REQUIRED",
  );
  const p = await one<{ id: string; team_id: string }>(
    s.db,
    "SELECT id,team_id FROM projects WHERE id=?",
    d.projectId,
  );
  demand(p, 404, "PROJECT_NOT_FOUND");
  const targets: { kind: string; id: string }[] = [];
  if (d.scope !== "submission") targets.push({ kind: "project", id: p.id });
  if (d.scope !== "project") {
    demand(
      d.versionId &&
        (await one(
          s.db,
          "SELECT id FROM submission_versions WHERE id=? AND team_id=?",
          d.versionId,
          p.team_id,
        )),
      422,
      "PROJECT_VERSION_REQUIRED",
    );
    targets.push({ kind: "submission", id: d.versionId });
  }
  const sql: SQL[] = targets.map((t) => [
    "INSERT INTO record_removals(kind,target_id,active,reason,actor_id,updated_at,snapshot) VALUES(?,?,?,?,?,?,'{}') ON CONFLICT(kind,target_id) DO UPDATE SET active=excluded.active,reason=excluded.reason,actor_id=excluded.actor_id,updated_at=excluded.updated_at WHERE record_removals.active<>excluded.active",
    t.kind,
    t.id,
    active ? 1 : 0,
    d.reason,
    actor.id,
    s.now(),
  ]);
  await s.mutate(
    actor.id,
    action,
    p.id,
    sql,
    {
      scope: d.scope,
      versionId: d.versionId,
      recoverable: true,
      attemptsUnchanged: true,
    },
    d.reason,
  );
  return {
    message: active
      ? "Selected records removed. Attempts and history are preserved; no older version was published."
      : "Selected records restored. Eligibility and public visibility checks still apply.",
  };
}
