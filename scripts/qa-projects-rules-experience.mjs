import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve, join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Submission } from "../app/portal.tsx";

const origin = process.env.QA_ORIGIN || "http://localhost:3005";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
const output = resolve(process.env.QA_OUTPUT || "evidence/projects-rules-final");
mkdirSync(output, { recursive: true });
const source = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const report = { source, origin, syntheticOnly: true, physicalDevice: false, browserSandbox: false, developmentOverlayHidden: true, screenshots: [], checks: [], errors: [], writes: [], accessibility: [] };
const save = () => writeFileSync(join(output, "report.json"), JSON.stringify(report, null, 2));
const check = (name) => { report.checks.push({ name, passed: true }); save(); };
const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", headless: true, chromiumSandbox: false });
const viewports = [{ width: 1440, height: 900 }, { width: 768, height: 1024 }, { width: 390, height: 844 }, { width: 390, height: 480 }];
const controlsOnly = process.env.QA_CONTROLS_ONLY === "1";
async function screenshot(page, name, viewport, fullPage = false) {
  const path = join(output, name + "-" + viewport.width + "x" + viewport.height + (fullPage ? "-full" : "") + ".png");
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path, fullPage, animations: "disabled", style: "nextjs-portal { visibility: hidden !important; }" });
  report.screenshots.push({ name, path, viewport, fullPage, source });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, name + " horizontal overflow");
  save();
}
async function loaded(page, path) {
  const response = await page.goto(origin + path, { waitUntil: "domcontentloaded", timeout: 60000 });
  assert.equal(response.status(), 200);
  await page.waitForLoadState("networkidle");
}
try {
  for (const viewport of viewports) {
    const touch = viewport.width < 500;
    const context = await browser.newContext({ viewport, reducedMotion: "reduce", hasTouch: touch, isMobile: touch, serviceWorkers: "block" });
    await context.addCookies([{ name: "portal_local_fixture", value: "alice", url: origin, httpOnly: true, sameSite: "Strict" }]);
    await context.route("**/*", (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin !== origin || !["GET", "HEAD"].includes(request.method())) return route.abort("blockedbyclient");
      return route.continue();
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => report.errors.push({ viewport, error: error.message }));
    const activate = async (locator) => touch ? locator.tap() : (await locator.focus(), await locator.press("Enter"));
    const staticScreens = controlsOnly ? (viewport.width === 1440 ? [["project-detail", "/projects/synthetic-alice"]] : []) : [["rules", "/rules"], ["projects", "/projects"], ["project-detail", "/projects/synthetic-alice"], ["leaderboard", "/leaderboard"]];
    for (const [name, path] of staticScreens) {
      await loaded(page, path);
      await screenshot(page, name, viewport);
      await screenshot(page, name, viewport, true);
      if (name === "rules") {
        assert.equal(await page.locator(".rule-group").count(), 5);
        assert.equal(await page.locator(".rule-group h2").count(), 5);
        check(viewport.width + "x" + viewport.height + ": all five approved Rules groups are visible in document flow");
      }
      if (name === "project-detail" && viewport.width === 1440) {
        const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
        report.accessibility.push({ name, viewport, violations: result.violations }); save();
      }
    }
    await loaded(page, "/projects");
    await page.getByRole("searchbox", { name: "Search projects" }).fill("zz-no-matching-project-zz");
    await page.getByRole("heading", { name: "No matching projects" }).waitFor();
    await screenshot(page, "projects-no-matches", viewport);
    await activate(page.getByRole("button", { name: "Clear search" }));
    await page.locator(".project-list > li").first().waitFor();
    check(viewport.width + "x" + viewport.height + ": no-match state has a working Clear search action");
    await loaded(page, "/dashboard#project");
    await activate(page.getByRole("tab", { name: "Project", exact: true }));
    const versions = page.getByRole("button", { name: "Versions 2/3", exact: true });
    await activate(versions);
    await page.locator(".project-history-dialog[open] .history-version").first().waitFor();
    assert.equal(await page.locator(".project-history-dialog .history-version").count(), 2);
    await screenshot(page, "committed-history", viewport);
    await page.keyboard.press("Escape");
    await page.locator(".project-history-dialog").waitFor({ state: "detached" });
    await page.waitForTimeout(150);
    assert.equal(await versions.evaluate((node) => node === document.activeElement), true);
    await activate(versions);
    await page.locator(".project-history-dialog[open]").waitFor();
    await page.waitForTimeout(80);
    await page.goBack();
    await page.locator(".project-history-dialog").waitFor({ state: "detached" });
    assert.ok(page.url().includes("/dashboard"));
    check(viewport.width + "x" + viewport.height + ": committed history loads exactly two authorized versions; Escape/Back preserve route and opener");
    await activate(page.getByRole("button", { name: "Update project", exact: true }));
    await page.locator(".submission-v6").waitFor();
    await page.locator(".project-editor:not([inert])").waitFor();
    const projectName = page.locator('.project-editor [name="projectName"]');
    const originalName = await projectName.inputValue();
    await projectName.fill("");
    await activate(page.getByRole("button", { name: "Next", exact: true }));
    await page.locator("#submission-projectName-error").waitFor();
    assert.equal(await projectName.getAttribute("aria-invalid"), "true");
    assert.equal(await projectName.evaluate((node) => node === document.activeElement), true);
    await screenshot(page, "wizard-field-error", viewport);
    await projectName.fill(originalName);
    for (let step = 1; step <= 3; step++) {
      await screenshot(page, "wizard-step" + step, viewport);
      if (step < 3) await activate(page.getByRole("button", { name: "Next", exact: true }));
    }
    assert.equal(await page.locator('.submission-ecosystem-options input[type="checkbox"]').count(), 6);
    await page.getByRole("checkbox", { name: "I confirm this submission is accurate." }).check();
    await activate(page.getByRole("button", { name: "Submit", exact: true }));
    await page.locator(".confirmation-dialog[open]").waitFor();
    await screenshot(page, "submission-confirmation", viewport);
    await page.keyboard.press("Escape");
    await page.locator(".confirmation-dialog").waitFor({ state: "detached" });
    check(viewport.width + "x" + viewport.height + ": all three submission steps, field errors, six ecosystem choices and commit cancellation work without a write");
    if (viewport.height === 480) {
      const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
      report.accessibility.push({ name: "wizard-step3", viewport, violations: result.violations }); save();
    }
    await context.close();
  }
  // Real native browser behavior against HTML from the actual Submission component.
  const safeData = { me: { id: "fake_alice", name: "Alice", email: "alice@portal.test", role: "participant", owner: false, canParticipate: true }, team: { id: "fake_team1", leader_id: "fake_alice" }, submissionAccess: { canRead: true, canCommit: true }, project: { draft: { projectName: "SYNTHETIC_PRIVATE_DRAFT_SENTINEL", problemSolution: "SYNTHETIC_PRIVATE_SUMMARY", description: "SYNTHETIC_PRIVATE_DESCRIPTION" } } };
  const html = "<!doctype html><html><body>" + renderToStaticMarkup(createElement(Submission, { data: safeData, run: async () => ({}) })) + "</body></html>";
  const noJS = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 480 } });
  const native = await noJS.newPage();
  const nativeRequests = [];
  await noJS.route("**/*", (route) => {
    nativeRequests.push({ method: route.request().method(), url: route.request().url() });
    if (route.request().url() === origin + "/__qa-native-form") return route.fulfill({ status: 200, contentType: "text/html", body: html });
    return route.abort();
  });
  await native.goto(origin + "/__qa-native-form");
  assert.equal(await native.locator(".project-editor").getAttribute("method"), "post");
  assert.equal(await native.locator(".project-editor").getAttribute("inert"), "");
  assert.equal(await native.locator('.project-editor [name="projectName"]').isDisabled(), true);
  await native.getByRole("button", { name: "Next", exact: true }).click({ force: true, timeout: 1000 }).catch(() => {});
  await native.keyboard.press("Enter");
  assert.equal(nativeRequests.filter((item) => item.url.includes("SYNTHETIC_PRIVATE")).length, 0);
  assert.equal(nativeRequests.filter((item) => item.url !== origin + "/__qa-native-form").length, 0);
  check("JavaScript-disabled browser: actual server-rendered Submission cannot issue a native GET or submit private draft fields");
  await noJS.close();
  assert.equal(report.errors.length, 0);
  assert.equal(report.accessibility.flatMap((item) => item.violations).length, 0, "Automated accessibility findings remain; see report");
} catch (error) {
  report.failure = String(error.stack || error); process.exitCode = 1;
} finally {
  report.sourceAtEnd = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  await browser.close(); save();
}
console.log(JSON.stringify({ source, checks: report.checks.length, screenshots: report.screenshots.length, errors: report.errors, failure: report.failure, report: join(output, "report.json") }, null, 2));

