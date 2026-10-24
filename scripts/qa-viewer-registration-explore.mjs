import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { writeFileSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
const origin = "http://localhost:3008",
  out = "evidence/viewer-registration/after",
  db = "/tmp/ddd-viewer-20261024-unique01.sqlite";
const report = {
  source: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  syntheticOnly: true,
  checks: [],
  errors: [],
};
const b = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  headless: true,
  chromiumSandbox: false,
});
async function ctx(actor) {
  const c = await b.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    reducedMotion: "reduce",
  });
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
report.checks.push(
  ...JSON.parse(
    readFileSync(out + "/explore-fixture-null-rejected.json", "utf8"),
  ).checks,
);
report.harnessCorrection =
  "SQLite correctly rejected NULL completed_at setup without mutation. Remaining gate uses existing supported gender_confirmed=0 and restores original1. Prior successful exploration/pending checks are retained, not rerun.";
let completed;
try {
  const pending = await ctx("pending");
  const q = await pending.newPage();
  await q.goto(origin + "/dashboard", {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });
  completed = execFileSync(
    "python3",
    [
      "-c",
      "import sqlite3,sys,json; c=sqlite3.connect(sys.argv[1]); old=c.execute(\"SELECT gender_confirmed FROM participant_profiles WHERE user_id='fake_pending'\").fetchone()[0];c.execute(\"UPDATE participant_profiles SET gender_confirmed=0 WHERE user_id='fake_pending'\");c.commit();print(json.dumps(old))",
      db,
    ],
    { encoding: "utf8" },
  ).trim();
  await q.reload({ waitUntil: "domcontentloaded" });
  await q.locator('.profile-flow[data-step="1"]').waitFor({ state: "visible" });
  assert.equal(await q.locator(".viewer-welcome,.page-error-card").count(), 0);
  report.checks.push({
    name: "Registered incomplete profile still opens real three-step profile gate",
    fixtureChange:
      "Only fake_pending gender_confirmed set0, restored in finally",
    file: await shot(q, "pending-incomplete-profile-390"),
  });
  await pending.close();
  const volunteer = await ctx("volunteer");
  const v = await volunteer.newPage();
  await v.goto(origin + "/admin/participants", {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });
  await v.waitForFunction(
    () =>
      document.querySelector(".app-shell")?.getAttribute("data-hydrated") ===
      "true",
  );
  assert.equal(
    await v
      .getByRole("combobox", { name: "Personal status", exact: true })
      .locator('option[value="not registered"]')
      .count(),
    0,
  );
  const vr = await volunteer.request.get(
    `${origin}/api/portal?view=%2Fadmin%2Fparticipants`,
  );
  const vd = await vr.json();
  assert.equal(
    vd.items.some((r) => r.viewer),
    false,
  );
  report.checks.push({
    name: "Volunteer staff participant view unaffected; no Viewer filter or Viewer account payload",
    file: await shot(v, "volunteer-no-viewer-filter-390"),
  });
  await volunteer.close();
  report.result = "PASS";
} catch (e) {
  report.result = "FAIL";
  report.failure = { message: e.message, stack: e.stack };
  throw e;
} finally {
  if (completed !== undefined) {
    execFileSync("python3", [
      "-c",
      "import sqlite3,sys,json;c=sqlite3.connect(sys.argv[1]);c.execute(\"UPDATE participant_profiles SET gender_confirmed=? WHERE user_id='fake_pending'\",(json.loads(sys.argv[2]),));c.commit()",
      db,
      completed,
    ]);
    report.pendingGenderConfirmedRestored = true;
  }
  await b.close();
  report.browserClosed = true;
  writeFileSync(out + "/explore-report.json", JSON.stringify(report, null, 2));
}
