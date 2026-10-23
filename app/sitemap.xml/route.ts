import { siteOrigin, xmlEscape } from "../../lib/seo";
import { getSitesRuntime, unavailableResponse } from "../../lib/sites-runtime";
import { rows } from "../../lib/db";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const runtime = getSitesRuntime();
    const projects = await rows<{ slug: string }>(
      runtime.db,
      "SELECT p.slug FROM projects p JOIN submission_versions v ON v.id=p.published_version_id AND v.team_id=p.team_id WHERE COALESCE((SELECT status FROM project_eligibility e WHERE e.project_id=p.id AND e.version_id=v.id),(SELECT eligibility FROM reviews r WHERE r.team_id=p.team_id AND r.version_id=v.id),'needs_review')='eligible' ORDER BY p.slug LIMIT 10000",
    );
    const paths = [
      "/",
      "/projects",
      "/leaderboard",
      ...projects.map((p) => "/projects/" + encodeURIComponent(p.slug)),
    ];
    return new Response(
      '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
        paths
          .map((p) => "<url><loc>" + xmlEscape(siteOrigin + p) + "</loc></url>")
          .join("") +
        "</urlset>",
      {
        headers: {
          "Content-Type": "application/xml; charset=utf-8",
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    return unavailableResponse(error);
  }
}
