// Read-only browser waterfall: no request routing, so warm HTTP cache remains observable.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright-core";
if (!process.argv.includes("--preview-ready")) throw new Error("Integration owner must confirm frozen preview with --preview-ready.");
const manifest = JSON.parse(readFileSync(process.env.PERF_MANIFEST, "utf8"));
assert.equal(manifest.disposable, true); assert.equal(manifest.syntheticOnly, true);
const origin = manifest.origin;
assert.equal(new URL(origin).hostname, "127.0.0.1");
const root = manifest.artifactRoot;
const workerFile = resolve(root, "dist/server/index.js");
const fingerprint = () => createHash("sha256").update(readFileSync(workerFile)).digest("hex");
assert.equal(fingerprint(), manifest.worker);
const output = resolve("evidence/v7-waterfall", `${manifest.source.slice(0, 8)}-${new Date().toISOString().replaceAll(":", "-")}`);
mkdirSync(output, { recursive: true });
const report = { source: manifest.source, worker: manifest.worker, runnerSha256: createHash("sha256").update(readFileSync(new URL(import.meta.url))).digest("hex"), origin, chromiumSandbox: true, methods: ["GET", "HEAD"], samples: [], errors: [], limitations: ["Local compiled Worker/disposable synthetic D1, unthrottled localhost. Browser-cold does not mean cold server isolate. Other local lanes can cause CPU contention.", "No Playwright request routing: real HTTP cache retained. Synthetic headers use fixture actors only. DNS resolution denies external hosts; no writes or production requests are performed.", "Last observed LCP is a diagnostic candidate before fixed observation ends, not a finalized field Web Vital. One cold/warm sample per route is exploratory, not a statistical benchmark.", "Browser can count document/API requests, not internal service projections. Internal repetition must be attributed from exact source lines."] };
const save = () => writeFileSync(`${output}/report.json`, JSON.stringify(report, null, 2) + "\n");
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium", headless: true, chromiumSandbox: true, args: ["--host-resolver-rules=MAP * ~NOTFOUND,EXCLUDE 127.0.0.1"] });
  for (const scenario of [
    { name: "home-desktop", route: "/", actor: null, width: 1440 },
    { name: "dashboard-participant", route: "/dashboard", actor: { id: "fake_alice", email: "alice@portal.test" }, width: 1440 },
    { name: "profile-participant", route: "/profile", actor: { id: "fake_alice", email: "alice@portal.test" }, width: 1440 },
    { name: "participants-admin", route: "/admin/participants", actor: { id: "fake_admin", email: "admin@portal.test" }, width: 1440 },
    { name: "home-touch", route: "/", actor: null, width: 390 },
  ].filter((scenario) => !process.env.PERF_SCENARIOS || process.env.PERF_SCENARIOS.split(",").includes(scenario.name))) {
    const context = await browser.newContext({ viewport: { width: scenario.width, height: scenario.width === 390 ? 844 : 900 }, serviceWorkers: "block", ...(scenario.width === 390 ? { isMobile: true, hasTouch: true } : {}), ...(scenario.actor ? { extraHTTPHeaders: { "oai-authenticated-user-id": scenario.actor.id, "oai-authenticated-user-email": scenario.actor.email, "oai-authenticated-user-full-name": "Synthetic Actor" } } : {}) });
    await context.addInitScript(() => {
      performance.setResourceTimingBufferSize(3000);
      window.__perfLCP = [];
      new PerformanceObserver((list) => { for (const entry of list.getEntries()) window.__perfLCP.push({ startTime: entry.startTime, renderTime: entry.renderTime, loadTime: entry.loadTime, size: entry.size, url: entry.url || null, tag: entry.element?.tagName || null }); }).observe({ type: "largest-contentful-paint", buffered: true });
    });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.setCacheDisabled", { cacheDisabled: false });
    const records = [];
    const byId = new Map();
    let phase = "cold";
    cdp.on("Network.requestWillBeSent", (event) => {
      if (!["http:", "https:"].includes(new URL(event.request.url).protocol)) return;
      const row = { requestId: event.requestId, phase, url: event.request.url, method: event.request.method, type: event.type, at: event.timestamp, status: null, encodedBytes: null, fromDiskCache: false, fromMemoryCache: false };
      records.push(row); byId.set(event.requestId, row);
      if (!row.url.startsWith(origin) || !["GET", "HEAD"].includes(row.method)) report.errors.push(`Unexpected request ${row.method} ${row.url}`);
    });
    cdp.on("Network.requestServedFromCache", (event) => { const row = byId.get(event.requestId); if (row) row.fromMemoryCache = true; });
    cdp.on("Network.responseReceived", (event) => { const row = byId.get(event.requestId); if (row) Object.assign(row, { status: event.response.status, responseAt: event.timestamp, responseTiming: event.response.timing, fromDiskCache: !!event.response.fromDiskCache, cacheControl: event.response.headers["cache-control"] || event.response.headers["Cache-Control"] || null, mime: event.response.mimeType }); });
    cdp.on("Network.loadingFinished", (event) => { const row = byId.get(event.requestId); if (row) Object.assign(row, { encodedBytes: event.encodedDataLength, durationMs: (event.timestamp - row.at) * 1000 }); });
    cdp.on("Network.loadingFailed", (event) => { const row = byId.get(event.requestId); if (row) row.failure = event.errorText; });
    const observe = async (label, action, heading) => {
      phase = label;
      const first = records.length;
      const start = performance.now();
      const response = await action();
      if (response) assert.equal(response.status(), 200);
      if (heading) await page.getByRole("heading", { name: heading, exact: true }).waitFor({ timeout: 15000 });
      else await page.locator("#main h1").first().waitFor({ timeout: 15000 });
      const elapsedToContentReadyMs = performance.now() - start;
      await page.waitForLoadState("networkidle", { timeout: 15000 });
      await page.waitForTimeout(350);
      const timing = await page.evaluate(() => ({ timeOrigin: performance.timeOrigin, now: performance.now(), navigation: performance.getEntriesByType("navigation").map((entry) => entry.toJSON()), paint: performance.getEntriesByType("paint").map((entry) => entry.toJSON()), lcp: window.__perfLCP || [], resources: performance.getEntriesByType("resource").map((entry) => entry.toJSON()), scripts: [...document.scripts].filter((script) => script.src).map((script) => script.src), heading: document.querySelector("#main h1")?.textContent, horizontalOverflow: document.documentElement.scrollWidth > innerWidth }));
      const requests = records.slice(first).map((row) => ({ ...row, at: (row.at - records[first].at) * 1000, responseAt: row.responseAt ? (row.responseAt - records[first].at) * 1000 : null }));
      const nav = timing.navigation[0];
      const hasDocument = requests.some((row) => row.type === "Document");
      const grouped = {};
      for (const row of requests) { const group = grouped[row.type] ||= { requests: 0, bytes: 0, cached: 0 }; group.requests++; group.bytes += row.encodedBytes || 0; if (row.fromDiskCache || row.fromMemoryCache) group.cached++; }
      const api = requests.filter((row) => new URL(row.url).pathname === "/api/portal");
      report.samples.push({ scenario: scenario.name, phase: label, route: new URL(page.url()).pathname, fixture: scenario.actor?.id || "anonymous", viewport: scenario.width, elapsedToObservedMs: performance.now() - start, elapsedToContentReadyMs, summary: { documentTTFBMs: hasDocument ? nav?.responseStart - nav?.requestStart : null, documentToResponseEndMs: hasDocument ? nav?.responseEnd : null, DOMContentLoadedMs: hasDocument ? nav?.domContentLoadedEventEnd : null, loadMs: hasDocument ? nav?.loadEventEnd : null, lastObservedLCPMs: hasDocument ? timing.lcp.at(-1)?.startTime || null : null, observedLCPElement: hasDocument ? timing.lcp.at(-1)?.tag || null : null, encodedBytes: requests.reduce((sum, row) => sum + (row.encodedBytes || 0), 0), requestCount: requests.length, documentRequests: requests.filter((row) => row.type === "Document").length, apiCalls: api.length, duplicateApiCalls: api.filter((row, index) => api.findIndex((other) => other.url === row.url) !== index).length, byType: grouped }, timing, requests });
      save();
    };
    await observe("cold", () => page.goto(origin + scenario.route, { waitUntil: "domcontentloaded" }));
    await observe("warm-reload", () => page.reload({ waitUntil: "domcontentloaded" }));
    if (scenario.name === "dashboard-participant") {
      for (const [target, name] of [["/discover/teams", "Discover"], ["/rules", "Rules"], ["/dashboard", "Dashboard"]]) {
        await observe(`sidebar-${name.toLowerCase()}`, async () => {
          await Promise.all([page.waitForURL(origin + target, { waitUntil: "domcontentloaded" }), page.locator(`aside.sidebar a[href="${target}"]`).click()]);
        }, name);
      }
      await observe("focus-visibility-burst", async () => { await page.evaluate(() => { for (let i = 0; i < 3; i++) { window.dispatchEvent(new Event("focus")); document.dispatchEvent(new Event("visibilitychange")); } }); });
      await page.waitForTimeout(2100);
      await observe("expired-focus-visibility-burst", async () => { await page.evaluate(() => { for (let i = 0; i < 3; i++) { window.dispatchEvent(new Event("focus")); document.dispatchEvent(new Event("visibilitychange")); } }); });
      await observe("history-back", () => page.goBack({ waitUntil: "domcontentloaded" }), "Rules");
      await observe("history-forward", () => page.goForward({ waitUntil: "domcontentloaded" }), "Dashboard");
      const previousURL = page.url();
      const [popup] = await Promise.all([context.waitForEvent("page"), page.locator('aside.sidebar a[href="/discover/teams"]').click({ modifiers: ["Control"] })]);
      await popup.waitForURL((url) => url.origin === origin, { waitUntil: "domcontentloaded" });
      const initialPopupPath = new URL(popup.url()).pathname;
      if (initialPopupPath === "/signin-with-chatgpt") {
        report.fixtureNotes ||= [];
        report.fixtureNotes.push("Modified-click popup request preceded Playwright context synthetic headers and correctly required sign-in; replayed expected href after explicitly attaching the same fixture headers. Real managed cookie/session completion remains untested.");
        await popup.setExtraHTTPHeaders({ "oai-authenticated-user-id": scenario.actor.id, "oai-authenticated-user-email": scenario.actor.email, "oai-authenticated-user-full-name": "Synthetic Actor" });
        await popup.goto(origin + "/discover/teams", { waitUntil: "domcontentloaded" });
      }
      await popup.getByRole("heading", { name: "Discover", exact: true }).waitFor();
      assert.equal(new URL(popup.url()).pathname, "/discover/teams");
      assert.equal(page.url(), previousURL);
      report.navigationChecks ||= [];
      report.navigationChecks.push({ scenario: scenario.name, check: "modified-click preserves href/new-tab and original page", passed: true });
      await popup.close();
      const denied = await context.newPage();
      const deniedResponse = await denied.goto(origin + "/admin/participants", { waitUntil: "domcontentloaded" });
      assert.equal(deniedResponse.status(), 403);
      assert.equal(await denied.locator(".participants-table").count(), 0);
      report.navigationChecks.push({ scenario: scenario.name, check: "participant admin navigation denied403 without stale admin body", passed: true });
      await denied.close();
      save();
    }
    await context.close();
  }
  assert.equal(fingerprint(), manifest.worker, "Preview artifact changed during baseline observations");
} catch (error) { report.errors.push(String(error?.stack || error)); process.exitCode = 1; }
finally { await browser?.close(); report.browserClosed = true; report.finishedAt = new Date().toISOString(); save(); console.log(JSON.stringify({ report: `${output}/report.json`, samples: report.samples.map(({ scenario, phase, summary }) => ({ scenario, phase, ...summary })), errors: report.errors }, null, 2)); }
