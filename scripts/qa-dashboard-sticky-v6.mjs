// Targeted regression for the tablet header opacity defect. Synthetic reads only.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { chromium } from "/tmp/ddehack-playwright-runner/node_modules/playwright/index.mjs";
const origin = "http://127.0.0.1:4173",
  artifact =
    "/home/param302/Dev/DDEHack-portal/.worktrees/visual-integration/dist/server/index.js";
const source = process.env.DASHBOARD_QA_SOURCE,
  worker = process.env.DASHBOARD_QA_WORKER;
if (
  process.env.DASHBOARD_QA_READY !== "1" ||
  !/^[a-f0-9]{40}$/.test(source || "") ||
  !/^[a-f0-9]{64}$/.test(worker || "")
) {
  console.log(
    "Prepared only; exact matching preview readiness/source/Worker required.",
  );
  process.exit(0);
}
const hash = () =>
  createHash("sha256").update(readFileSync(artifact)).digest("hex");
assert.equal(hash(), worker);
const output =
  process.env.DASHBOARD_QA_OUTPUT || "evidence/dashboard-sticky-v6";
mkdirSync(output, { recursive: true });
const report = {
  source,
  worker,
  syntheticOnly: true,
  sandbox: true,
  checks: [],
  blocked: [],
  pageErrors: [],
};
const browser = await chromium.launch({
  headless: true,
  chromiumSandbox: true,
});
try {
  for (const viewport of [
    { width: 834, height: 1194 },
    { width: 1194, height: 834 },
    { width: 390, height: 844 },
  ]) {
    const context = await browser.newContext({
      viewport,
      serviceWorkers: "block",
    });
    try {
      await context.route("**/*", async (route) => {
        const request = route.request();
        if (
          new URL(request.url()).origin !== origin ||
          !["GET", "HEAD"].includes(request.method())
        ) {
          report.blocked.push({ method: request.method() });
          return route.abort("blockedbyclient");
        }
        return route.continue({
          headers: {
            ...request.headers(),
            "oai-authenticated-user-id": "fake_alice",
            "oai-authenticated-user-email": "alice@portal.test",
          },
        });
      });
      const page = await context.newPage();
      page.on("pageerror", (error) => report.pageErrors.push(error.message));
      await page.goto(origin + "/dashboard#project", {
        waitUntil: "networkidle",
      });
      await page
        .getByRole("tabpanel", { name: "Project", exact: true })
        .waitFor();
      await page.evaluate(() => document.fonts.ready);
      await page.evaluate(async () => {
        scrollTo(0, 300);
        await new Promise(requestAnimationFrame);
      });
      const geometry = await page
        .locator(".mobile-header")
        .evaluate((e) => ({
          scroll: scrollY,
          top: e.getBoundingClientRect().top,
          background: getComputedStyle(e).backgroundColor,
          position: getComputedStyle(e).position,
          overflow: document.documentElement.scrollWidth > innerWidth,
        }));
      const path = `${output}/dashboard-sticky-scroll-${viewport.width}x${viewport.height}.png`;
      await page.screenshot({ path, fullPage: false, animations: "disabled" });
      let failure;
      try {
        assert.ok(geometry.scroll > 0);
        assert.equal(geometry.top, 0);
        assert.equal(geometry.position, "sticky");
        assert.equal(geometry.background, "rgb(255, 255, 255)");
        assert.equal(geometry.overflow, false);
      } catch (error) {
        failure = error.message;
      }
      report.checks.push({
        viewport,
        geometry,
        path,
        original: true,
        passed: !failure,
        ...(failure ? { failure } : {}),
      });
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
  report.browserClosed = true;
  report.workerAfter = hash();
  report.artifactUnchanged = report.workerAfter === worker;
  writeFileSync(output + "/report.json", JSON.stringify(report, null, 2));
}
console.log(JSON.stringify(report));
if (
  report.checks.some((x) => !x.passed) ||
  report.blocked.length ||
  report.pageErrors.length ||
  !report.artifactUnchanged
)
  process.exitCode = 1;
