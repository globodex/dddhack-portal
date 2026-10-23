import { siteOrigin } from "../../lib/seo";
export async function GET() {
  return new Response(
    "User-agent: *\nAllow: /\n" +
      [
        "api",
        "dashboard",
        "profile",
        "teams",
        "submission",
        "review",
        "rules",
        "admin",
        "judge",
        "signin-with-chatgpt",
        "signout-with-chatgpt",
      ]
        .map((p) => `Disallow: /${p}`)
        .join("\n") +
      `\nSitemap: ${siteOrigin}/sitemap.xml\n`,
    { headers: { "Content-Type": "text/plain; charset=utf-8" } },
  );
}
