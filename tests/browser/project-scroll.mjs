// Synthetic-only Playwright regression. Seed /tmp fixture before invoking this runner.
import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
const origin = process.env.PORTAL_QA_ORIGIN || "http://localhost:3030",
  out =
    process.env.PORTAL_QA_OUTPUT || "/tmp/ddd-project-scroll-qa/screenshots";
assert.ok(
  ["localhost", "127.0.0.1"].includes(new URL(origin).hostname),
  "Loopback fixture only",
);
mkdirSync(out, { recursive: true });
const hash = (b) => createHash("sha256").update(b).digest("hex");
const report = {
  source: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  syntheticOnly: true,
  checks: [],
  screenshots: [],
  pageErrors: [],
  requests: [],
  startedAt: new Date().toISOString(),
};
const save = () =>
  writeFileSync(out + "/manifest.json", JSON.stringify(report, null, 2) + "\n");
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const contexts = [];
async function go(page, path) {
  await page.goto(origin + path, { waitUntil: "networkidle", timeout: 120000 });
  await page
    .locator(".app-shell[data-hydrated=true]")
    .waitFor({ timeout: 120000 });
  await page
    .locator(
      ".public-project-list[data-hydrated=true],.discover-v6[data-hydrated=true],.public-project-detail[data-hydrated=true]",
    )
    .waitFor();
  await page.evaluate(() => document.fonts.ready);
}
async function shot(page, name, fullPage = false) {
  const geometry = await page.evaluate(() => ({
    width: innerWidth,
    height: innerHeight,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  assert.ok(
    geometry.scrollWidth <= geometry.width,
    "No horizontal overflow " + name,
  );
  const file = out + "/" + name + ".png";
  await page.screenshot({
    path: file,
    fullPage,
    animations: "disabled",
    style: "nextjs-portal{visibility:hidden!important}",
  });
  report.screenshots.push({ file, sha256: hash(readFileSync(file)), geometry });
  save();
}
try {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    const context = await browser.newContext({
      viewport,
      hasTouch: true,
      reducedMotion: "reduce",
    });
    contexts.push(context);
    await context.addCookies([
      {
        name: "portal_local_fixture",
        value: "alice",
        domain: new URL(origin).hostname,
        path: "/",
      },
    ]);
    const expected = [];
    for (let n = 0; n < 3; n++) {
      const response = await context.request.get(
        origin + "/api/portal?view=%2Fprojects&page=" + n,
      );
      assert.ok(response.ok());
      expected.push(
        ...(await response.json()).items.map((p) => "entry-" + p.slug),
      );
    }
    assert.equal(expected.length, 60);
    let releasePage,
      held = false,
      page2Failed = false,
      failVote = true,
      voteCalls = 0,
      holdSearch = false,
      releaseSearch,
      searchHeld = false;
    const reads = [];
    await context.route("**/api/portal*", async (route) => {
      const req = route.request(),
        u = new URL(req.url()),
        view = u.searchParams.get("view"),
        q = u.searchParams.get("q") || "",
        page = u.searchParams.get("page") || "0";
      if (req.method() === "POST") {
        const action = req.postDataJSON()?.action;
        assert.equal(
          action,
          "upvote-project",
          "Only synthetic upvote mutation permitted",
        );
        voteCalls++;
        report.requests.push({
          viewport: viewport.width,
          method: "POST",
          action,
        });
        if (failVote) {
          failVote = false;
          return route.fulfill({
            status: 503,
            json: { code: "BACKEND_UNAVAILABLE" },
          });
        }
        await new Promise((r) => setTimeout(r, 150));
        return route.continue();
      }
      if (view === "/projects") {
        reads.push({ q, page });
        report.requests.push({
          viewport: viewport.width,
          method: "GET",
          view,
          q,
          page,
        });
        if (!q && page === "1" && !held) {
          held = true;
          await new Promise((r) => (releasePage = r));
        }
        if (!q && page === "2" && !page2Failed) {
          page2Failed = true;
          return route.fulfill({
            status: 503,
            json: { code: "BACKEND_UNAVAILABLE" },
          });
        }
        if (q === "Scroll" && holdSearch) {
          searchHeld = true;
          await new Promise((r) => (releaseSearch = r));
        }
      }
      try {
        return await route.continue();
      } catch (error) {
        if (!req.failure()) throw error;
      }
    });
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    page.on("pageerror", (e) => report.pageErrors.push(String(e)));
    const suffix = viewport.width === 1440 ? "desktop1440" : "mobile390";
    await go(page, "/projects");
    const cards = page.locator(".public-project-card");
    assert.equal(await cards.count(), 24);
    assert.equal(
      await page
        .getByRole("button", { name: /Previous page|Next page/ })
        .count(),
      0,
    );
    await shot(page, "projects-initial-" + suffix);
    await page.locator(".project-scroll-pagination").scrollIntoViewIfNeeded();
    await page.waitForFunction(() =>
      document.querySelector(".project-search-placeholder"),
    );
    assert.ok(held);
    await page.evaluate(() => {
      dispatchEvent(new Event("scroll"));
      dispatchEvent(new Event("resize"));
    });
    await page.waitForTimeout(100);
    assert.equal(reads.filter((r) => !r.q && r.page === "1").length, 1);
    await shot(page, "projects-loading-" + suffix);
    releasePage();
    await page.waitForFunction(
      () => document.querySelectorAll(".public-project-card").length === 48,
    );
    await page.locator(".project-scroll-pagination").scrollIntoViewIfNeeded();
    await page.locator(".project-scroll-pagination [role=alert]").waitFor();
    assert.equal(await cards.count(), 48);
    await shot(page, "projects-page-error-" + suffix);
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await page.waitForFunction(
      () => document.querySelectorAll(".public-project-card").length === 60,
    );
    const actual = await cards.evaluateAll((nodes) => nodes.map((e) => e.id));
    assert.equal(new Set(actual).size, 60);
    assert.deepEqual(actual, expected);
    assert.equal(
      await page.locator(".project-scroll-pagination button").count(),
      0,
    );
    await page.evaluate(() => dispatchEvent(new Event("scroll")));
    await page.waitForTimeout(300);
    assert.equal(reads.filter((r) => !r.q && r.page === "2").length, 2);
    assert.equal(reads.filter((r) => r.page === "3").length, 0);
    await shot(page, "projects-appended-" + suffix);
    const initialPageReads = reads.filter((r) => !r.q && r.page === "0").length;
    const candidate = page
      .locator(
        ".public-project-card .upvote-button[aria-pressed=false]:not(:disabled)",
      )
      .first();
    await candidate.scrollIntoViewIfNeeded();
    const cardId = await candidate
        .locator("xpath=ancestor::li")
        .getAttribute("id"),
      card = page.locator("#" + cardId),
      vote = card.locator(".upvote-button"),
      before = Number(await vote.innerText());
    await vote.evaluate((e) => {
      e.click();
      e.click();
    });
    await card.locator("[role=alert]").waitFor();
    assert.equal(voteCalls, 1);
    assert.equal(await vote.getAttribute("aria-pressed"), "false");
    assert.equal(Number(await vote.innerText()), before);
    assert.equal(await cards.count(), 60);
    assert.equal(await page.locator("dialog[open]").count(), 0);
    await shot(page, "upvote-error-" + suffix);
    await vote.evaluate((e) => {
      e.click();
      e.click();
    });
    await page.waitForFunction((id) => {
      const b = document.getElementById(id)?.querySelector(".upvote-button");
      return (
        b?.getAttribute("aria-pressed") === "true" &&
        b?.getAttribute("aria-busy") === "false"
      );
    }, cardId);
    assert.equal(voteCalls, 2);
    assert.equal(Number(await vote.innerText()), before + 1);
    assert.equal(await cards.count(), 60);
    assert.equal(await page.locator("dialog[open]").count(), 0);
    assert.equal(
      reads.filter((r) => !r.q && r.page === "0").length,
      initialPageReads,
      "No full showcase reload after vote",
    );
    await shot(page, "upvote-saved-" + suffix);
    const search = page.getByRole("searchbox", { name: "Search projects" });
    holdSearch = true;
    await search.fill("Scroll");
    await page.waitForTimeout(400);
    assert.ok(searchHeld);
    await search.fill("Scroll Project 05");
    await page.waitForFunction(
      () =>
        document.querySelectorAll(".public-project-card").length === 1 &&
        document.querySelector(".public-project-card h2")?.textContent ===
          "Scroll Project 05",
    );
    releaseSearch();
    await page.waitForTimeout(350);
    assert.equal(await cards.count(), 1);
    assert.match(await cards.first().innerText(), /Scroll Project 05/);
    await shot(page, "projects-filtered-" + suffix);
    await search.fill("");
    await page.waitForFunction(
      () => document.querySelectorAll(".public-project-card").length === 24,
    );
    const voted = page.locator("#" + cardId + " .upvote-button");
    assert.equal(
      await voted.getAttribute("aria-pressed"),
      "true",
      "Clearing filters reads the persisted vote",
    );
    await go(page, "/leaderboard");
    assert.equal(
      await page
        .getByRole("button", { name: "Next page", exact: true })
        .count(),
      1,
    );
    await page.getByRole("button", { name: "Next page", exact: true }).click();
    await page.waitForFunction(() =>
      document
        .querySelector(".project-pagination")
        ?.textContent.includes("Page 2"),
    );
    assert.equal(await cards.count(), 24);
    report.checks.push({
      viewport,
      passed: [
        "24→48→60 unique cards in exact server order",
        "one in-flight append despite repeated observer events",
        "failed page preserves48 and retries same page",
        "exhausted feed makes no page3 request",
        "upvote failure rollback, successful retry, duplicate-click prevention, no confirmation",
        "vote persists and expanded60 cards remain without full reload",
        "stale search cannot replace newer filter; clearing reads fresh persisted vote",
        "leaderboard page2 stays separate",
      ],
    });
    await context.close();
    contexts.splice(contexts.indexOf(context), 1);
    save();
  }
  const fallback = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: "reduce",
  });
  contexts.push(fallback);
  await fallback.addInitScript(() => {
    delete window.IntersectionObserver;
  });
  const p = await fallback.newPage();
  p.on("pageerror", (e) => report.pageErrors.push(String(e)));
  await go(p, "/projects");
  assert.equal(await p.locator(".public-project-card").count(), 24);
  const more = p.getByRole("button", { name: "Load more", exact: true });
  await more.focus();
  await p.keyboard.press("Enter");
  await p.waitForFunction(
    () => document.querySelectorAll(".public-project-card").length === 48,
  );
  report.checks.push("No IntersectionObserver: keyboard Load more works");
  await fallback.close();
  contexts.splice(contexts.indexOf(fallback), 1);
  const peopleContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    reducedMotion: "reduce",
  });
  contexts.push(peopleContext);
  await peopleContext.addCookies([
    {
      name: "portal_local_fixture",
      value: "alice",
      domain: new URL(origin).hostname,
      path: "/",
    },
  ]);
  const people = await peopleContext.newPage();
  people.on("pageerror", (e) => report.pageErrors.push(String(e)));
  await go(people, "/discover/participants");
  assert.equal(
    await people
      .locator(".discover-person-card:not(.discover-person-skeleton)")
      .count(),
    24,
  );
  await people.locator(".discover-pagination").scrollIntoViewIfNeeded();
  await people.waitForFunction(
    () =>
      document.querySelectorAll(
        ".discover-person-card:not(.discover-person-skeleton)",
      ).length >= 48,
  );
  const ids = await people
    .locator(".discover-person-card:not(.discover-person-skeleton)")
    .evaluateAll((nodes) => nodes.map((e) => e.id));
  assert.equal(new Set(ids).size, ids.length);
  report.checks.push(
    "Shared People pagination still appends unique cards on mobile",
  );
  await peopleContext.close();
  contexts.splice(contexts.indexOf(peopleContext), 1);
  assert.equal(report.pageErrors.length, 0);
  report.passed = true;
} catch (error) {
  report.failure = String(error.stack || error);
  process.exitCode = 1;
} finally {
  for (const c of contexts) await c.close();
  await browser.close();
  report.finishedAt = new Date().toISOString();
  save();
}
console.log(
  JSON.stringify({
    passed: report.passed || false,
    checks: report.checks.length,
    screenshots: report.screenshots.length,
    pageErrors: report.pageErrors,
    failure: report.failure || null,
  }),
);
