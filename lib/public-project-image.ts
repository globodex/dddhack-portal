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
  const row = await one<{ payload: string }>(
    db,
    "SELECT v.payload FROM projects p JOIN submission_versions v ON v.id=p.published_version_id AND v.team_id=p.team_id WHERE p.id=? AND p.published_version_id=? AND COALESCE((SELECT e.status FROM project_eligibility e WHERE e.project_id=p.id AND e.version_id=v.id),(SELECT r.eligibility FROM reviews r WHERE r.team_id=p.team_id AND r.version_id=v.id),'needs_review')='eligible'",
    id,
    version || "",
  );
  demand(row, 404, "IMAGE_NOT_FOUND");
  const value = JSON.parse(row.payload)[kind] as string;
  validateProjectImage(value || "", kind);
  const [header, encoded] = value.split(",");
  const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
  return new Response(bytes, {
    headers: {
      "Content-Type": header.includes("image/png") ? "image/png" : "image/jpeg",
      "Cache-Control": "public, max-age=300",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
