import { siteOrigin, xmlEscape } from "./seo";

export function publicProjectPath(slug: unknown) {
  if (
    typeof slug !== "string" ||
    !slug ||
    slug.length > 200 ||
    slug === "." ||
    slug === ".." ||
    /[\\/\u0000-\u001f\u007f]/.test(slug)
  )
    return undefined;
  try {
    return "/projects/" + encodeURIComponent(slug);
  } catch {
    return undefined;
  }
}

export async function publicSitemap(
  readPublicProjects: (page: number) => Promise<Record<string, any>>,
) {
  try {
    // The reader is anonymous and already enforces publication and eligibility.
    // The requested sitemap contains only home and actual public project pages.
    const paths = ["/"];
    for (let page = 0; page < 42; page++) {
      const view = await readPublicProjects(page);
      for (const item of (view.items || []) as { slug: unknown }[]) {
        const path = publicProjectPath(item.slug);
        if (path) paths.push(path);
      }
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
