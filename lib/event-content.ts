import { auditReason } from "./security";
import { z } from "zod";
import { one, assertPreviousWrite } from "./db";
import type { PortalService } from "./service";
import { demand } from "./security";
import { personStatus } from "./portal-status";
import {
  plain,
  publicContentSchema,
  privateVenueSchema,
  defaultPublicContent,
} from "./event-content-contract";
export {
  publicContentSchema,
  privateVenueSchema,
  defaultPublicContent,
} from "./event-content-contract";
export async function publicEventContent(s: PortalService) {
  const row = await one<{ published: string | null }>(
    s.db,
    "SELECT published FROM event_content WHERE id=1",
  );
  return row?.published
    ? publicContentSchema.parse(JSON.parse(row.published))
    : defaultPublicContent;
}
export async function managesPrivateVenue(
  s: PortalService,
  actor: { id: string; role: string; owner: boolean },
) {
  return (
    actor.owner ||
    (actor.role === "admin" &&
      !!(await one(
        s.db,
        "SELECT user_id FROM private_venue_managers WHERE user_id=?",
        actor.id,
      )))
  );
}

/** Read access is personal attendance or current admin/owner status. The
 * separate managesPrivateVenue predicate still controls draft/edit/publish.
 */
export async function publishedPrivateVenue(
  s: PortalService,
  actor: Awaited<ReturnType<PortalService["actor"]>>,
  individual?: Awaited<ReturnType<typeof personStatus>>,
) {
  if (actor.deactivated) return undefined;
  if (!actor.owner && actor.role !== "admin") {
    const personal = individual || (await personStatus(s, actor.id));
    if (
      personal.approval !== "approved" ||
      !["Going", "Checked in"].includes(personal.status)
    ) return undefined;
  }
  const venue = await one<{ published: string | null }>(
    s.db,
    "SELECT published FROM private_venue WHERE id=1",
  );
  return venue?.published
    ? privateVenueSchema.parse(JSON.parse(venue.published))
    : undefined;
}
export async function eventContentCommand(
  s: PortalService,
  action: string,
  data: unknown,
) {
  if (!["content-save", "content-publish", "venue-manager"].includes(action))
    return null;
  const actor = await s.actor();
  if (action === "venue-manager") {
    await s.staff(true);
    const d = z
      .object({
        userId: z.string().min(1),
        enabled: z.boolean(),
        reason: auditReason(500),
      })
      .strict()
      .parse(data);
    const target = await one<{ role: string }>(
      s.db,
      "SELECT COALESCE(r.role,u.role) role FROM users u LEFT JOIN portal_roles r ON r.user_id=u.id WHERE u.id=?",
      d.userId,
    );
    demand(target?.role === "admin", 422, "OPERATIONAL_ADMIN_REQUIRED");
    await s.mutate(
      actor.id,
      action,
      d.userId,
      d.enabled
        ? [
            [
              "INSERT INTO private_venue_managers VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET granted_by=excluded.granted_by,updated_at=excluded.updated_at",
              d.userId,
              actor.id,
              s.now(),
            ],
          ]
        : [["DELETE FROM private_venue_managers WHERE user_id=?", d.userId]],
      { enabled: d.enabled },
      d.reason,
    );
    return { message: "Venue-management permission updated." };
  }
  const d = z
    .object({
      scope: z.enum(["public", "private"]),
      revision: z.number().int().min(0),
      content: z.unknown().optional(),
      reason: auditReason(500),
    })
    .strict()
    .parse(data);
  if (d.scope === "public") await s.staff(true);
  else
    demand(await managesPrivateVenue(s, actor), 403, "VENUE_MANAGER_REQUIRED");
  const table = d.scope === "public" ? "event_content" : "private_venue";
  const old = await one<{
    draft: string;
    published: string | null;
    revision: number;
  }>(s.db, `SELECT draft,published,revision FROM ${table} WHERE id=1`);
  demand((old?.revision ?? 0) === d.revision, 409, "CONTENT_CHANGED_RELOAD");
  const content =
    d.scope === "public"
      ? publicContentSchema.parse(
          action === "content-publish"
            ? JSON.parse(old?.draft || "{}")
            : d.content,
        )
      : privateVenueSchema.parse(
          action === "content-publish"
            ? JSON.parse(old?.draft || "{}")
            : d.content,
        );
  const serialized = JSON.stringify(content);
  // Version compare-and-swap plus a transactional assertion; no lost concurrent edits.
  const result = await s.mutate(
    actor.id,
    action,
    d.scope,
    [
      old
        ? [
            `UPDATE ${table} SET draft=?,published=?,revision=revision+1,updated_at=? WHERE id=1 AND revision=?`,
            serialized,
            action === "content-publish" ? serialized : old.published,
            s.now(),
            d.revision,
          ]
        : [
            `INSERT INTO ${table}(id,draft,published,revision,updated_at) VALUES(1,?,NULL,1,?)`,
            serialized,
            s.now(),
          ],
      ...assertPreviousWrite(),
      [
        "INSERT INTO event_content_history VALUES(?,?,?,?,?,?)",
        crypto.randomUUID(),
        d.scope,
        d.revision + 1,
        d.scope === "private"
          ? JSON.stringify({ content, reason: d.reason })
          : serialized,
        actor.id,
        s.now(),
      ],
    ],
    {
      scope: d.scope,
      revision: d.revision + 1,
      fields: Object.keys(content),
      published: action === "content-publish",
    },
    d.scope === "private" ? "Private venue content changed" : d.reason,
  );
  demand(result[0].meta?.changes === 1, 409, "CONTENT_CHANGED_RELOAD");
  return {
    message:
      action === "content-publish"
        ? "Content published. Event policies remain unchanged."
        : "Draft saved. Public content is unchanged.",
    revision: d.revision + 1,
  };
}
