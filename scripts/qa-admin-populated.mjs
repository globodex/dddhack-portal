import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
const origin = process.env.ADMIN_QA_ORIGIN || "http://localhost:3013",
  output = process.env.ADMIN_QA_OUTPUT || "evidence/redesign-admin-populated";
const local = new URL(origin);
assert(
  ["localhost", "127.0.0.1", "[::1]"].includes(local.hostname) &&
    local.protocol === "http:" &&
    local.origin === origin,
);
const sourceRoot = resolve(process.env.ADMIN_QA_SOURCE_ROOT || process.cwd());
const source = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: sourceRoot,
  encoding: "utf8",
}).trim();
mkdirSync(output, { recursive: true });
const report = {
  source,
  sourceRoot,
  syntheticOnly: true,
  browserSandbox: false,
  checks: [],
  screenshots: [],
  writes: [],
  console: [],
  errors: [],
};
const save = () =>
  writeFileSync(output + "/report.json", JSON.stringify(report, null, 2));
const check = (name) => {
  report.checks.push({ name, passed: true });
  save();
};
const b = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  headless: true,
  chromiumSandbox: false,
});
const c = await b.newContext({
  viewport: { width: 1440, height: 900 },
  reducedMotion: "reduce",
  serviceWorkers: "block",
});
await c.addCookies([
  { name: "portal_local_fixture", value: "owner", url: origin },
]);
const allowed = new Set([
  "admin-idea-override",
  "preview-credit-batch",
  "publish-credit-batch",
]);
await c.route("**/*", (route) => {
  const r = route.request(),
    u = new URL(r.url());
  if (u.origin !== origin) return route.abort("blockedbyclient");
  if (u.pathname.startsWith("/__nextjs_")) return route.continue();
  if (!["GET", "HEAD"].includes(r.method())) {
    let body;
    try {
      body = r.postDataJSON();
    } catch {}
    if (!allowed.has(body?.action)) {
      report.errors.push(
        "Blocked unexpected action " + body?.action + " " + u.pathname,
      );
      save();
      return route.abort("blockedbyclient");
    }
    if (body.action === "admin-idea-override")
      assert.equal(body.data.teamId, "fake_team1");
    if (body.action.includes("credit-batch"))
      assert.match(body.data.csv, /SYNTHETIC-CE756EA/);
    report.writes.push({ action: body.action, data: body.data });
    save();
  }
  return route.continue();
});
const p = await c.newPage();
p.setDefaultTimeout(15000);
p.on("pageerror", (e) => report.errors.push(e.message));
p.on("console", (m) => {
  if (["error", "warning"].includes(m.type())) {
    report.console.push({ type: m.type(), text: m.text() });
    save();
  }
});
const goto = async (path) => {
  await p.goto(origin + path, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await p.locator(".admin-workspace").waitFor();
  await p.waitForLoadState("networkidle");
  await p.waitForFunction(() =>
    [...document.querySelectorAll("form[data-hydrated]")].every(
      (f) => f.getAttribute("data-hydrated") === "true",
    ),
  );
};
const confirm = async () => {
  const d = p.locator(".confirmation-dialog[open]");
  await d.waitFor();
  await d.getByRole("button").last().click();
  await d.waitFor({ state: "hidden" });
};
async function capture(name) {
  await p.evaluate(() => document.fonts.ready);
  await p.locator(".admin-workspace").waitFor();
  const viewport = p.viewportSize(),
    fullPage = (await p.locator("dialog[open]").count()) === 0;
  if (fullPage) {
    await p.evaluate(() => scrollTo(0, 0));
    await p.waitForFunction(() => scrollY === 0);
  }
  const file = `${output}/${name}-${viewport.width}x${viewport.height}.png`;
  await p.screenshot({
    path: file,
    fullPage,
    animations: "disabled",
    caret: "initial",
    style: "nextjs-portal {visibility:hidden!important}",
  });
  assert.equal(
    await p.evaluate(() => document.documentElement.scrollWidth > innerWidth),
    false,
    name + " overflow",
  );
  report.screenshots.push({
    name,
    path: file,
    viewport,
    fullPage,
    inspected: false,
    developmentOverlayHidden: true,
  });
  save();
}
try {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
    { width: 390, height: 480 },
  ]) {
    await p.setViewportSize(viewport);
    await goto("/admin/teams");
    const t = p
      .locator(".admin-team-disclosure")
      .filter({ hasText: "Small Wonder" });
    if ((await t.getAttribute("open")) === null)
      await t.locator(":scope > summary").click();
    await t.locator(".admin-team-idea > summary").click();
    await capture("team-locked-idea");
    await goto("/admin/submissions");
    await capture("submissions-populated");
    const management = p.locator(".admin-submission-management").first();
    await management.locator(":scope > summary").click();
    await capture("submission-management");
    await goto("/admin/submissions/synthetic-alice");
    if (viewport.width < 1200)
      await p.getByRole("tab", { name: "Review", exact: true }).click();
    await capture("review-score-and-history");
    await p.locator(".admin-review-versions > summary").click();
    await p
      .locator("details")
      .filter({ hasText: "Review history · unrevealed" })
      .last()
      .locator(":scope > summary")
      .click()
      .catch(() => {});
    await capture("review-history-expanded");
    if (viewport.width < 1200)
      await p
        .getByRole("tab", { name: "Project details", exact: true })
        .click();
    const eligibility = p
      .locator("form")
      .filter({ hasText: "Eligibility check" });
    await eligibility
      .locator('select[name="status"]')
      .selectOption("ineligible");
    await capture("review-eligibility-evidence");
    await eligibility.locator('select[name="status"]').selectOption("eligible");
    await capture("review-eligibility-clear");
    const rubric = p
      .locator("details")
      .filter({
        has: p.locator("summary", { hasText: "Final judging rubric" }),
      })
      .first();
    await rubric.locator(":scope > summary").click();
    await capture("review-rubric");
    await goto("/admin/credits");
    await capture("credits-published");
    const upload = p.locator(".credit-batch-new-upload");
    if ((await upload.getAttribute("open")) === null)
      await upload.locator(":scope > summary").click();
    await capture("credits-new-upload");
    await p
      .getByRole("textbox", { name: "Paste CSV", exact: true })
      .fill(
        "Synthetic Gamma,Synthetic Delta\nSYNTHETIC-CE756EA-X1,SYNTHETIC-CE756EA-Y1",
      );
    await p.getByRole("button", { name: "Add credits", exact: true }).click();
    await capture("credits-editor");
    await p.getByRole("button", { name: "Change CSV", exact: true }).click();
    await capture("credits-source-restored");
    await goto("/admin/settings");
    const nav = p.getByRole("tablist", { name: "Settings sections" });
    await nav.getByRole("tab", { name: "Content", exact: true }).click();
    await p.locator(".admin-settings-extra > summary").click();
    await capture("settings-scoring");
    await nav.getByRole("tab", { name: "Access", exact: true }).click();
    await capture("settings-credit-instructions");
    await goto("/admin/logs");
    await capture("logs-populated");
    await p.locator(".admin-log-list > li").first().locator("summary").click();
    await capture("log-expanded");
    check(
      "all populated admin surfaces fit " +
        viewport.width +
        "x" +
        viewport.height,
    );
  }
  const actorContext = await b.newContext();
  await actorContext.addCookies([
    { name: "portal_local_fixture", value: "eve", url: origin },
  ]);
  const recipient = await (
    await actorContext.request.get(origin + "/api/portal?view=/dashboard")
  ).json();
  assert.equal(recipient.individualStatus, "Checked in");
  assert(recipient.credits.length >= 2);
  check("published credits allocated to checked-in personal recipient");
  await actorContext.close();
} catch (error) {
  report.errors.push(String(error.stack || error));
  save();
}
await b.close();
assert.equal(
  execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: sourceRoot,
    encoding: "utf8",
  }).trim(),
  source,
  "Runtime source changed during capture",
);
save();
console.log(
  JSON.stringify({
    checks: report.checks.length,
    captures: report.screenshots.length,
    writes: report.writes.length,
    errors: report.errors.length,
    console: report.console.length,
  }),
);
if (report.errors.length) process.exitCode = 1;
