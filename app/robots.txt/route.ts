import { siteOrigin } from "../../lib/seo";
export async function GET() {
  return new Response(
    // HTML routes remain crawlable so their noindex directive can be read.
    // Authentication and server authorization, never robots.txt, protect data.
    "User-agent: *\nAllow: /\nDisallow: /api/\nAllow: /api/project-image/\n" +
      `\nSitemap: ${siteOrigin}/sitemap.xml\n`,
    { headers: { "Content-Type": "text/plain; charset=utf-8" } },
  );
}
