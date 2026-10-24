import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const codeSource = "667222d5cd2680ec872860b971f32ecb7be42249",
  root = "/workspace/dddhack-portal",
  origin = "http://localhost:3000",
  out = "evidence/project-final-submit";
const source = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: root,
  encoding: "utf8",
}).trim();
const metadataChanges = execFileSync(
  "git",
  ["diff", "--name-only", codeSource + ".." + source],
  { cwd: root, encoding: "utf8" },
)
  .trim()
  .split("\n")
  .filter(Boolean);
assert.ok(
  metadataChanges.every((f) =>
    /^(docs\/|evidence\/|README\.md$|design-qa\.md$)/.test(f),
  ),
  "Only non-runtime changes since matrix",
);
assert.equal(process.env.QA_AUTHORIZE_ONE_FINAL_SYNTHETIC_SUBMISSION, "8821");
assert.equal(
  execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim(),
  source,
);
const matrix = JSON.parse(
  readFileSync("evidence/project-credit-responsive-final/report.json"),
);
assert.equal(matrix.source, codeSource);
assert.equal(matrix.checks.length, 15);
assert.ok(matrix.checks.every((x) => x.passed));
assert.equal(matrix.errors.length, 0);
assert.ok(!matrix.failure);
assert.equal(matrix.nativeBrowserZoom.verified, true);
assert.ok(
  !existsSync(out + "/report.json"),
  "Exactly one final submission, inspect original outcome before any other attempt",
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
  runtimeCodeSource: codeSource,
  metadataChanges,
  origin,
  fixtureBackend: 8821,
  syntheticOnly: true,
  fingerprint: fingerprint(),
  screenshots: [],
  writes: [],
  checks: [],
  network: [],
  errors: [],
};
const save = () =>
  writeFileSync(out + "/report.json", JSON.stringify(report, null, 2));
