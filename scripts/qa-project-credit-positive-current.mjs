import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const source =
    process.env.QA_ROOT_SOURCE || "2a6d865517e5903ef974ca198f073d27aaf39265",
  root = "/workspace/dddhack-portal",
  origin = "http://localhost:3000",
  out = process.env.QA_OUTPUT || "evidence/project-credit-positive-current";
assert.equal(
  execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim(),
  source,
);
if (existsSync(out + "/report.json"))
  assert.equal(
    JSON.parse(readFileSync(out + "/report.json")).writes?.length || 0,
    0,
    "Do not repeat a positive run without checking its actual outcome",
  );
mkdirSync(out, { recursive: true });
const fingerprint = () =>
  Object.fromEntries(
    [
      "app/portal.tsx",
      "app/projects-rules-experience.css",
      "app/dashboard-v6.css",
      "app/team-discovery-experience.css",
    ].map((file) => [
      file,
      createHash("sha256")
        .update(readFileSync(root + "/" + file))
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
  checks: [],
  writes: [],
  errors: [],
  findings: [],
  network: [],
  retry: process.env.QA_RETRY_ONCE === "1",
};
const save = () =>
  writeFileSync(out + "/report.json", JSON.stringify(report, null, 2));
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
await c.route("**/*", (route) => {
  const req = route.request(),
    url = new URL(req.url());
  if (url.origin !== origin) return route.abort();
  if (!["GET", "HEAD"].includes(req.method())) {
    const body = req.postDataJSON();
    assert.ok(
      ["save-project", "reveal-credit"].includes(body.action),
      "Only expressly authorized synthetic draft/reveal writes",
    );
    assert.equal(
      report.writes.filter((x) => x.action === body.action).length,
      0,
    );
    if (body.action === "save-project") assert.equal(body.data.revision, 2);
    else assert.equal(body.data.typeId, "fake_credit");
    report.writes.push({
      action: body.action,
      status: "pending",
      actor: "fake_alice",
      data:
        body.action === "save-project"
          ? {
              revision: body.data.revision,
              projectName: body.data.project.projectName,
              descriptionSha256: createHash("sha256")
                .update(body.data.project.description)
                .digest("hex"),
              logoSha256: createHash("sha256")
                .update(body.data.project.logo)
                .digest("hex"),
              bannerSha256: createHash("sha256")
                .update(body.data.project.banner)
                .digest("hex"),
              ecosystemSelections: body.data.project.ecosystemSelections,
              cerebrasIntegration: body.data.project.cerebrasIntegration,
              attestation: body.data.project.attestation,
            }
          : { typeId: body.data.typeId },
    });
    save();
  }
  return route.continue();
});
const p = await c.newPage();
p.setDefaultTimeout(45000);
p.on("requestfailed", (req) => {
  if (req.method() === "POST") {
    report.network.push({
      event: "requestfailed",
      action: req.postDataJSON()?.action,
      error: req.failure()?.errorText,
    });
    save();
  }
});
p.on("response", (res) => {
  if (res.request().method() === "POST") {
    report.network.push({
      event: "response",
      action: res.request().postDataJSON()?.action,
      status: res.status(),
      url: res.url(),
    });
    save();
  }
});
p.on("pageerror", (error) => {
  report.errors.push(error.message);
  save();
});
const shot = async (name, viewport = "1440x900") => {
  const path = out + "/" + name + "-" + viewport + ".png";
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
const dashboard = async () => {
  const r = await c.request.get(origin + "/api/portal?view=%2Fdashboard");
  assert.equal(r.status(), 200);
  return r.json();
};
try {
  const health = await c.request.get(origin + "/api/health");
  assert.equal((await health.json()).runtime, "synthetic-local");
  let data = await dashboard();
  assert.equal(data.me.id, "fake_alice");
  assert.equal(data.project.revision, 2);
  assert.equal(data.submissionAccess.attemptsUsed, 2);
  assert.ok(
    !JSON.stringify(data.credits).includes("SYNTHETIC-NOT-REDEEMABLE-VOUCHER"),
  );
  await p.goto(origin + "/dashboard#project", { waitUntil: "networkidle" });
  await p.getByRole("tab", { name: "Project", exact: true }).click();
  await p.getByRole("button", { name: "Update project", exact: true }).click();
  await p.locator(".project-editor:not([inert])").waitFor();
  await p
    .locator('.project-editor textarea[name="description"]')
    .fill(
      data.project.draft.description + " Synthetic draft-save browser check.",
    );
  await p.getByRole("button", { name: "Next", exact: true }).click();
  await p.getByRole("button", { name: "Next", exact: true }).click();
  await p.getByRole("button", { name: "Save draft", exact: true }).click();
  await p.locator(".confirmation-dialog[open]").waitFor();
  await shot("draft-save-confirmation");
  const response = p.waitForResponse(
    (r) =>
      r.request().method() === "POST" &&
      r.url().endsWith("/api/portal") &&
      r.request().postDataJSON().action === "save-project",
    { timeout: 60000 },
  );
  await p
    .locator(".confirmation-dialog")
    .getByRole("button", { name: "Confirm change", exact: true })
    .click();
  const result = await response;
  const write = report.writes.find((x) => x.action === "save-project");
  write.httpStatus = result.status();
  write.status = result.status() === 200 ? "persisted" : "failed";
  write.result = await result.json();
  save();
  assert.equal(result.status(), 200);
  await p.locator('.action-message[data-tone="success"]').waitFor();
  await shot("draft-saved-feedback");
  data = await dashboard();
  assert.equal(data.project.revision, 3);
  assert.equal(data.submissionAccess.attemptsUsed, 2);
  assert.match(
    data.project.draft.description,
    /Synthetic draft-save browser check\.$/,
  );
  report.checks.push({
    name: "Draft saved through real existing POST, success feedback visible, revision2→3, committed attempts remain2",
    passed: true,
  });
  save();
  await p.goto(origin + "/dashboard#project", { waitUntil: "networkidle" });
  await p.getByRole("tab", { name: "Project", exact: true }).click();
  await p.getByRole("button", { name: "Versions 2/3", exact: true }).click();
  await p.locator(".history-version").first().waitFor();
  assert.equal(await p.locator(".history-version").count(), 2);
  await shot("history-after-draft-save");
  await p.keyboard.press("Escape");
  await p.locator(".project-history-dialog").waitFor({ state: "detached" });
  await p.goto(origin + "/dashboard#credits", { waitUntil: "networkidle" });
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
  const revealResponse = await revealed;
  const revealWrite = report.writes.find((x) => x.action === "reveal-credit");
  revealWrite.httpStatus = revealResponse.status();
  revealWrite.status =
    revealResponse.status() === 200 ? "revealed-synthetic" : "failed";
  save();
  assert.equal(revealResponse.status(), 200);
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
  report.findings.push({
    owner: "root",
    issue:
      "Copy success changes the accessible name to Copied allocation, but the visible icon remains Copy and the participant gets no visible success label/toast.",
    evidence: "credits-synthetic-copied-1440x900.png",
  });
  await p.getByRole("button", { name: "Hide allocation", exact: true }).click();
  await p.locator('[aria-label="Allocation hidden"]').waitFor();
  assert.equal(
    await p
      .getByRole("button", { name: "Copy allocation", exact: true })
      .isDisabled(),
    true,
  );
  await shot("credits-hidden-again");
  report.checks.push({
    name: "Assigned fake allocation absent from dashboard payload, revealed once through real POST, actual clipboard copied exact fake value, Hide remasks and disables Copy",
    passed: true,
  });
  save();
  assert.deepEqual(fingerprint(), report.fingerprint);
  assert.equal(report.errors.length, 0);
} catch (error) {
  report.failure = String(error.stack || error);
  process.exitCode = 1;
} finally {
  report.fingerprintAtEnd = fingerprint();
  await b.close();
  save();
}
console.log(JSON.stringify(report, null, 2));
