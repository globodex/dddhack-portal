import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  configuredSiteOrigin,
  eventStructuredData,
  pageMetadata,
  publicProjectMetadataEntry,
  siteOrigin,
} from "../lib/seo";
import { publicProjectPath, publicSitemap } from "../lib/sitemap";
import { GET as robots } from "../app/robots.txt/route";
import PublicInformation, {
  privacyContact,
  portalOperator,
} from "../app/public-information";
import InformationNavigation from "../app/information-navigation";
import { readFileSync } from "node:fs";
import sharp from "sharp";

test("homepage social metadata and Event share the actual 1200x630 hero while project banners retain their own policy", async () => {
  const image = siteOrigin + "/og/devday-new-delhi-home.jpg";
  const home = pageMetadata("/");
  assert.deepEqual(home.openGraph?.images, [
    {
      url: image,
      alt: "DevDay Exchange Community Hackathon: New Delhi",
      width: 1200,
      height: 630,
      type: "image/jpeg",
    },
  ]);
  assert.deepEqual(home.twitter?.images, [image]);
  assert.deepEqual(eventStructuredData.image, [image]);
  const bytes = readFileSync(
    new URL("../public/og/devday-new-delhi-home.jpg", import.meta.url),
  );
  const asset = await sharp(bytes).metadata();
  assert.equal(asset.width, 1200);
  assert.equal(asset.height, 630);
  assert.equal(asset.format, "jpeg");
  assert.ok(
    bytes.length < 120000,
    "The static social image remains lightweight",
  );
  assert.equal(
    pageMetadata("/projects").openGraph?.images[0].url,
    siteOrigin + "/art/delhi-v3/fallback-approved-v3.png",
  );
  assert.equal(
    pageMetadata("/projects/eligible", {
      projectName: "Public project",
      banner: "/api/project-image/project-123/banner?version=v1",
    }).openGraph?.images[0].url,
    siteOrigin + "/api/project-image/project-123/banner?version=v1",
  );
});

test("configured canonical origin accepts an exact HTTPS origin and rejects credential or path variants", () => {
  assert.equal(
    configuredSiteOrigin("https://dddhack-portal.itsparam.in", false),
    "https://dddhack-portal.itsparam.in",
  );
  for (const value of [
    "https://dddhack-portal.itsparam.in/",
    "https://example.test/path",
    "https://person:password@example.test",
    "http://example.test",
  ]) {
    assert.throws(() => configuredSiteOrigin(value, false));
  }
});

test("public titles, descriptions, canonical and social URLs are unique and use the configured origin", () => {
  const metadata = ["/", "/projects", "/leaderboard"].map((path) =>
    pageMetadata(path),
  );
  assert.equal(new Set(metadata.map((value) => value.title)).size, 3);
  assert.equal(new Set(metadata.map((value) => value.description)).size, 3);
  for (const value of metadata) {
    assert.equal(value.robots.index, true);
    assert.ok(value.alternates.canonical.startsWith(siteOrigin + "/"));
    assert.equal(value.openGraph?.url, value.alternates.canonical);
    assert.equal(value.twitter?.card, "summary_large_image");
    assert.ok(value.openGraph?.images[0].url.startsWith(siteOrigin + "/"));
  }
  assert.match(metadata[0].description, /hosted by Codex Ambassadors/);
});

test("private, authentication, directory and draft legal routes never publish indexable social metadata", () => {
  for (const path of [
    "/dashboard",
    "/profile",
    "/teams",
    "/discover/participants",
    "/discover/teams",
    "/admin/settings",
    "/admin/logs",
    "/review",
    "/project-history",
    "/rules",
    "/signin",
    "/api/auth/callback/google",
    "/privacy",
    "/terms",
    "/unknown",
  ]) {
    const value = pageMetadata(path, {
      projectName: "PRIVATE_PROFILE_MARKER",
      problemSolution: "PRIVATE_IDEA_MARKER",
    });
    assert.equal(value.robots.index, false, path);
    assert.equal(value.robots.follow, false, path);
    assert.equal("openGraph" in value, false, path);
    assert.ok(!JSON.stringify(value).includes("PRIVATE_"), path);
  }
  assert.equal(pageMetadata("/projects/absent").robots.index, false);
});

test("project metadata selects published fields only and rejects arbitrary social-image URLs", () => {
  const row = {
    projectName: "Useful public project",
    problemSolution: "A published solution.",
    banner: "/api/project-image/project-123/banner?version=v1",
    email: "PRIVATE_EMAIL_MARKER",
    phone: "PRIVATE_PHONE_MARKER",
    idea: "PRIVATE_IDEA_MARKER",
    credit: "PRIVATE_CREDIT_MARKER",
  };
  const selected = publicProjectMetadataEntry(row);
  assert.deepEqual(Object.keys(selected!), [
    "projectName",
    "problemSolution",
    "banner",
  ]);
  const metadata = pageMetadata("/projects/public-slug", selected);
  assert.equal(metadata.robots.index, true);
  assert.match(metadata.title, /^Useful public project/);
  assert.equal(metadata.openGraph?.images[0].url, siteOrigin + row.banner);
  assert.ok(!JSON.stringify(metadata).includes("PRIVATE_"));
  for (const banner of [
    "https://elsewhere.test/image.png",
    "//elsewhere.test/image.png",
    "/api/profile-photo/private",
    "/api/project-image/project-123/banner?version=v1&phone=PRIVATE",
  ]) {
    const fallback = pageMetadata("/projects/public-slug", { ...row, banner });
    assert.equal(
      fallback.openGraph?.images[0].url,
      siteOrigin + "/art/delhi-v3/fallback-approved-v3.png",
    );
  }
});

