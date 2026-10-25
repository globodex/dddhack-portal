// Read-only synthetic browser checks. All screenshots must stay outside Git.
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import cp from "node:child_process";
const origin = process.env.WIDTH_QA_ORIGIN || "http://localhost:3025";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
const out = path.resolve(
  process.env.WIDTH_QA_OUTPUT || "/tmp/ddd-shared-width/final",
);
assert.ok(out.startsWith("/tmp/"), "Evidence stays outside Git");
fs.mkdirSync(out, { recursive: true });
const report = {
  source: cp
    .execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" })
    .trim(),
  syntheticOnly: true,
  GETOnly: true,
  checks: [],
  captures: [],
  metrics: [],
  errors: [],
  httpFailures: [],
};
const save = () =>
  fs.writeFileSync(
    path.join(out, "report.json"),
    JSON.stringify(report, null, 2),
  );
function check(name, value) {
  assert.ok(value, name);
  report.checks.push(name);
  save();
}
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox"],
});
async function contextFor(width, height, actor) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    isMobile: width < 741,
    hasTouch: width < 741,
    reducedMotion: "reduce",
    serviceWorkers: "block",
  });
  if (actor)
    await context.addCookies([
      { name: "portal_local_fixture", value: actor, url: origin },
    ]);
  await context.route("**/*", (r) =>
    new URL(r.request().url()).origin === origin &&
    ["GET", "HEAD"].includes(r.request().method())
      ? r.continue()
      : r.abort(),
  );
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on("pageerror", (e) => report.errors.push(e.message));
  page.on("response", (r) => {
    if (r.status() >= 400)
      report.httpFailures.push({ url: r.url(), status: r.status() });
  });
  return { context, page };
}
async function go(page, route) {
  await page.goto(origin + route, { waitUntil: "networkidle", timeout: 90000 });
  await page.waitForFunction(
    () =>
      document.querySelector(".app-shell")?.getAttribute("data-hydrated") ===
      "true",
  );
  await page.evaluate(() => document.fonts.ready);
}
async function shot(page, name) {
  const file = path.join(out, name + ".png");
  await page.screenshot({ path: file, animations: "disabled" });
  report.captures.push(file);
  save();
}
async function geometry(page) {
  return page.evaluate(() => {
    const box = (e) => {
      if (!e) return null;
      const b = e.getBoundingClientRect(),
        s = getComputedStyle(e);
      return {
        x: b.x,
        y: b.y,
        width: b.width,
        height: b.height,
        right: b.right,
        bottom: b.bottom,
        maxWidth: s.maxWidth,
        marginLeft: s.marginLeft,
        paddingLeft: parseFloat(s.paddingLeft),
        paddingRight: parseFloat(s.paddingRight),
        grid: s.gridTemplateColumns,
      };
    };
    const main = document.querySelector(".main"),
      header = document.querySelector(".navigation-header");
    const collection = document.querySelector(
      ".main > .discover-v6,.main > .admin-workspace,.main > .public-project-list,.main > .rules-essentials",
    );
    return {
      viewport: [innerWidth, innerHeight],
      documentWidth: document.documentElement.scrollWidth,
      main: box(main),
      header: box(header),
      collection: box(collection),
      onboarding: !!document.querySelector(".onboarding-shell"),
      grid: box(document.querySelector(".discover-directory,.admin-team-list")),
      hero: box(document.querySelector(".home-hero")),
      date: box(document.querySelector(".hero-date")),
      actions: box(document.querySelector(".hero-actions")),
      cta: box(document.querySelector(".primary-cta")),
      dots: box(document.querySelector(".home-motion-strip")),
      profileMeasure: box(document.querySelector(".profile-flow")),
      editorMeasure: box(document.querySelector(".submission-v6")),
    };
  });
}
const routes = [
  ["/discover/teams", "alice", 1920, 1080],
  ["/discover/participants", "stranger", 1920, 1080],
  ["/projects", "stranger", 1920, 1080],
  ["/leaderboard", "stranger", 1920, 1080],
  ["/admin/teams", "owner", 1920, 1080],
  ["/admin/participants", "owner", 1440, 900],
  ["/rules", "alice", 1920, 1080],
  ["/dashboard", "alice", 1920, 1080],
  ["/profile", "alice", 1440, 900],
  ["/submission", "alice", 1440, 900],
  ["/discover/teams", "alice", 1195, 1007],
  ["/discover/participants", "stranger", 768, 1024],
  ["/admin/teams", "owner", 768, 1024],
  ["/projects", "stranger", 768, 1024],
  ["/discover/teams", "alice", 390, 844],
  ["/admin/participants", "owner", 390, 844],
  ["/projects", "stranger", 390, 844],
  ["/profile", "alice", 390, 844],
  ["/submission", "alice", 390, 844],
  ["/discover/teams", "alice", 320, 480],
];
try {
  for (const [route, actor, width, height] of routes) {
    const { context, page } = await contextFor(width, height, actor);
    await go(page, route);
    const key =
      route.slice(1).replaceAll("/", "-") + "-" + width + "x" + height;
    const g = await geometry(page);
    report.metrics.push({ route, actor, key, ...g });
    save();
    check(key + " no horizontal page overflow", g.documentWidth <= width);
    if (!g.onboarding)
      check(
        key + " main fills same canvas as header",
        Math.abs(g.main.width - g.header.width) < 1 &&
          Math.abs(g.main.x - g.header.x) < 1,
      );
    if (g.collection)
      check(
        key + " collection fills available gutters",
        Math.abs(
          g.collection.width -
            (g.main.width - g.main.paddingLeft - g.main.paddingRight),
        ) < 1,
      );
    if (route === "/profile")
      check(
        key + " profile keeps readable form measure",
        g.profileMeasure.width <= 1080.5,
      );
    if (route === "/submission" && g.editorMeasure)
      check(
        key + " submission keeps readable editor measure",
        g.editorMeasure.width <= 960.5,
      );
    await shot(page, key);
    if (route === "/discover/teams" && [390, 320].includes(width)) {
      const trigger = page.locator(".discover-team-open").first();
      await trigger.scrollIntoViewIfNeeded();
      await trigger.tap();
      await page.locator("dialog[open]").waitFor();
      check(
        key + " modal remains inside viewport",
        await page.locator("dialog[open]").evaluate((e) => {
          let r = e.getBoundingClientRect();
          return (
            r.left >= 0 &&
            r.right <= innerWidth &&
            r.top >= 0 &&
            r.bottom <= innerHeight + 0.5
          );
        }),
      );
      await shot(page, key + "-team-dialog");
      await page.keyboard.press("Escape");
      await page.waitForFunction(() => !document.querySelector("dialog[open]"));
      check(
        key + " Escape restores trigger focus",
        await trigger.evaluate((e) => e === document.activeElement),
      );
      const menu = page.getByRole("button", { name: "Open navigation" });
      await menu.tap();
      await page.locator(".mobile-navigation[open]").waitFor();
      await page.waitForTimeout(300);
      check(
        key + " menu uses full viewport",
        await page.locator(".mobile-navigation[open]").evaluate((e) => {
          const r = e.getBoundingClientRect();
          return (
            Math.abs(r.width - innerWidth) < 1 && r.height >= innerHeight - 1
          );
        }),
      );
      await shot(page, key + "-menu");
      await page.keyboard.press("Escape");
      await page.waitForFunction(
        () => !document.querySelector(".mobile-navigation[open]"),
      );
      check(
        key + " menu Escape restores trigger",
        await menu.evaluate((e) => e === document.activeElement),
      );
    }
    await context.close();
  }
  for (const [width, height] of [
    [390, 844],
    [320, 480],
    [430, 932],
    [390, 480],
  ]) {
    for (const actor of ["", "alice"]) {
      const { context, page } = await contextFor(width, height, actor);
      await go(page, "/");
      const key =
        "home-" +
        width +
        "x" +
        height +
        "-" +
        (actor ? "signed-in" : "anonymous");
      const g = await geometry(page);
      report.metrics.push({ key, ...g });
      check(
        key + " branding-to-actions gap is compact",
        g.actions.y - g.date.bottom >= 23 && g.actions.y - g.date.bottom <= 65,
      );
      check(
        key + " bottom dot stage stays separate",
        g.dots.y >= g.actions.bottom - 0.5 && g.dots.height >= 167.5,
      );
      check(key + " no horizontal overflow", g.documentWidth <= width);
      check(
        key + " real signed-in/out destination preserved",
        (await page.locator(".primary-cta").getAttribute("href")) ===
          (actor ? "/dashboard" : "/signin?returnTo=%2Fdashboard"),
      );
      await shot(page, key);
      await page.locator(".primary-cta").scrollIntoViewIfNeeded();
      await page.locator(".primary-cta").focus();
      check(
        key + " CTA reachable, keyboard focusable and unobstructed",
        await page.locator(".primary-cta").evaluate((e) => {
          const r = e.getBoundingClientRect(),
            x = r.x + r.width / 2,
            y = r.y + r.height / 2,
            hit = document.elementFromPoint(x, y);
          return (
            e === document.activeElement &&
            r.height >= 44 &&
            y >
              document
                .querySelector(".navigation-header")
                .getBoundingClientRect().bottom &&
            y < innerHeight &&
            e.contains(hit)
          );
        }),
      );
      if (height === 480) await shot(page, key + "-cta-scroll");
      await context.close();
    }
  }
  check("no browser exceptions", report.errors.length === 0);
  check("no failed HTTP responses", report.httpFailures.length === 0);
} catch (e) {
  report.failure = String(e.stack || e);
  save();
  process.exitCode = 1;
} finally {
  await browser.close();
  report.browserClosed = true;
  save();
}
console.log(
  JSON.stringify({
    checks: report.checks.length,
    captures: report.captures.length,
    errors: report.errors,
    httpFailures: report.httpFailures,
    failure: report.failure,
    browserClosed: report.browserClosed,
  }),
);
