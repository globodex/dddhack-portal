import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { writeFileSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
const origin = "http://localhost:3008",
  out = "evidence/viewer-registration/after";
const report = {
  source: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  syntheticOnly: true,
  checks: [],
  requests: [],
  responses: [],
  pageErrors: [],
};
const prior = JSON.parse(
  readFileSync(out + "/admin-bridge-preview-failure.json", "utf8"),
);
report.checks.push(...prior.checks);
report.priorCheckSource = prior.source;
report.harnessCorrection =
  "Prior5successful list checks retained. Preview failed in QA fault bridge502 (no commit request); frontend returned to direct8853. Confirmation is actual Add participants? modal, not base contract Import participants.";
const b = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  headless: true,
  chromiumSandbox: false,
});
async function context(actor, viewport = { width: 1440, height: 900 }) {
  const c = await b.newContext({
    viewport,
    reducedMotion: "reduce",
    ...(viewport.width < 500 ? { isMobile: true, hasTouch: true } : {}),
  });
  await c.addCookies([
    { name: "portal_local_fixture", value: actor, url: origin },
  ]);
  await c.route("**/*", (r) => {
    const q = r.request();
    if (new URL(q.url()).origin !== origin) return r.abort("blockedbyclient");
    if (!["GET", "HEAD"].includes(q.method())) {
      let a;
      try {
        a = q.postDataJSON()?.action;
      } catch {}
      if (!["preview-import", "commit-import"].includes(a))
        return r.abort("blockedbyclient");
    }
    return r.continue();
  });
  return c;
}
async function shot(p, name) {
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({
    path: `${out}/${name}.png`,
    fullPage: true,
    animations: "disabled",
  });
  return `${out}/${name}.png`;
}
try {
  const c = await context("owner");
  const p = await c.newPage();
  p.on("request", (q) =>
    report.requests.push({
      method: q.method(),
      url: q.url(),
      body: q.method() === "POST" ? q.postDataJSON() : null,
    }),
  );
  p.on("response", async (r) => {
    let body;
    try {
      if (r.url().includes("/api/portal")) body = await r.json();
    } catch {}
    report.responses.push({ url: r.url(), status: r.status(), body });
  });
  p.on("pageerror", (e) => report.pageErrors.push(e.message));
  await p.goto(origin + "/admin/participants", {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });
  await p.waitForFunction(
    () =>
      document.querySelector(".app-shell")?.getAttribute("data-hydrated") ===
      "true",
  );
  await p
    .getByRole("combobox", { name: "Personal status", exact: true })
    .selectOption("not registered");
  await p.getByText("28 viewers", { exact: true }).waitFor();
  await p.setViewportSize({ width: 320, height: 480 });
  await p.locator("tbody tr").first().scrollIntoViewIfNeeded();
  const label = await p
    .locator("tbody tr")
    .first()
    .locator(".admin-manage-cell span")
    .evaluate((e) => ({
      text: e.textContent,
      className: e.className,
      box: e.getBoundingClientRect().toJSON(),
    }));
  assert.equal(label.className, "sr-only");
  assert.ok(label.box.width <= 1 && label.box.height <= 1);
  report.checks.push({
    name: "Fixed320 Viewer rows no visible redundant label/name overlap",
    label,
    file: await shot(p, "admin-viewer-label-fixed-320-full"),
  });
  await p.screenshot({
    path: out + "/admin-viewer-label-fixed-320-row.png",
    animations: "disabled",
  });
  await p.setViewportSize({ width: 1440, height: 900 });
  const search = p.getByRole("searchbox", { name: "Search", exact: true });
  const viewer = await context("stranger", { width: 390, height: 844 });
  const v = await viewer.newPage();
  await v.goto(origin + "/dashboard", {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });
  await v.locator(".viewer-welcome").waitFor();
  await v.waitForFunction(
    () =>
      document.querySelector(".app-shell")?.getAttribute("data-hydrated") ===
      "true",
  );
  await p
    .getByRole("button", { name: "Add participants", exact: true })
    .click();
  const add = p.getByRole("dialog", { name: "Add participants", exact: true });
  await add.waitFor({ state: "visible" });
  await add
    .getByRole("textbox", { name: "Email", exact: true })
    .fill("stranger@portal.test");
  await add.getByRole("button", { name: "Add", exact: true }).click();
  const confirm = p.locator(".confirmation-dialog[open]");
  await confirm.waitFor({ state: "visible" });
  assert.match(await confirm.innerText(), /Add participants\?/);
  assert.match(await confirm.innerText(), /stranger@portal.test/);
  report.checks.push({
    name: "Real adminAdd preview confirmation names synthetic stranger",
    file: await shot(p, "admin-register-viewer-confirmation-1440"),
    confirmation: await confirm.innerText(),
  });
  const committed = p.waitForResponse(
    (r) =>
      r.url().includes("/api/portal") &&
      r.request().method() === "POST" &&
      r.request().postDataJSON()?.action === "commit-import",
  );
  await confirm.locator("button.button:not(.secondary)").click();
  const response = await committed;
  const body = await response.json();
  assert.equal(response.status(), 200);
  report.registrationCommit = { status: response.status(), body };
  await p.getByText("27 viewers", { exact: true }).waitFor({ timeout: 30000 });
  report.checks.push({
    name: "Commit200; Notregistered total drops28to27",
    file: await shot(p, "admin-not-registered-after-add-1440"),
  });
  await v.waitForTimeout(2100);
  const fresh = v.waitForResponse((r) =>
    r.url().includes("/api/portal?view=%2Fdashboard"),
  );
  await v.evaluate(() => window.dispatchEvent(new Event("focus")));
  const freshResponse = await fresh;
  assert.equal(freshResponse.status(), 200);
  const next = await freshResponse.json();
  assert.notEqual(next.me.mode, "viewer");
  await v.locator(".viewer-welcome").waitFor({ state: "hidden" });
  assert.equal(await v.locator(".page-error-card").count(), 0);
  report.checks.push({
    name: "Already-open Viewer focus refresh becomes participant without signout/reload",
    file: await shot(v, "viewer-registered-focus-transition-390"),
    response: next,
  });
  await viewer.close();
  await add
    .getByRole("button", { name: "Close add participants", exact: true })
    .click();
  await search.fill("stranger@portal.test");
  await p.getByText("0 viewers", { exact: true }).waitFor();
  await p
    .getByRole("combobox", { name: "Personal status", exact: true })
    .selectOption("registered");
  await p.getByText("1 participant", { exact: true }).waitFor();
  assert.equal(
    await p.locator("tbody input[type=checkbox]:enabled").count(),
    1,
  );
  report.checks.push({
    name: "Registered Stranger moves to participant filter with normal participant controls",
    file: await shot(p, "admin-viewer-now-registered-1440"),
  });
  assert.equal(
    report.requests.filter((q) => q.body?.action === "commit-import").length,
    1,
  );
  assert.equal(report.pageErrors.length, 0);
  await c.close();
  report.result = "PASS";
} catch (e) {
  report.result = "FAIL";
  report.failure = { message: e.message, stack: e.stack };
  throw e;
} finally {
  await b.close();
  report.browserClosed = true;
  writeFileSync(out + "/admin-report.json", JSON.stringify(report, null, 2));
}
