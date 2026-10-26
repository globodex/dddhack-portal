import { auditReason } from "./security";
import type { PortalService } from "./service";
import { one, rows } from "./db";
import { z } from "zod";
import { demand } from "./security";
import { creditAssignmentStatements } from "./credit-stock";
import { teamFacts } from "./directory-facts";
export const personStatuses = [
  "Registered",
  "Going",
  "Checked in",
  "Absent",
] as const;
export const teamStatuses = [
  "Forming",
  "Locked",
  "Approved",
  "Yet to submit",
  "Not submitted",
  "Submitted",
] as const;
export const attendancePredicate = (id: string) =>
  `EXISTS(SELECT 1 FROM users attendance_user WHERE attendance_user.id=${id} AND NOT EXISTS(SELECT 1 FROM record_removals rr WHERE rr.kind='participant' AND rr.target_id=attendance_user.id AND rr.active=1) AND EXISTS(SELECT 1 FROM registrations ar WHERE ar.email=attendance_user.email AND ar.status='approved') AND COALESCE((SELECT ps.status FROM participant_status_overrides ps WHERE ps.user_id=${id}),'Checked in')='Checked in' AND (EXISTS(SELECT 1 FROM check_ins ci WHERE ci.user_id=${id}) OR EXISTS(SELECT 1 FROM manual_checkins mc WHERE mc.user_id=${id} AND mc.verified_email=lower(attendance_user.email))))`;
export async function personStatus(s: PortalService, userId: string) {
  const user = await one<{
    approval: string;
    status: string | null;
    email: string;
  }>(
    s.db,
    "SELECT COALESCE(r.status,'pending') approval,CASE WHEN COALESCE(a.reconciled_at,ra.reconciled_at) IS NOT NULL AND (o.updated_at IS NULL OR o.updated_at<COALESCE(a.reconciled_at,ra.reconciled_at)) THEN 'Absent' ELSE o.status END status,u.email FROM users u LEFT JOIN registrations r ON r.email=u.email LEFT JOIN participant_status_overrides o ON o.user_id=u.id LEFT JOIN automatic_absences a ON a.user_id=u.id LEFT JOIN registration_absences ra ON ra.email=u.email WHERE u.id=?",
    userId,
  );
  demand(user, 404, "USER_NOT_FOUND");
  const checked = !!(await one(
    s.db,
    `SELECT id FROM users WHERE id=? AND ${attendancePredicate("users.id")}`,
    userId,
  ));
  return {
    status:
      user.status ||
      (checked
        ? "Checked in"
        : user.approval === "approved"
          ? "Going"
          : "Registered"),
    checkedIn: checked,
    approval: user.approval,
    email: user.email,
  };
}
export async function teamStatus(s: PortalService, teamId: string) {
  const fact = (await teamFacts(s.db, [teamId], undefined, s.now())).get(
    teamId,
  );
  demand(fact, 404, "TEAM_NOT_FOUND");
  return {
    status: fact.status,
    derivedStatus: fact.derivedStatus,
    manual: fact.manual,
    locked: fact.locked,
    checkedInMembers: fact.checkedInMembers,
    attemptsUsed: fact.attemptsUsed,
    ineligible: fact.ineligible,
    reason: fact.reason,
  };
}

