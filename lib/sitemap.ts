import { siteOrigin, xmlEscape } from "./seo";

export async function publicSitemap(
  readPublicProjects: (page: number) => Promise<Record<string, any>>,
) {
  try {
    const paths = ["/", "/projects", "/leaderboard"];
    for (let page = 0; page < 42; page++) {
      const view = await readPublicProjects(page);
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
  } catch {
    return new Response("Sitemap temporarily unavailable", {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
