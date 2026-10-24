import { z } from "zod";
import type { PortalService } from "./service";
import { one, assertPreviousWrite, type SQL } from "./db";
import { attendancePredicate, personStatus } from "./portal-status";
import { auditReason, demand, emailSchema, PortalError } from "./security";

type Operator = { id: string; owner: boolean; role: string };

// Match the current personal status, including request-time automatic absences.
// This predicate is evaluated by the database inside the mutation transaction.
const personallyGoing = `EXISTS(SELECT 1 FROM registrations r WHERE r.email=users.email AND r.status='approved')
  AND NOT EXISTS(SELECT 1 FROM record_removals rr WHERE rr.kind='participant' AND rr.target_id=users.id AND rr.active=1)
  AND COALESCE((SELECT CASE WHEN COALESCE(a.reconciled_at,ra.reconciled_at) IS NOT NULL AND (o.updated_at IS NULL OR o.updated_at<COALESCE(a.reconciled_at,ra.reconciled_at)) THEN 'Absent' ELSE o.status END FROM users target LEFT JOIN participant_status_overrides o ON o.user_id=target.id LEFT JOIN automatic_absences a ON a.user_id=target.id LEFT JOIN registration_absences ra ON ra.email=target.email WHERE target.id=users.id),'Going')='Going'
  AND NOT (${attendancePredicate("users.id")})`;

export async function checkInParticipants(
  s: PortalService,
  actor: Operator,
  action: string,
  input: unknown,
) {
  demand(
    actor.owner || ["admin", "volunteer"].includes(actor.role),
    403,
    "CHECKIN_OPERATOR_REQUIRED",
  );
  const d = z
    .object({
      emails: z
        .array(emailSchema)
        .min(1)
        .max(action === "quick-check-in" ? 1 : 250),
      reason: auditReason(),
      ...(action === "bulk-check-in"
        ? { confirmation: z.literal("CHECK_IN_PARTICIPANTS") }
        : {}),
    })
    .strict()
    .parse(input);
  await s.operational("checkin");
  const emails = [...new Set(d.emails)];
  const participants: { id: string; email: string }[] = [];
  for (const email of emails) {
    const user = await one<{ id: string; email: string }>(
      s.db,
      "SELECT id,email FROM users WHERE email=?",
      email,
    );
    demand(user, 422, "PARTICIPANT_NOT_SIGNED_IN");
    const current = await personStatus(s, user.id);
    demand(
      current.approval === "approved",
      403,
      "PORTAL_GOING_REQUIRED",
      "Only individuals Going on the portal can check in.",
    );
    demand(
      current.status === "Going" && !current.checkedIn,
      409,
      "CHECKIN_STATE_CHANGED",
      "This selection is no longer Going. Refresh participants and try again.",
    );
    participants.push(user);
  }
  const statements: SQL[] = [];
  for (const user of participants) {
    statements.push(
      // A conditional row write acquires the participant lock and checks the
      // current status. A failed guard rolls back every participant and audit.
      [
        `UPDATE users SET id=id WHERE id=? AND email=? AND ${personallyGoing}`,
        user.id,
        user.email,
      ],
      ...assertPreviousWrite(),
      [
        "INSERT INTO check_ins VALUES(?,?,?) ON CONFLICT(user_id) DO NOTHING",
        user.id,
        actor.id,
        s.now(),
      ],
      ["DELETE FROM participant_status_overrides WHERE user_id=?", user.id],
    );
  }
  try {
    await s.mutate(
      actor.id,
      action,
      "participants",
      statements,
      {
        count: participants.length,
        emails,
        before: "Going",
        after: "Checked in",
      },
      d.reason,
    );
  } catch (error) {
    if (
      /CHECK constraint failed: valid=1|write_guards.*check|write_guards_valid_check/i.test(
        error instanceof Error ? error.message : String(error),
      )
    )
      throw new PortalError(
        409,
        "CHECKIN_STATE_CHANGED",
        "This selection changed before check-in. Refresh participants and try again.",
      );
    throw error;
  }
  return {
    message: `Checked in ${participants.length} ${participants.length === 1 ? "participant" : "participants"}.`,
    checkedIn: participants.length,
    emails,
    userIds: participants.map((user) => user.id),
  };
}
