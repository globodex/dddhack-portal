// Read-only verification against the already running integrated local app.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const origin = "http://127.0.0.1:3000";
const runtimeRoot = "/workspace/dddhack-portal";
const source = "0f5f8236bcc30c3d6a6a5960eb2f24154ed89d19";
const output = resolve("evidence/seo-legal-0f5f823");
mkdirSync(output, { recursive: true });
const revision = () =>
  execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: runtimeRoot,
    encoding: "utf8",
  }).trim();
const dirty = () =>
  execFileSync(
    "git",
    ["status", "--porcelain", "--", "app", "lib", "neon", "next.config.ts"],
    { cwd: runtimeRoot, encoding: "utf8" },
  ).trim();
const verifyRuntime = () =>
  execFileSync(
    "git",
    [
      "diff",
      "--quiet",
      source,
      "HEAD",
      "--",
      "app",
      "lib",
      "neon",
      "next.config.ts",
    ],
    { cwd: runtimeRoot },
  );
verifyRuntime();
assert.equal(dirty(), "", "Integrated runtime has uncommitted changes");
const report = {
  source,
  revisionAtStart: revision(),
  origin,
  runtimeRoot,
  readOnly: true,
  syntheticLocal: true,
  startedAt: new Date().toISOString(),
  checks: [],
  screenshots: [],
  browserErrors: [],
  consoleErrors: [],
  blockedRequests: [],
  accessibility: [],
  http: [],
  network: [],
  limitations: [
    "Local development app with static legal content and disposable fixture backend; no production writes or real login.",
    "Container Chromium uses its sandbox-disabled mode. Viewports emulate touch and are not physical devices.",
    "Configured local APP_ORIGIN is expected in these captures; production fallback and configured-origin validation are covered by focused source tests.",
  ],
};
const save = () =>
  writeFileSync(
    resolve(output, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
const check = (name) => {
  report.checks.push({ name, passed: true });
  save();
};
const attrs = (tag) =>
  Object.fromEntries(
    [...tag.matchAll(/([\w:-]+)="([^"]*)"/g)].map((match) => [
      match[1],
      match[2],
    ]),
  );
const tags = (html) => (html.match(/<(?:meta|link)\b[^>]*>/g) || []).map(attrs);
const metadata = (html) => {
  const parsed = tags(html);
  return {
    title: html.match(/<title>([\s\S]*?)<\/title>/)?.[1],
    robots: parsed.find((tag) => tag.name === "robots")?.content,
    canonical: parsed.find((tag) => tag.rel === "canonical")?.href,
    ogTitle: parsed.find((tag) => tag.property === "og:title")?.content,
    ogDescription: parsed.find((tag) => tag.property === "og:description")
      ?.content,
    ogUrl: parsed.find((tag) => tag.property === "og:url")?.content,
  };
};

