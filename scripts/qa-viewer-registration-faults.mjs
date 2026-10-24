import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
const origin = "http://localhost:3008",
  out = "evidence/viewer-registration/after",
  trace = () =>
    existsSync(out + "/backend-fault-trace.jsonl")
      ? readFileSync(out + "/backend-fault-trace.jsonl", "utf8")
          .trim()
          .split("\n")
          .filter(Boolean)
          .map(JSON.parse)
      : [];
const report = {
  source: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  syntheticOnly: true,
  method:
    "Controlled localhost backend8855 HTTP503 passthrough wrapper; real app SSR. Network one browser GET aborted, session401 actual no fixture cookie. No source/guard changes.",
  checks: [],
  pageErrors: [],
};
const b = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  headless: true,
  chromiumSandbox: false,
});
async function ctx(actor = "stranger") {
  const c = await b.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    reducedMotion: "reduce",
  });
  if (actor)
    await c.addCookies([
      { name: "portal_local_fixture", value: actor, url: origin },
    ]);
  await c.route("**/*", (r) =>
    new URL(r.request().url()).origin !== origin ||
    !["GET", "HEAD"].includes(r.request().method())
      ? r.abort("blockedbyclient")
      : r.continue(),
  );
  return c;
}
async function shot(p, name) {
  await p.evaluate(() => document.fonts.ready);
  const file = `${out}/${name}.png`;
  await p.screenshot({ path: file, fullPage: true, animations: "disabled" });
  return file;
}
try {
  const c = await ctx();
  await c.addCookies([
    { name: "qa_viewer_fault", value: "server", url: origin },
  ]);
  const p = await c.newPage();
  let apis = [];
  p.on("request", (q) => {
    if (q.url().includes("/api/portal"))
      apis.push({ url: q.url(), method: q.method() });
  });
  p.on("pageerror", (e) => report.pageErrors.push(e.message));
  const before = trace().length;
  await p.goto(origin + "/dashboard", {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });
  await p
    .getByRole("heading", { name: "This page could not load", exact: true })
    .waitFor();
  await p.waitForFunction(
    () =>
      document.querySelector(".app-shell")?.getAttribute("data-hydrated") ===
      "true",
  );
  await p.waitForTimeout(500);
  assert.equal(await p.locator(".page-error-card").count(), 1);
  assert.equal(await p.locator(".route-skeleton,.viewer-welcome").count(), 0);
  assert.equal(apis.length, 0);
  const server = trace().slice(before);
  assert.equal(server.length, 1);
  assert.equal(server[0].status, 503);
  report.checks.push({
    name: "Actual SSR503 renders one error, no simultaneous skeleton/Viewer, no automatic browser retry",
    trace: server,
    file: await shot(p, "server-503-error-390"),
  });
  await c.clearCookies({ name: "qa_viewer_fault" });
  let release, started;
  const gate = new Promise((r) => (release = r)),
    start = new Promise((r) => (started = r));
  await p.route("**/api/portal?*", async (r) => {
    started();
    await gate;
    return r.continue();
  });
  const retryResponse = p.waitForResponse((r) =>
    r.url().includes("/api/portal"),
  );
  await p.getByRole("button", { name: "Try again", exact: true }).tap();
  await start;
  assert.equal(
    await p
      .getByRole("button", { name: "Trying again…", exact: true })
      .isDisabled(),
    true,
  );
  assert.equal(await p.locator(".route-skeleton").count(), 0);
  const busyFile = await shot(p, "server-503-retry-busy-390");
  release();
  const retry = await retryResponse;
  assert.equal(retry.status(), 200);
  await p.locator(".viewer-welcome").waitFor({ state: "visible" });
  assert.equal(await p.locator(".page-error-card").count(), 0);
  report.checks.push({
    name: "One deliberate retry stays busy/disabled then actual200Viewer recovery",
    requests: apis,
    status: retry.status(),
    busyFile,
    file: await shot(p, "server-503-recovered-viewer-390"),
  });
  await c.close();
  const network = await ctx();
  const n = await network.newPage();
  let failed = [];
  n.on("requestfailed", (q) =>
    failed.push({ url: q.url(), error: q.failure()?.errorText }),
  );
  await n.goto(origin + "/dashboard", {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });
  await n.locator(".viewer-welcome").waitFor();
  await n.waitForFunction(
    () =>
      document.querySelector(".app-shell")?.getAttribute("data-hydrated") ===
      "true",
  );
  await n.waitForTimeout(2100);
  let once = true;
  await n.route("**/api/portal?*", (r) => {
    if (once) {
      once = false;
      return r.abort("failed");
    }
    return r.continue();
  });
  await n.evaluate(() => window.dispatchEvent(new Event("focus")));
  await n
    .getByRole("heading", { name: "This page could not load", exact: true })
    .waitFor();
  assert.match(
    await n.locator(".page-error-card").innerText(),
    /Unable to reach the portal/,
  );
  assert.equal(await n.locator(".route-skeleton,.viewer-welcome").count(), 0);
  assert.deepEqual(
    await n
      .locator(".sidebar nav a")
      .evaluateAll((es) => es.map((e) => e.getAttribute("href"))),
    ["/discover/teams", "/projects", "/rules"],
  );
  report.checks.push({
    name: "Real failed browser fetch shows connection error, retains known Viewer nav, hides normal data, no registration classification",
    failed,
    file: await shot(n, "network-error-known-viewer-390"),
  });
  await n.getByRole("button", { name: "Open menu", exact: true }).tap();
  await n
    .getByRole("dialog", { name: "Navigation", exact: true })
    .getByRole("link", { name: "Projects", exact: true })
    .tap();
  await n.waitForURL("**/projects");
  await n.getByRole("heading", { name: "Projects", exact: true }).waitFor();
  assert.equal(await n.locator(".page-error-card").count(), 0);
  report.checks.push({
    name: "Actual existing menu navigation after a fault clears stale error on Projects",
    file: await shot(n, "network-error-route-cleared-projects-390"),
  });
  await network.close();
  const anonymous = await ctx(null);
  const a = await anonymous.newPage();
  let authAPIs = [];
  a.on("request", (q) => {
    if (q.url().includes("/api/portal")) authAPIs.push(q.url());
  });
  const authBefore = trace().length;
  await a.goto(origin + "/dashboard", {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });
  await a
    .getByRole("heading", { name: "Sign in to continue", exact: true })
    .waitFor();
  await a.waitForFunction(
    () =>
      document.querySelector(".app-shell")?.getAttribute("data-hydrated") ===
      "true",
  );
  await a.waitForTimeout(500);
  assert.equal(await a.locator(".viewer-welcome,.route-skeleton").count(), 0);
  assert.equal(await a.locator(".page-error-card p").count(), 0);
  assert.equal(
    await a
      .locator(".page-error-card")
      .getByRole("link", { name: "Sign in", exact: true })
      .count(),
    1,
  );
  assert.equal(authAPIs.length, 0);
  const authTrace = trace().slice(authBefore);
  assert.equal(authTrace.length, 1);
  assert.equal(authTrace[0].status, 401);
  report.checks.push({
    name: "Actual backend401 no session is sign-in state, no repeated copy, no Viewer/no retry loop",
    trace: authTrace,
    file: await shot(a, "session-401-sign-in-390"),
  });
  await anonymous.close();
  assert.equal(report.pageErrors.length, 0);
  report.result = "PASS";
} catch (e) {
  report.result = "FAIL";
  report.failure = { message: e.message, stack: e.stack };
  throw e;
} finally {
  await b.close();
  report.browserClosed = true;
  writeFileSync(out + "/fault-report.json", JSON.stringify(report, null, 2));
}
