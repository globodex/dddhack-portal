import type { PortalService } from "./service";
import { one } from "./db";
import { demand, emailSchema } from "./security";
export const normalizeRosterEmail = (value: string) =>
  emailSchema.parse(value.trim().toLowerCase());
export async function requireRosterMember(
  s: PortalService,
  actor?: Awaited<ReturnType<PortalService["actor"]>>,
) {
  const me = actor || (await s.actor());
  // Only existing, server-authorized owner/admin access may bootstrap the roster.
  if (me.owner || me.role === "admin")
    return { matched: true, bootstrap: true };
  const email = normalizeRosterEmail(me.email);
  demand(
    !!(await one(s.db, "SELECT email FROM luma_roster WHERE email=?", email)),
    403,
    "LUMA_EMAIL_MISMATCH",
    "Please sign in with your Luma-registered email",
  );
  return { matched: true, bootstrap: false };
}
