// GET-only controlled loading/error/retry QA, not a latency benchmark.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "@playwright/test";
assert.ok(process.env.CONTROL_MANIFEST, "Fresh disposable preview manifest required");
const manifest = JSON.parse(readFileSync(process.env.CONTROL_MANIFEST, "utf8"));
assert.equal(manifest.disposable, true);
assert.equal(manifest.syntheticOnly, true);
assert.equal(manifest.rootConfirmedReset, true);
assert.equal(manifest.origin, "http://127.0.0.1:4178");
const artifact = resolve(manifest.artifactRoot);
assert.equal(execFileSync("git", ["rev-parse", "HEAD"], { cwd: artifact, encoding: "utf8" }).trim(), manifest.source);
const hash = () => createHash("sha256").update(readFileSync(join(artifact, "dist/server/index.js"))).digest("hex");
assert.equal(hash(), manifest.worker);
const root = resolve("evidence/v7-route-skeleton");
mkdirSync(root, { recursive: true });
const output = mkdtempSync(join(root, manifest.source.slice(0, 7) + "-"));
const report = { source: manifest.source, workerSha: manifest.worker, syntheticOnly: true,
  chromiumSandbox: true, controlledNetworkGates: true, performanceBenchmark: false,
  cases: [], screenshots: [], errors: [], blocked: [], browserClosed: false };
const persist = () => writeFileSync(join(output, "report.json"), JSON.stringify(report, null, 2));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium", headless: true, chromiumSandbox: true });
report.browser = browser.version();
try {
  for (const [label, path, viewport, motion] of [
    ["desktop-dashboard", "/dashboard", { width: 1440, height: 900 }, "no-preference"],
    ["touch-people", "/discover/participants", { width: 390, height: 844 }, "reduce"],
    ["desktop-profile", "/profile", { width: 1440, height: 900 }, "reduce"],
  ]) {
    const context = await browser.newContext({ viewport, reducedMotion: motion, hasTouch: label.startsWith("touch"), serviceWorkers: "block" });
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    let reads = 0;
    await context.route("**/*", async (route) => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== manifest.origin || !["GET", "HEAD"].includes(request.method())) {
        report.blocked.push({ method: request.method(), path: url.pathname });
        return route.abort("blockedbyclient");
      }
      if (url.pathname === "/api/portal" && url.searchParams.get("view") === path) {
        reads++;
        if (reads === 1) {
          await gate;
          return route.fulfill({ status: 503, contentType: "application/json", headers: { "Cache-Control": "private, no-store" }, body: JSON.stringify({ message: "Synthetic loading failure" }) });
        }
      }
      return route.continue({ headers: { ...request.headers(), "oai-authenticated-user-id": "fake_alice", "oai-authenticated-user-email": "alice@portal.test" } });
    });
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    page.on("pageerror", (error) => report.errors.push({ label, error: error.message }));
    try {
      await page.goto(manifest.origin + path, { waitUntil: "domcontentloaded" });
      const skeleton = page.locator(".route-skeleton");
      await skeleton.waitFor();
      assert.equal(await skeleton.getAttribute("aria-busy"), "true");
      assert.equal(await skeleton.getByRole("status").count(), 1);
      assert.equal(await skeleton.locator("button,input,a").count(), 0);
      const shell = page.locator(viewport.width < 1200 || path === "/profile" ? ".mobile-header" : ".sidebar");
      assert.equal(await shell.isVisible(), true);
      const animation = await page.locator(".route-skeleton-shapes").evaluate((node) => getComputedStyle(node).animationName);
      assert.equal(animation, motion === "reduce" ? "none" : "route-skeleton-pulse");
      const sizes = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
      assert.ok(sizes.scroll <= sizes.width);
      const screenshot = join(output, `${label}-loading-${viewport.width}x${viewport.height}.png`);
      await page.screenshot({ path: screenshot, fullPage: true, animations: "disabled" });
      report.screenshots.push({ path: screenshot, route: path, viewport, source: manifest.source, workerSha: manifest.worker, inspected: false });
      assert.equal(reads, 1, "Skeleton must not initiate more data requests");
      release();
      await page.getByRole("alert").filter({ hasText: "Synthetic loading failure" }).waitFor();
      assert.equal(await skeleton.count(), 0, "Failed request must remove placeholders");
      await page.getByRole("button", { name: "Try again", exact: true }).click();
      await page.waitForFunction(() => !document.querySelector(".error-message") && !document.querySelector(".route-skeleton") && document.querySelector("#main h1"));
      assert.equal(reads, 2, "Retry performs one explicit fresh data read");
      assert.equal(await skeleton.count(), 0, "Loaded content must not be obscured");
      report.cases.push({ label, route: path, viewport, reducedMotion: motion, passed: true, checks: 9, reads,
        assertions: ["busy status", "decorative controls", "shell visible", "motion preference", "no horizontal overflow", "no extra request", "error removes skeleton", "retry loads content", "no loaded-content overlay"] });
      persist();
    } finally { release(); await context.close(); }
  }
  assert.equal(report.errors.length, 0, JSON.stringify(report.errors));
  assert.equal(report.blocked.length, 0, JSON.stringify(report.blocked));
} catch (error) { report.failure = error.stack; process.exitCode = 1; }
finally { await browser.close(); report.browserClosed = true; assert.equal(hash(), manifest.worker); persist(); }
console.log(JSON.stringify({ report: join(output, "report.json"), cases: report.cases.length, checks: report.cases.reduce((sum, item) => sum + item.checks, 0), screenshots: report.screenshots.length, failure: report.failure, browserClosed: report.browserClosed }, null, 2));
