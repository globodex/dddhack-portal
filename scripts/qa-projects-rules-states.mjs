import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { chromium } from "@playwright/test";
const out = "evidence/projects-rules-states",
  origin = "http://localhost:3005";
mkdirSync(out, { recursive: true });
const report = {
  source: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  syntheticOnly: true,
  forcedResponses: true,
  checks: [],
  screenshots: [],
  geometry: [],
  errors: [],
  requests: [],
};
const save = () =>
  writeFileSync(out + "/report.json", JSON.stringify(report, null, 2));
const b = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  chromiumSandbox: false,
  headless: true,
});
try {
  for (const v of [
    { width: 1440, height: 900 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
    { width: 390, height: 480 },
  ]) {
    const c = await b.newContext({
      viewport: v,
      reducedMotion: "reduce",
      hasTouch: v.width < 500,
      isMobile: v.width < 500,
    });
    await c.addCookies([
      {
        name: "portal_local_fixture",
        value: "alice",
        url: origin,
        httpOnly: true,
        sameSite: "Strict",
      },
    ]);
    let releaseSearch, releaseHistory, searchStarted, historyStarted;
    const searchCaptured = new Promise((done) => (searchStarted = done)),
      historyCaptured = new Promise((done) => (historyStarted = done));
    let searchMode = "hold-fail",
      historyMode = "hold";
    let searchRequests = 0,
      historyRequests = 0;
    await c.route("**/*", async (r) => {
      const u = new URL(r.request().url());
      if (
        u.origin !== origin ||
        !["GET", "HEAD"].includes(r.request().method())
      )
        return r.abort();
      if (
        u.pathname === "/api/portal" &&
        u.searchParams.get("q") === "fixture-search-failure"
      ) {
        searchRequests++;
        if (searchMode === "hold-fail") {
          await new Promise((done) => {
            releaseSearch = done;
            searchStarted();
          });
          return r.fulfill({
            status: 502,
            json: { message: "Search is unavailable. Try again." },
          });
        }
      }
      if (
        u.pathname === "/api/portal" &&
        u.searchParams.get("view") === "/project-history"
      ) {
        historyRequests++;
        if (historyMode === "hold")
          await new Promise((done) => {
            releaseHistory = done;
            historyStarted();
          });
        if (historyMode === "error")
          return r.fulfill({
            status: 502,
            json: { message: "Committed history is unavailable. Try again." },
          });
        if (historyMode === "empty")
          return r.fulfill({ status: 200, json: { items: [] } });
      }
      return r.continue();
    });
    const p = await c.newPage();
    p.on("pageerror", (e) => report.errors.push(e.message));
    const activate = async (l) =>
      v.width < 500 ? l.tap() : (await l.focus(), await l.press("Enter"));
    const shot = async (name) => {
      const f = out + "/" + name + "-" + v.width + "x" + v.height + ".png";
      await p.screenshot({
        path: f,
        fullPage: false,
        style: "nextjs-portal{visibility:hidden!important}",
      });
      report.screenshots.push(f);
      save();
    };
    await p.goto(origin + "/projects", {
      waitUntil: "networkidle",
      timeout: 60000,
    });
    await p.locator('.projects-v6[data-hydrated="true"]').waitFor();
    await p
      .getByRole("searchbox", { name: "Search projects" })
      .fill("fixture-search-failure");
    await p.locator(".project-search-placeholder").first().waitFor();
    assert.equal(await p.locator(".project-search-placeholder").count(), 2);
    if (v.width < 500) {
      const row = p.locator(".project-search-placeholder").first(),
        logo = await row.locator(":scope > i").boundingBox(),
        text = await row.locator(":scope > div").boundingBox(),
        action = await row.locator(":scope > b").first().boundingBox();
      assert.ok(
        Math.abs(logo.y - text.y) <= 1,
        "mobile placeholder logo stays beside text",
      );
      assert.ok(
        text.x > logo.x + logo.width,
        "mobile placeholder text uses second column",
      );
      assert.ok(
        action.y >= text.y + text.height,
        "mobile placeholder actions sit below text",
      );
    }
    await shot("project-search-loading");
    await searchCaptured;
    releaseSearch();
    await p
      .getByRole("button", { name: "Retry search", exact: true })
      .waitFor();
    await shot("project-search-error");
    searchMode = "server";
    await activate(
      p.getByRole("button", { name: "Retry search", exact: true }),
    );
    await p.getByRole("heading", { name: "No matching projects" }).waitFor();
    assert.equal(
      searchRequests,
      2,
      "one original search request plus explicit retry",
    );
    await activate(
      p.getByRole("button", { name: "Clear search", exact: true }),
    );
    await p.locator(".project-list > li").first().waitFor();
    report.checks.push({
      viewport: v,
      name: "Search shows two matching row skeletons; failure stays visible and explicit Retry succeeds without background extra requests",
      passed: true,
    });
    save();
    await p.goto(origin + "/dashboard#project", { waitUntil: "networkidle" });
    await activate(p.getByRole("tab", { name: "Project", exact: true }));
    const opener = p.getByRole("button", { name: "Versions 2/3", exact: true });
    const main = await p.locator("#main").boundingBox();
    await activate(opener);
    await p.locator(".history-loading").waitFor();
    const loading = await p.locator(".project-history-dialog").boundingBox();
    await shot("history-loading");
    await historyCaptured;
    releaseHistory();
    await p.locator(".history-version").first().waitFor();
    const loaded = await p.locator(".project-history-dialog").boundingBox(),
      mainAfter = await p.locator("#main").boundingBox();
    assert.ok(Math.abs(loaded.height - loading.height) <= 1);
    assert.ok(Math.abs(loaded.y - loading.y) <= 1);
    assert.ok(Math.abs(main.x - mainAfter.x) <= 1);
    assert.ok(Math.abs(main.width - mainAfter.width) <= 1);
    assert.equal(historyRequests, 1);
    report.geometry.push({
      viewport: v,
      loading,
      loaded,
      deltaHeight: loaded.height - loading.height,
      deltaY: loaded.y - loading.y,
    });
    await shot("history-loaded");
    await activate(
      p.getByRole("button", { name: "Close committed history", exact: true }),
    );
    await p.locator(".project-history-dialog").waitFor({ state: "detached" });
    await p.waitForTimeout(150);
    historyMode = "error";
    await activate(opener);
    await p.locator(".history-error").waitFor();
    await shot("history-error");
    await activate(
      p.getByRole("button", { name: "Close committed history", exact: true }),
    );
    await p.locator(".project-history-dialog").waitFor({ state: "detached" });
    await p.waitForTimeout(150);
    historyMode = "empty";
    await activate(opener);
    await p.locator(".history-empty").waitFor();
    await shot("history-empty");
    await activate(
      p.getByRole("button", { name: "Close committed history", exact: true }),
    );
    await p.locator(".project-history-dialog").waitFor({ state: "detached" });
    report.checks.push({
      viewport: v,
      name: "Committed-history loading/loaded geometry stays fixed, failed and empty states remain readable, and Close works in each state",
      passed: true,
    });
    report.requests.push({ viewport: v, searchRequests, historyRequests });
    await c.close();
    save();
  }
  assert.equal(report.errors.length, 0);
} catch (error) {
  report.failure = String(error.stack || error);
  process.exitCode = 1;
} finally {
  await b.close();
  save();
}
console.log(JSON.stringify(report, null, 2));
