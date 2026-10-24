import { z } from "zod";
import type { PortalService } from "./service";
import { one, rows, assertPreviousWrite } from "./db";
import { OWNER_EMAIL } from "./identity";
import { demand, PortalError } from "./security";

export type AdminAccessEntry = {
  id: string;
  name: string;
  email: string;
  owner: boolean;
};
export type AdminAccessView = { items: AdminAccessEntry[] };
type StoredRole = { id: string; email: string; role: string };
const protectedOwner = (id: string, email: string, actorId: string) =>
  id === actorId || email.trim().toLowerCase() === OWNER_EMAIL;
const currentRole = (s: PortalService, id: string) =>
  one<StoredRole>(
    s.db,
    "SELECT u.id,u.email,COALESCE(r.role,u.role) role FROM users u LEFT JOIN portal_roles r ON r.user_id=u.id WHERE u.id=?",
    id,
  );

export async function adminAccessView(
  s: PortalService,
): Promise<AdminAccessView> {
  const actor = await s.staff(true);
  const admins = await rows<{ id: string; name: string; email: string }>(
    s.db,
    "SELECT u.id,COALESCE(p.display_name,u.name) name,u.email FROM users u LEFT JOIN portal_roles r ON r.user_id=u.id LEFT JOIN participant_profiles p ON p.user_id=u.id WHERE COALESCE(r.role,u.role)='admin' OR lower(u.email)=?",
    OWNER_EMAIL,
  );
  const entries = new Map<string, AdminAccessEntry>(
    admins.map((row) => [
      row.id,
      {
        id: row.id,
        name: row.name?.trim() || row.email,
        email: row.email,
        owner: protectedOwner(row.id, row.email, actor.id),
      },
    ]),
  );
  entries.set(actor.id, {
    id: actor.id,
    name: actor.name || actor.email,
    email: actor.email,
    owner: true,
  });
  return {
    items: [...entries.values()].sort(
      (a, b) =>
        Number(b.owner) - Number(a.owner) ||
        a.name.localeCompare(b.name) ||
        a.email.localeCompare(b.email),
    ),
  };
}

export async function revokeAdminAccess(s: PortalService, input: unknown) {
  const actor = await s.staff(true);
  const values = z
    .object({
      userId: z.string().trim().min(1).max(150),
      confirmation: z.literal("REVOKE_ADMIN"),
    })
    .strict()
    .parse(input);
  const target = await currentRole(s, values.userId);
  demand(target, 404, "USER_NOT_FOUND");
  demand(
    !protectedOwner(target.id, target.email, actor.id),
    422,
    "OWNER_IDENTITY_IS_PLATFORM_MANAGED",
    "Owner access cannot be revoked.",
  );
  if (target.role !== "admin")
    return {
      message: "Admin access already removed.",
      revoked: false,
      userId: target.id,
    };
  try {
    await s.mutate(
      actor.id,
      "revoke-admin",
      target.id,
      [
        [
          "INSERT INTO portal_roles(user_id,role,granted_by,updated_at) SELECT u.id,'participant',?,? FROM users u LEFT JOIN portal_roles r ON r.user_id=u.id WHERE u.id=? AND u.id<>? AND lower(u.email)<>? AND COALESCE(r.role,u.role)='admin' ON CONFLICT(user_id) DO UPDATE SET role=excluded.role,granted_by=excluded.granted_by,updated_at=excluded.updated_at WHERE portal_roles.role='admin'",
          actor.id,
          s.now(),
          target.id,
          actor.id,
          OWNER_EMAIL,
        ],
        ...assertPreviousWrite(),
      ],
      { beforeRole: "admin", afterRole: "participant" },
    );
  } catch (error) {
    if (
      !/CHECK constraint failed: valid=1|write_guards.*check|write_guards_valid_check/i.test(
        error instanceof Error ? error.message : String(error),
      )
    )
      throw error;
    await s.staff(true);
    const latest = await currentRole(s, target.id);
    if (latest && latest.role !== "admin")
      return {
        message: "Admin access already removed.",
        revoked: false,
        userId: target.id,
      };
    throw new PortalError(
      409,
      "ADMIN_ACCESS_CHANGED",
      "Admin access changed. Refresh and try again.",
    );
  }
  return { message: "Admin access revoked.", revoked: true, userId: target.id };
}