test("sitemap includes only home and bounded valid public project paths across pages", async () => {
  const pages: number[] = [];
  const response = await publicSitemap(async (page) => {
    pages.push(page);
    return page === 0
      ? {
          items: [
            { slug: "alpha" },
            { slug: ".." },
            { slug: "/admin" },
            { slug: "bad\\path" },
          ],
          hasMore: true,
        }
      : {
          items: [
            { slug: "alpha" },
            { slug: "project & prototype", email: "PRIVATE_EMAIL_MARKER" },
          ],
          hasMore: false,
        };
  });
  assert.deepEqual(pages, [0, 1]);
  const xml = await response.text();
  const locations = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
    (match) => match[1],
  );
  assert.deepEqual(locations, [
    siteOrigin + "/",
    siteOrigin + "/projects/alpha",
    siteOrigin + "/projects/project%20%26%20prototype",
  ]);
  assert.ok(!xml.includes("PRIVATE_"));
  assert.equal(publicProjectPath("."), undefined);
  assert.equal(publicProjectPath(null), undefined);
  const unavailable = await publicSitemap(async () => {
    throw new Error("unavailable");
  });
  assert.equal(unavailable.status, 503);
});

test("robots lets crawlers read HTML noindex, blocks API crawling and permits only public project media", async () => {
  const text = await (await robots()).text();
  assert.ok(text.includes("Disallow: /api/"));
  assert.ok(text.includes("Allow: /api/project-image/"));
  assert.ok(!text.includes("Disallow: /privacy"));
  assert.ok(!text.includes("Disallow: /profile"));
  assert.ok(text.includes(`Sitemap: ${siteOrigin}/sitemap.xml`));
});

test("event structured data uses only approved public facts and no invented commercial claims or private room", () => {
  const data = JSON.stringify(eventStructuredData);
  assert.equal(eventStructuredData.startDate, "2026-11-01T08:00:00+05:30");
  assert.equal(eventStructuredData.endDate, "2026-11-01T20:00:00+05:30");
  assert.equal(eventStructuredData.location.name, "IIIT Delhi");
  assert.ok(
    !/C201|Lecture Hall|streetAddress|ticket|price|aggregateRating|offers|prize/.test(
      data,
    ),
  );
  assert.equal(eventStructuredData.organizer.name, "Parampreet Singh");
});

test("legal drafts render server-side semantic content with verified controller, contact and retention categories", () => {
  for (const kind of ["privacy", "terms"] as const) {
    const html = renderToStaticMarkup(
      createElement(PublicInformation, { kind }),
    );
    assert.equal((html.match(/<h1/g) || []).length, 1);
    assert.ok(html.includes("Draft for organizer review"));
    assert.ok(html.includes(portalOperator));
    assert.ok(html.includes(`mailto:${privacyContact}`));
    assert.match(html, /90-day/);
    assert.match(html, /indefinite/);
    assert.match(html, /manual/);
    assert.match(html, /automatic purge/);
    assert.ok(
      !/C201|Lecture Hall|we are GDPR compliant|fully compliant|never share/.test(
        html,
      ),
    );
    assert.equal(pageMetadata("/" + kind).robots.index, false);
  }
});

test("legal header reuses the hydrated shared menu with named icon destinations and no visible Menu label", () => {
  const html = renderToStaticMarkup(
    createElement(InformationNavigation, { path: "/privacy" }),
  );
  assert.match(html, /aria-label="Open navigation"/);
  assert.match(html, /aria-controls="mobile-navigation"/);
  assert.match(html, /aria-haspopup="dialog" disabled=""/);
  for (const [path, name] of [
    ["/", "Home"],
    ["/projects", "Projects"],
    ["/dashboard", "Dashboard"],
    ["/privacy", "Privacy"],
    ["/terms", "Terms"],
  ]) {
    assert.ok(html.includes(`href="${path}"`));
    assert.ok(html.includes(`<span>${name}</span>`));
  }
  assert.match(html, /href="\/privacy" aria-current="page"/);
  assert.doesNotMatch(html, />Menu</);
});

test("privacy draft acknowledges the confirmed active Cloudflare proxy and distinguishes hiding from erasure", () => {
  const html = renderToStaticMarkup(
    createElement(PublicInformation, { kind: "privacy" }),
  );
  assert.match(html, /Cloudflare provides DNS and proxy\/network delivery/);
  assert.match(html, /Hiding a record from portal views does not itself erase/);
  assert.doesNotMatch(html, /Whether Cloudflare is active|this release/);
});