export async function statusCommand(
  s: PortalService,
  action: string,
  input: unknown,
) {
  if (action === "admin-status-bulk") {
    const actor = await s.staff();
    const d = z
      .object({
        userIds: z.array(z.string().min(1)).min(1).max(250),
        status: z.enum(personStatuses),
        reason: auditReason(),
        confirmation: z.literal("CHANGE_STATUS"),
      })
      .strict()
      .parse(input);
    const sql: import("./db").SQL[] = [];
    for (const id of [...new Set(d.userIds)]) {
      const user = await personStatus(s, id);
      sql.push([
        "INSERT INTO registrations(email,status) VALUES(?,?) ON CONFLICT(email) DO UPDATE SET status=excluded.status",
        user.email,
        d.status === "Registered"
          ? "pending"
          : d.status === "Absent"
            ? user.approval
            : "approved",
      ]);
      if (d.status === "Checked in")
        sql.push([
          "INSERT INTO manual_checkins VALUES(?,?,?,?) ON CONFLICT DO NOTHING",
          id,
          user.email.toLowerCase(),
          actor.id,
          s.now(),
        ]);
      sql.push([
        "INSERT INTO participant_status_overrides VALUES(?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET status=excluded.status,reason=excluded.reason,actor_id=excluded.actor_id,updated_at=excluded.updated_at",
        id,
        d.status,
        d.reason,
        actor.id,
        s.now(),
      ]);
    }
    if (d.status === "Checked in")
      sql.push(...(await creditAssignmentStatements(s)));
    await s.mutate(
      actor.id,
      action,
      "participants",
      sql,
      { count: d.userIds.length, status: d.status, historyPreserved: true },
      d.reason,
    );
    return {
      message:
        "Individual statuses updated. Team locks and submission attempts are unchanged.",
    };
  }
  if (action !== "admin-status") return null;
  const actor = await s.staff();
  const d = z
    .object({
      kind: z.enum(["person", "team"]),
      targetId: z.string().min(1).max(150),
      status: z.string(),
      reason: auditReason(),
      ruleReference: z.string().trim().max(1000).optional(),
      evidence: z.string().trim().max(3000).optional(),
      confirmation: z.literal("CHANGE_STATUS"),
    })
    .strict()
    .parse(input);
  if (d.kind === "person") {
    const status = z.enum(personStatuses).parse(d.status),
      user = await one<{ id: string; email: string }>(
        s.db,
        "SELECT id,email FROM users WHERE id=?",
        d.targetId,
      );
    demand(user, 404, "USER_NOT_FOUND");
    const before = await personStatus(s, user.id);
    await s.mutate(
      actor.id,
      action,
      user.id,
      [
        [
          "INSERT INTO registrations(email,status) VALUES(?,?) ON CONFLICT(email) DO UPDATE SET status=excluded.status",
          user.email,
          status === "Registered"
            ? "pending"
            : before.approval === "approved" || status !== "Absent"
              ? "approved"
              : "pending",
        ],
        ...(status === "Checked in"
          ? [
              [
                "INSERT INTO manual_checkins VALUES(?,?,?,?) ON CONFLICT(user_id,verified_email) DO NOTHING",
                user.id,
                user.email.toLowerCase(),
                actor.id,
                s.now(),
              ] as [string, ...unknown[]],
            ]
          : []),
        [
          "INSERT INTO participant_status_overrides VALUES(?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET status=excluded.status,reason=excluded.reason,actor_id=excluded.actor_id,updated_at=excluded.updated_at",
          user.id,
          status,
          d.reason,
          actor.id,
          s.now(),
        ],
        ...(status === "Checked in" ? await creditAssignmentStatements(s) : []),
      ],
      {
        kind: d.kind,
        before: before.status,
        after: status,
        attendanceHistoryPreserved: true,
      },
      d.reason,
    );
    return {
      message:
        status === "Going"
          ? "You’re Going."
          : "Participant status updated. Attendance history and personal allocation ownership are preserved.",
    };
  }
  const status = z.enum(teamStatuses).parse(d.status);
  demand(
    status !== "Locked",
    422,
    "TEAM_LOCK_ACTION_REQUIRED",
    "Use Lock team to lock team and idea editing.",
  );
  demand(
    status !== "Approved",
    422,
    "TEAM_APPROVAL_ACTION_REQUIRED",
    "Use Approve team to update member approvals.",
  );
  demand(
    await one(s.db, "SELECT id FROM teams WHERE id=?", d.targetId),
    404,
    "TEAM_NOT_FOUND",
  );
  const before = await teamStatus(s, d.targetId);
  await s.mutate(
    actor.id,
    action,
    d.targetId,
    [
      [
        "INSERT INTO team_status_overrides VALUES(?,?,?,?,?,?,?) ON CONFLICT(team_id) DO UPDATE SET status=excluded.status,reason=excluded.reason,rule_reference=excluded.rule_reference,evidence=excluded.evidence,actor_id=excluded.actor_id,updated_at=excluded.updated_at",
        d.targetId,
        status,
        d.reason,
        null,
        null,
        actor.id,
        s.now(),
      ],
    ],
    {
      kind: d.kind,
      before: before.status,
      after: status,
      attemptsUsed: before.attemptsUsed,
      lockPreserved: before.locked,
    },
    d.reason,
  );
  return {
    message:
      "Team status updated. The lock and three-attempt history are unchanged; public listing still requires a committed eligible project.",
  };
}

export async function prizeEligibility(s: PortalService, userId: string) {
  return {
    eligible: (await personStatus(s, userId)).checkedIn,
    reason:
      "Prizes and rewards are only for individually checked-in members. An absent member does not disqualify the team.",
  };
}
