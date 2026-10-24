// Read-only completion. Never repeats the already successful registration POST.
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
const origin = "http://localhost:3008",
  out = "evidence/viewer-registration/after";
const report = JSON.parse(
  readFileSync(out + "/admin-final-harness-variable-error.json", "utf8"),
);
const b = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  headless: true,
  chromiumSandbox: false,
});
try {
  const c = await b.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: "reduce",
  });
  await c.addCookies([
    { name: "portal_local_fixture", value: "owner", url: origin },
  ]);
  await c.route("**/*", (r) =>
    new URL(r.request().url()).origin !== origin ||
    !["GET", "HEAD"].includes(r.request().method())
      ? r.abort("blockedbyclient")
      : r.continue(),
  );
  const p = await c.newPage();
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
  await p
    .getByRole("searchbox", { name: "Search", exact: true })
    .fill("stranger@portal.test");
  await p.getByText("0 viewers", { exact: true }).waitFor();
  await p
    .getByRole("combobox", { name: "Personal status", exact: true })
    .selectOption("registered");
  await p.getByText("1 participant", { exact: true }).waitFor();
  assert.equal(
    await p.locator("tbody input[type=checkbox]:enabled").count(),
    1,
  );
  assert.equal(await p.locator("tbody .admin-row-actions").count(), 1);
  const api = await c.request.get(
    origin + "/api/portal?view=%2Fadmin%2Fparticipants",
  );
  assert.equal(api.status(), 200);
  const data = await api.json();
  const stranger = data.items.find((r) => r.email === "stranger@portal.test");
  assert.equal(stranger.viewer, false);
  assert.equal(stranger.registered, true);
  assert.equal(stranger.status, "Registered");
  assert.equal(data.items.filter((r) => r.viewer).length, 27);
  assert.equal(
    report.requests.filter((q) => q.body?.action === "commit-import").length,
    1,
  );
  await p.evaluate(() => document.fonts.ready);
  const file = out + "/admin-viewer-now-registered-1440.png";
  await p.screenshot({ path: file, fullPage: true, animations: "disabled" });
  report.checks.push({
    name: "Read-only final check: Stranger only in Registered filter, selectable/manageable,27Viewers remain; no repeated registrationPOST",
    stranger,
    viewerCount: 27,
    file,
  });
  await c.close();
  report.result = "PASS";
  report.rawFinalHarnessFailure = report.failure;
  delete report.failure;
  report.readOnlyCompletion =
    "After positive200commit+focus transition, final filter assertion referenced a missing QA variable. Preserved rawfailure and completed ONLY remaining GET/filter checks, no mutation replay.";
} catch (e) {
  report.readOnlyFailure = { message: e.message, stack: e.stack };
  throw e;
} finally {
  await b.close();
  report.browserClosed = true;
  writeFileSync(out + "/admin-report.json", JSON.stringify(report, null, 2));
}
