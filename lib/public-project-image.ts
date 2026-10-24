import type { Database } from "./db";
import { one } from "./db";
import { demand } from "./security";
import { validateProjectImage } from "./project-media";
export async function publicProjectImage(
  db: Database,
  id: string,
  kind: string,
  version: string | null,
) {
  demand(kind === "logo" || kind === "banner", 404, "IMAGE_NOT_FOUND");
  const field = kind === "logo" ? "$.logo" : "$.banner";
  const row = await one<{ project_image_value: string }>(
    db,
    `SELECT json_extract(v.payload,'${field}') AS project_image_value,v.team_id AS project_image_team_id,'${kind}' AS project_image_kind FROM projects p JOIN submission_versions v ON v.id=p.published_version_id AND v.team_id=p.team_id WHERE NOT EXISTS(SELECT 1 FROM record_removals rr WHERE rr.active=1 AND ((rr.kind='project' AND rr.target_id=p.id) OR (rr.kind='submission' AND rr.target_id=v.id))) AND p.id=? AND p.published_version_id=? AND COALESCE((SELECT e.status FROM project_eligibility e WHERE e.project_id=p.id AND e.version_id=v.id),(SELECT r.eligibility FROM reviews r WHERE r.team_id=p.team_id AND r.version_id=v.id),'needs_review')='eligible'`,
    id,
    version || "",
  );
  demand(row, 404, "IMAGE_NOT_FOUND");
  const value = row.project_image_value;
  validateProjectImage(value || "", kind);
  const [header, encoded] = value.split(",");
  const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
  return new Response(bytes, {
    headers: {
      "Content-Type": header.includes("image/png") ? "image/png" : "image/jpeg",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