save();
const b = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  headless: true,
  chromiumSandbox: false,
});
const c = await b.newContext({
  viewport: { width: 1440, height: 900 },
  reducedMotion: "reduce",
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
    assert.equal(d.action, "submit-project");
    assert.equal(d.data.revision, 3);
    assert.equal(d.data.project.projectName, "Small Wonder");
    assert.equal(d.data.project.attestation, true);
    assert.equal(report.writes.length, 0, "No fourth attempt");
    report.writes.push({
      action: d.action,
      actor: "fake_alice",
      status: "pending",
      data: {
        revision: d.data.revision,
        projectName: d.data.project.projectName,
        attestation: d.data.project.attestation,
        descriptionSha256: createHash("sha256")
          .update(d.data.project.description)
          .digest("hex"),
        logoSha256: createHash("sha256")
          .update(d.data.project.logo)
          .digest("hex"),
        bannerSha256: createHash("sha256")
          .update(d.data.project.banner)
          .digest("hex"),
      },
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
const get = async (view) => {
  const r = await c.request.get(
    origin + "/api/portal?view=" + encodeURIComponent(view),
  );
  assert.equal(r.status(), 200);
  return r.json();
};
const versions = (items) =>
  items.map((v) => ({
    id: v.id,
    attempt: v.attempt,
    sha256: createHash("sha256").update(JSON.stringify(v)).digest("hex"),
  }));
const shot = async (name, fullPage = false) => {
  const path = out + "/" + name + ".png";
  if (fullPage) await p.evaluate(() => window.scrollTo(0, 0));
  await p.screenshot({
    path,
    fullPage,
    animations: "disabled",
    style: "nextjs-portal{visibility:hidden!important}",
  });
  report.screenshots.push({
    path,
    fullPage,
    sha256: createHash("sha256").update(readFileSync(path)).digest("hex"),
  });
  save();
};
try {
  const health = await c.request.get(origin + "/api/health");
  assert.equal((await health.json()).runtime, "synthetic-local");
  let d = await get("/dashboard");
  assert.equal(d.me.id, "fake_alice");
  assert.equal(d.project.revision, 3);
  assert.equal(d.submissionAccess.attemptsUsed, 2);
  assert.equal(d.submissionAccess.canCommit, true);
  const before = await get("/project-history");
  report.historyBefore = versions(before.items);
  assert.equal(before.items.length, 2);
  save();
  await p.goto(origin + "/dashboard#project", {
    waitUntil: "networkidle",
    timeout: 60000,
  });
  await p.getByRole("tab", { name: "Project", exact: true }).click();
  await p.getByRole("button", { name: "Update project", exact: true }).click();
  await p.locator(".project-editor:not([inert])").waitFor();
  await p.getByRole("button", { name: "Next", exact: true }).click();
  await p.getByRole("button", { name: "Next", exact: true }).click();
  await p
    .getByRole("checkbox", {
      name: "I confirm this submission is accurate.",
      exact: true,
    })
    .check();
  await p.getByRole("button", { name: "Submit", exact: true }).click();
  await p.locator(".confirmation-dialog[open]").waitFor();
  await shot("third-submission-confirmation-desktop");
  const response = p.waitForResponse(
    (r) =>
      r.request().method() === "POST" &&
      r.request().postDataJSON()?.action === "submit-project",
    { timeout: 60000 },
  );
  await p
    .getByRole("button", { name: "Commit submission", exact: true })
    .click();
  const r = await response;
  report.writes[0].httpStatus = r.status();
  report.writes[0].status = r.status() === 200 ? "committed" : "failed";
  report.writes[0].receipt = await r.json();
  save();
  assert.equal(r.status(), 200, JSON.stringify(report.writes[0].receipt));
  assert.ok(report.writes[0].receipt.versionId);
  await p.locator('.action-message[data-tone="success"]').waitFor();
  await shot("third-submission-success-toast-desktop");
  d = await get("/dashboard");
  assert.equal(d.project.revision, 4);
  assert.equal(d.submissionAccess.attemptsUsed, 3);
  assert.equal(d.submissionAccess.canCommit, false);
  assert.equal(d.submissionAccess.locked, true);
  report.after = {
    revision: d.project.revision,
    attemptsUsed: d.submissionAccess.attemptsUsed,
    canCommit: d.submissionAccess.canCommit,
    locked: d.submissionAccess.locked,
  };
  const after = await get("/project-history");
  assert.equal(after.items.length, 3);
  report.historyAfter = versions(after.items);
  for (const old of report.historyBefore)
    assert.deepEqual(
      report.historyAfter.find((v) => v.id === old.id),
      old,
    );
  report.checks.push({
    name: "Exactly one third submission returned200 and version receipt; revision3→4, attempts2→3; both old immutable versions unchanged",
    passed: true,
  });
  save();
  await p.reload({ waitUntil: "networkidle" });
  await p.getByRole("tab", { name: "Project", exact: true }).click();
  assert.equal(
    await p
      .getByRole("button", { name: "Update project", exact: true })
      .count(),
    0,
  );
  await p.getByRole("button", { name: "Versions 3/3", exact: true }).waitFor();
  await shot("project-locked-after-third-desktop", true);
  await p.getByRole("button", { name: "Versions 3/3", exact: true }).click();
  await p.locator(".history-version").first().waitFor();
  assert.equal(await p.locator(".history-version").count(), 3);
  await shot("history-three-versions-desktop");
  await p.keyboard.press("Escape");
  await p.locator(".project-history-dialog").waitFor({ state: "detached" });
  await p.setViewportSize({ width: 320, height: 720 });
  await shot("project-locked-after-third-320", true);
  await p.getByRole("button", { name: "Versions 3/3", exact: true }).click();
  await p.locator(".history-version").first().waitFor();
  await shot("history-three-versions-320");
  await p.keyboard.press("Escape");
  report.checks.push({
    name: "Desktop and320 project expose3/3 history and no Update/Submit capability; fourth attempt not issued",
    passed: true,
  });
  assert.deepEqual(fingerprint(), report.fingerprint);
  assert.equal(report.errors.length, 0);
} catch (e) {
  report.failure = String(e.stack || e);
  process.exitCode = 1;
} finally {
  report.fingerprintAtEnd = fingerprint();
  await b.close();
  save();
}
console.log(JSON.stringify(report, null, 2));