let browser;
try {
  // A bot user agent exercises server metadata before client JavaScript.
  for (const path of [
    "/privacy",
    "/terms",
    "/signin",
    "/profile",
    "/dashboard",
    "/discover/participants",
    "/discover/teams",
    "/admin/settings",
    "/projects/seo-unpublished-missing",
  ]) {
    const response = await fetch(origin + path, {
      headers: { "user-agent": "Googlebot" },
      redirect: "manual",
    });
    const html = await response.text();
    const meta = metadata(html);
    report.http.push({ path, status: response.status, ...meta });
    assert.match(meta.robots || "", /noindex/, path);
    assert.ok(
      !/C201|alice@portal\.test|\+12025550100/.test(html),
      path + " leaked private fixture fields",
    );
    if (path === "/privacy" || path === "/terms") {
      assert.equal(response.status, 200);
      assert.match(html, /Draft for organizer review/);
      assert.ok(html.includes("Parampreet Singh"));
      assert.ok(html.includes("hey@itsparam.in"));
      assert.equal(meta.canonical, origin + path);
      assert.ok(!meta.ogTitle);
    }
    if (path.endsWith("seo-unpublished-missing"))
      assert.equal(response.status, 404);
  }
  check(
    "HTTP legal drafts render semantic content with noindex; protected/auth routes and missing project remain non-indexable without private fields",
  );

  const robotsResponse = await fetch(origin + "/robots.txt");
  const robots = await robotsResponse.text();
  assert.equal(robotsResponse.status, 200);
  assert.ok(robots.includes("Disallow: /api/"));
  assert.ok(robots.includes("Allow: /api/project-image/"));
  assert.ok(!robots.includes("Disallow: /privacy"));
  assert.ok(!robots.includes("Disallow: /profile"));
  assert.ok(robots.includes(`Sitemap: ${origin}/sitemap.xml`));
  report.robots = robots;
  const sitemapResponse = await fetch(origin + "/sitemap.xml");
  const sitemap = await sitemapResponse.text();
  assert.equal(sitemapResponse.status, 200);
  const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
    (match) => match[1],
  );
  assert.ok(locations.includes(origin + "/"));
  for (const url of locations) {
    const parsed = new URL(url);
    assert.equal(parsed.origin, origin);
    assert.ok(
      parsed.pathname === "/" || /^\/projects\/[^/]+$/.test(parsed.pathname),
    );
    assert.equal(parsed.search, "");
  }
  report.sitemap = { status: sitemapResponse.status, locations };
  check(
    "robots permits HTML noindex inspection and public project media; sitemap contains only home and public project details",
  );
  const privateApi = await fetch(origin + "/api/portal?view=%2Fprofile");
  assert.equal(privateApi.status, 401);
  assert.match(privateApi.headers.get("x-robots-tag") || "", /noindex/);
  report.privateApi = {
    status: privateApi.status,
    robots: privateApi.headers.get("x-robots-tag"),
    cache: privateApi.headers.get("cache-control"),
  };
  check(
    "private API rejects anonymous read and carries noindex response header",
  );

  browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    headless: true,
    chromiumSandbox: false,
  });
  report.browser = browser.version();
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
    { width: 390, height: 480 },
  ]) {
    for (const path of ["/privacy", "/terms"]) {
      const label = path.slice(1);
      const context = await browser.newContext({
        viewport,
        reducedMotion: "reduce",
        serviceWorkers: "block",
        ...(viewport.width < 500 ? { isMobile: true, hasTouch: true } : {}),
      });
      const traffic = [];
      await context.route("**/*", (route) => {
        const request = route.request(),
          url = new URL(request.url());
        if (
          url.origin !== origin ||
          (!["GET", "HEAD"].includes(request.method()) &&
            !url.pathname.startsWith("/__nextjs_"))
        ) {
          report.blockedRequests.push({
            path,
            viewport,
            method: request.method(),
            target: url.pathname,
          });
          return route.abort("blockedbyclient");
        }
        return route.continue();
      });
      const page = await context.newPage();
      page.on("request", (request) =>
        traffic.push({
          method: request.method(),
          path: new URL(request.url()).pathname,
          type: request.resourceType(),
        }),
      );
      page.on("pageerror", (error) =>
        report.browserErrors.push({ path, viewport, message: error.message }),
      );
      page.on("console", (message) => {
        if (message.type() === "error")
          report.consoleErrors.push({
            path,
            viewport,
            message: message.text(),
          });
      });
      const response = await page.goto(origin + path, {
        waitUntil: "networkidle",
      });
      assert.equal(response.status(), 200);
      const opener = page.getByRole("button", {
        name: "Open navigation",
        exact: true,
      });
      await expect(opener).toBeEnabled();
      await page.evaluate(() => document.fonts.ready);
      const dimensions = await page.evaluate(() => ({
        width: innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        h1: document.querySelector("h1")?.textContent,
        pageHeight: document.documentElement.scrollHeight,
      }));
      assert.ok(
        dimensions.scrollWidth <= dimensions.width,
        path + " horizontal overflow",
      );
      assert.equal(await page.getByRole("heading", { level: 1 }).count(), 1);
      assert.equal(
        await page
          .getByText("Draft for organizer review", { exact: true })
          .count(),
        1,
      );
      const buttonBox = await opener.boundingBox();
      assert.equal(buttonBox.width, 44);
      assert.equal(buttonBox.height, 44);
      const stem = `${label}-${viewport.width}x${viewport.height}`;
      for (const [suffix, fullPage] of [
        ["viewport", false],
        ["full", true],
      ]) {
        const filename = `${stem}-${suffix}.png`;
        await page.screenshot({
          path: resolve(output, filename),
          fullPage,
          animations: "disabled",
        });
        report.screenshots.push({
          filename,
          source,
          path,
          viewport,
          fullPage,
          inspected: false,
        });
      }
      check(
        `${stem}: draft content, heading, no horizontal clipping and 44px menu control`,
      );

      if (
        viewport.width === 1440 ||
        (viewport.width === 390 && viewport.height === 844)
      ) {
        const result = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze();
        report.accessibility.push({
          path,
          viewport,
          state: "page",
          violations: result.violations,
        });
        assert.equal(
          result.violations.length,
          0,
          stem + " accessibility violations",
        );
      }

      if (
        path === "/privacy" &&
        viewport.width === 390 &&
        viewport.height === 844
      ) {
        await page
          .getByRole("link", { name: "Retention", exact: true })
          .click();
        const region = page.locator("#retention");
        const box = await region.boundingBox();
        assert.ok(box.y >= 64);
        const filename = `${stem}-retention.png`;
        await page.screenshot({
          path: resolve(output, filename),
          fullPage: false,
          animations: "disabled",
        });
        report.screenshots.push({
          filename,
          source,
          path,
          viewport,
          state: "retention",
          inspected: false,
        });
        await page.evaluate(() => scrollTo(0, 0));
      }

      // Keyboard opening, native dismissal, focus return, browser Back and touch.
      await opener.focus();
      const before = await page.locator("main").boundingBox();
      await opener.press("Enter");
      const dialog = page.getByRole("dialog", {
        name: "Navigation",
        exact: true,
      });
      await expect(dialog).toBeVisible();
      const after = await page.locator("main").boundingBox();
      assert.ok(
        Math.abs(before.width - after.width) < 1 &&
          Math.abs(before.x - after.x) < 1,
        stem + " modal shifted page",
      );
      const destinations = {
        Home: "/",
        Projects: "/projects",
        Dashboard: "/dashboard",
        Privacy: "/privacy",
        Terms: "/terms",
      };
      for (const [name, href] of Object.entries(destinations)) {
        const link = dialog.getByRole("link", { name, exact: true });
        await expect(link).toHaveAttribute("href", href);
        assert.equal(await link.locator("svg").count(), 1);
      }
      if (path === "/privacy" && viewport.width !== 768) {
        const filename = `${stem}-menu.png`;
        await page.screenshot({
          path: resolve(output, filename),
          fullPage: false,
          animations: "disabled",
        });
        report.screenshots.push({
          filename,
          source,
          path,
          viewport,
          state: "menu",
          inspected: false,
        });
      }
      await page.keyboard.press("Escape");
      await expect(dialog).not.toBeVisible();
      await expect(opener).toBeFocused();
      if (viewport.width < 500) await opener.tap();
      else await opener.click();
      await expect(dialog).toBeVisible();
      await page.goBack();
      await expect(dialog).not.toBeVisible();
      await expect(opener).toBeFocused();
      if (viewport.width < 500) {
        await opener.tap();
        await expect(dialog).toBeVisible();
        await dialog
          .getByRole("button", { name: "Close navigation", exact: true })
          .tap();
        await expect(dialog).not.toBeVisible();
      }
      check(
        `${stem}: icon destinations, keyboard/Escape, browser Back, focus return and stable menu geometry`,
      );
      const apiRequests = traffic.filter((request) =>
        request.path.startsWith("/api/"),
      );
      assert.equal(apiRequests.length, 0, stem + " fetched session/API data");
      report.network.push({
        path,
        viewport,
        dimensions,
        requests: traffic.length,
        apiRequests,
      });
      await context.close();
    }
  }
  assert.equal(report.browserErrors.length, 0);
  assert.equal(report.consoleErrors.length, 0);
  assert.equal(report.blockedRequests.length, 0);
  verifyRuntime();
  report.revisionAtEnd = revision();
  assert.equal(dirty(), "");
  report.result = "passed";
} catch (error) {
  report.result = "blocked";
  report.failure = String(error.stack || error);
  process.exitCode = 1;
} finally {
  await browser?.close();
  report.finishedAt = new Date().toISOString();
  save();
}
console.log(
  JSON.stringify(
    {
      result: report.result,
      checks: report.checks.length,
      screenshots: report.screenshots.length,
      report: resolve(output, "report.json"),
      failure: report.failure,
    },
    null,
    2,
  ),
);
