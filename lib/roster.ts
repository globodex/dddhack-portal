import type { PortalService } from "./service";
import { one } from "./db";
import { demand, emailSchema } from "./security";
export const normalizeRosterEmail = (value: string) =>
  emailSchema.parse(value.trim().toLowerCase());
/** Existing registration records and imported Luma emails are the same allowlist.
 * Approval, profile completion and attendance remain separate requirements.
 * The column expression is internal SQL, never request input.
 */
export const registeredEmailPredicate = (emailColumn: string) =>
  `(EXISTS(SELECT 1 FROM registrations registered WHERE registered.email=${emailColumn}) OR EXISTS(SELECT 1 FROM luma_roster roster WHERE roster.email=${emailColumn}))`;
export async function requireRosterMember(
  s: PortalService,
  actor?: Awaited<ReturnType<PortalService["actor"]>>,
) {
  const me = actor || (await s.actor());
  demand(
    !me.deactivated &&
      !(await one(
        s.db,
        "SELECT target_id FROM record_removals WHERE kind='participant' AND target_id=? AND active=1",
        me.id,
      )),
    403,
    "PARTICIPANT_REMOVED",
    "Your participant access has been removed. Contact an organizer.",
  );
  // Only existing, server-authorized owner/admin access may bootstrap the roster.
  if (me.owner || me.role === "admin")
    return { matched: true, bootstrap: true };
  const email = normalizeRosterEmail(me.email);
  demand(
    !!(await one(
      s.db,
      "SELECT email FROM registrations WHERE email=? UNION SELECT email FROM luma_roster WHERE email=?",
      email,
      email,
    )),
    403,
    "LUMA_EMAIL_MISMATCH",
    "Please sign in with your Luma-registered email",
  );
  return { matched: true, bootstrap: false };
}
