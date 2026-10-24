import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";
const root = "/workspace/dddhack-portal",
  origin = "http://localhost:3000",
  out = "evidence/project-credit-followup",
  source = "2b35d3e7036a88cf84586dae02ef7b81e39ff9e6";
assert.equal(
  execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim(),
  source,
);
assert.ok(
  !existsSync(out + "/report.json"),
  "One reveal run only; inspect previous outcome before any retry",
);
mkdirSync(out, { recursive: true });
const fingerprint = () =>
  Object.fromEntries(
    [
      "app/portal.tsx",
      "app/projects-rules-experience.css",
      "app/dashboard-v6.css",
      "app/team-discovery-experience.css",
    ].map((f) => [
      f,
      createHash("sha256")
        .update(readFileSync(root + "/" + f))
        .digest("hex"),
    ]),
  );
const report = {
  source,
  origin,
  fixtureBackend: 8821,
  syntheticOnly: true,
  fingerprint: fingerprint(),
  screenshots: [],
  writes: [],
  checks: [],
  network: [],
  errors: [],
  findings: [],
};
const save = () =>
  writeFileSync(out + "/report.json", JSON.stringify(report, null, 2));
save();
const b = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  chromiumSandbox: false,
  headless: true,
});
const c = await b.newContext({
  viewport: { width: 1440, height: 900 },
  reducedMotion: "reduce",
  permissions: ["clipboard-read", "clipboard-write"],
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
await c.route("**/*", (r) => {
  const req = r.request(),
    u = new URL(req.url());
  if (u.origin !== origin) return r.abort();
  if (!["GET", "HEAD"].includes(req.method())) {
    const d = req.postDataJSON();
    assert.equal(d.action, "reveal-credit");
    assert.equal(d.data.typeId, "fake_credit");
    assert.equal(report.writes.length, 0);
    report.writes.push({
      action: d.action,
      data: { typeId: d.data.typeId },
      actor: "fake_alice",
      status: "pending",
    });
    save();
  }
  return r.continue();
});
const p = await c.newPage();
p.setDefaultTimeout(30000);
p.on("pageerror", (e) => {
  report.errors.push(e.message);
  save();
});
p.on("response", (r) => {
  if (r.request().method() === "POST") {
    report.network.push({
      event: "response",
      action: r.request().postDataJSON()?.action,
      status: r.status(),
    });
    save();
  }
});
p.on("requestfailed", (r) => {
  if (r.method() === "POST") {
    report.network.push({
      event: "requestfailed",
      action: r.postDataJSON()?.action,
      error: r.failure()?.errorText,
    });
    save();
  }
});
const shot = async (name, size = "1440x900") => {
  const path = out + "/" + name + "-" + size + ".png";
  await p.screenshot({
    path,
    fullPage: false,
    animations: "disabled",
    style: "nextjs-portal{visibility:hidden!important}",
  });
  report.screenshots.push({
    path,
    sha256: createHash("sha256").update(readFileSync(path)).digest("hex"),
  });
  save();
};
try {
  const r = await c.request.get(origin + "/api/portal?view=%2Fdashboard");
  assert.equal(r.status(), 200);
  const d = await r.json();
  assert.equal(d.me.id, "fake_alice");
  assert.equal(d.project.revision, 3);
  assert.equal(d.submissionAccess.attemptsUsed, 2);
  assert.ok(
    !JSON.stringify(d.credits).includes("SYNTHETIC-NOT-REDEEMABLE-VOUCHER"),
  );
  await p.goto(origin + "/dashboard#project", {
    waitUntil: "networkidle",
    timeout: 60000,
  });
  await p.getByRole("tab", { name: "Project", exact: true }).click();
  await shot("project-after-draft-save");
  const opener = p.getByRole("button", { name: "Versions 2/3", exact: true });
  await opener.click();
  await p.locator(".history-version").first().waitFor();
  assert.equal(await p.locator(".history-version").count(), 2);
  await shot("history-after-draft-save");
  await p.keyboard.press("Escape");
  await p.locator(".project-history-dialog").waitFor({ state: "detached" });
  report.checks.push({
    name: "Fresh context confirms saved draft revision3 and two immutable committed versions; history closes with Escape",
    passed: true,
  });
  save();
  await p.getByRole("tab", { name: "Credits", exact: true }).click();
  await p.locator(".dashboard-credit").first().waitFor();
  await shot("credits-masked-before-reveal");
  const revealed = p.waitForResponse(
    (r) =>
      r.request().method() === "POST" &&
      r.request().postDataJSON()?.action === "reveal-credit",
    { timeout: 60000 },
  );
  await p
    .getByRole("button", { name: "Reveal my allocation", exact: true })
    .click();
  const response = await revealed;
  report.writes[0].httpStatus = response.status();
  report.writes[0].status =
    response.status() === 200 ? "revealed-synthetic" : "failed";
  save();
  assert.equal(response.status(), 200);
  assert.equal(
    await p.locator('[aria-label="Your private allocation"]').innerText(),
    "SYNTHETIC-NOT-REDEEMABLE-VOUCHER",
  );
  await shot("credits-synthetic-revealed");
  await p.getByRole("button", { name: "Copy allocation", exact: true }).click();
  await p
    .getByRole("button", { name: "Copied allocation", exact: true })
    .waitFor();
  assert.equal(
    await p.evaluate(() => navigator.clipboard.readText()),
    "SYNTHETIC-NOT-REDEEMABLE-VOUCHER",
  );
  await shot("credits-synthetic-copied");
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 320, height: 720 },
  ]) {
    await p.setViewportSize(viewport);
    assert.equal(
      await p.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    await shot(
      "credits-synthetic-copied",
      viewport.width + "x" + viewport.height,
    );
  }
  report.findings.push({
    owner: "root",
    issue:
      "Copy changes its accessible name to Copied allocation but the visible icon remains Copy with no visible success label/toast.",
    evidence: "credits-synthetic-copied-320x720.png",
  });
  await p.getByRole("button", { name: "Hide allocation", exact: true }).click();
  await p.locator('[aria-label="Allocation hidden"]').waitFor();
  assert.equal(
    await p
      .getByRole("button", { name: "Copy allocation", exact: true })
      .isDisabled(),
    true,
  );
  await shot("credits-hidden-again", "320x720");
  report.checks.push({
    name: "Assigned fake allocation absent from dashboard payload, one real reveal POST200, clipboard exact-match,390/320 bounds, Hide remasks and disables Copy",
    passed: true,
  });
  assert.equal(report.errors.length, 0);
  assert.deepEqual(fingerprint(), report.fingerprint);
  save();
} catch (e) {
  report.failure = String(e.stack || e);
  process.exitCode = 1;
} finally {
  report.fingerprintAtEnd = fingerprint();
  await b.close();
  save();
}
console.log(JSON.stringify(report, null, 2));
