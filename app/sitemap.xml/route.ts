import { siteOrigin, xmlEscape } from "../../lib/seo";
import { getSitesRuntime, unavailableResponse } from "../../lib/sites-runtime";
import { PortalService } from "../../lib/service";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const runtime = getSitesRuntime();
    const service = new PortalService(runtime.db, null, undefined);
    const paths = ["/", "/projects", "/leaderboard"];
    // Reuse the anonymous public projection and its publication/eligibility gate.
    // No draft, participant, private feedback or result internals enter the sitemap.
    for (let page = 0; page < 42; page++) {
      const view = await service.view("/projects", { page });
      for (const item of (view.items || []) as { slug: string }[])
        paths.push("/projects/" + encodeURIComponent(item.slug));
      if (!view.hasMore) break;
    }
    return new Response(
      '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
        [...new Set(paths)]
          .map(
            (path) =>
              "<url><loc>" + xmlEscape(siteOrigin + path) + "</loc></url>",
          )
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
