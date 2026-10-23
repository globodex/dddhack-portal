// Optional project fixture gaps only. GET/HEAD requests at exact loopback origin.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
if (!process.argv.includes("--preview-ready")) {
  console.log(
    "Prepared only. Requires a fresh --control-audit --project-extras loopback manifest. Always read-only.",
  );
  process.exit(0);
}
assert.ok(!process.argv.includes("--mutations"));
const manifest = JSON.parse(
  readFileSync(process.env.V6_CONTROL_MANIFEST || "", "utf8"),
);
assert.equal(manifest.disposable, true);
assert.equal(manifest.syntheticOnly, true);
assert.match(manifest.origin, /^http:\/\/127\.0\.0\.1:\d{4,5}$/);
assert.ok(
  Number(new URL(manifest.origin).port) >= 1024 &&
    Number(new URL(manifest.origin).port) <= 65535,
);
const artifact = resolve(manifest.artifactRoot);
assert.equal(
  execFileSync("git", ["-C", artifact, "rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  manifest.source,
);
const fingerprint = () =>
  createHash("sha256")
    .update(readFileSync(join(artifact, "dist/server/index.js")))
    .digest("hex");
assert.equal(fingerprint(), manifest.worker);
const extra = manifest.projectExtras;
assert.equal(extra?.actor?.id, "fake_first_member");
assert.equal(extra?.actor?.email, "first_member@portal.test");
assert.equal(extra.unpublishedProjectId, "fake_unpublished_project");
assert.equal(extra.deploymentSlug, "synthetic-control-24");
assert.equal(
  extra.deploymentUrl,
  "https://deployment.example.test/synthetic-demo",
);
mkdirSync("evidence/v7-project-extra", { recursive: true });
const output = mkdtempSync(
  "evidence/v7-project-extra/" + manifest.source.slice(0, 8) + "-",
);
const report = {
  source: manifest.source,
  worker: manifest.worker,
  origin: manifest.origin,
  syntheticOnly: true,
  readOnly: true,
  physicalDeviceTested: false,
  checks: [],
  errors: [],
  blockedWrites: [],
  expectedExternalBlocks: [],
  screenshots: [],
};
const save = () =>
  writeFileSync(
    join(output, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
const { chromium } = await import("@playwright/test");
const browser = await chromium.launch({
  headless: true,
  chromiumSandbox: true,
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
});
try {
  for (const mode of ["desktop-mouse", "desktop-keyboard", "mobile-touch"]) {
    const actor = extra.actor;
    const context = await browser.newContext({
      viewport:
        mode === "mobile-touch"
          ? { width: 390, height: 844 }
          : { width: 1440, height: 900 },
      hasTouch: mode === "mobile-touch",
      isMobile: mode === "mobile-touch",
      serviceWorkers: "block",
    });
    let deploymentObserved;
    const deploymentBlocked = new Promise((resolve) => {
      deploymentObserved = resolve;
    });
    await context.route("**/*", (route) => {
      const req = route.request(),
        url = new URL(req.url());
      if (url.origin !== manifest.origin) {
        report.expectedExternalBlocks.push({ mode, url: url.href });
        if (url.href === extra.deploymentUrl) deploymentObserved();
        return route.abort();
      }
      if (!["GET", "HEAD"].includes(req.method())) {
        report.blockedWrites.push({ mode, method: req.method() });
        return route.abort();
      }
      return route.continue({
        headers: {
          ...req.headers(),
          "oai-authenticated-user-id": actor.id,
          "oai-authenticated-user-email": actor.email,
        },
      });
    });
    const page = await context.newPage();
    page.setDefaultTimeout(12000);
    page.on("pageerror", (e) =>
      report.errors.push({ mode, message: e.message }),
    );
    const activate = async (locator) => {
      if (mode === "mobile-touch") await locator.tap();
      else if (mode === "desktop-keyboard") {
        for (let i = 0; i < 150; i++) {
          if (await locator.evaluate((el) => document.activeElement === el))
            break;
          await page.keyboard.press("Tab");
        }
        assert.ok(
          await locator.evaluate((el) => document.activeElement === el),
        );
        await page.keyboard.press("Enter");
      } else await locator.click();
    };
    try {
      await page.goto(manifest.origin + "/dashboard#project", {
        waitUntil: "networkidle",
      });
      await page.locator('[name="projectName"]').waitFor();
      const response = await page.request.get(
        manifest.origin + "/api/portal?view=/submission",
        {
          headers: {
            "oai-authenticated-user-id": actor.id,
            "oai-authenticated-user-email": actor.email,
          },
        },
      );
      const state = await response.json();
      assert.equal(response.status(), 200);
      assert.equal(state.project.id, extra.unpublishedProjectId);
      assert.equal(state.project.published_version_id, null);
      assert.equal(
        await page.locator('[name="projectName"]').inputValue(),
        "Synthetic unpublished draft",
      );
      assert.ok(await page.locator('[name="projectName"]').isDisabled());
      assert.equal(
        await page
          .locator(
            ".project-editor input:enabled,.project-editor textarea:enabled",
          )
          .count(),
        0,
      );
      assert.equal(
        await page
          .getByRole("button", { name: /^(Save draft|Submit|Update project)$/ })
          .count(),
        0,
      );
      const shot = join(output, `unpublished-nonleader-${mode}.png`);
      await page.screenshot({ path: shot, fullPage: true });
      report.screenshots.push({ path: shot, mode, inspected: false });
      report.checks.push({
        id: "unpublished-nonleader-readonly",
        mode,
        passed: true,
      });
      save();
      await page.goto(manifest.origin + "/projects/" + extra.deploymentSlug, {
        waitUntil: "networkidle",
      });
      const deployment = page.locator(
        `.public-project-detail a[href="${extra.deploymentUrl}"]`,
      );
      assert.equal(await deployment.count(), 1);
      const popup = context.waitForEvent("page");
      await activate(deployment);
      const child = await popup;
      let deadline;
      try {
        await Promise.race([
          deploymentBlocked,
          new Promise((_, reject) => {
            deadline = setTimeout(
              () => reject(new Error("Expected blocked deployment request")),
              12000,
            );
          }),
        ]);
      } finally {
        clearTimeout(deadline);
      }
      await child.close();
      assert.ok(
        report.expectedExternalBlocks.some(
          (e) => e.mode === mode && e.url === extra.deploymentUrl,
        ),
      );
      report.checks.push({
        id: "optional-deployment-link",
        mode,
        passed: true,
      });
      save();
    } catch (error) {
      report.checks.push({
        id: "mode",
        mode,
        passed: false,
        error: error.message,
      });
      save();
    } finally {
      await context.close();
    }
  }
  assert.equal(fingerprint(), manifest.worker);
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.blockedWrites, []);
  if (report.checks.some((check) => !check.passed)) process.exitCode = 1;
} finally {
  await browser.close();
  report.browserClosed = true;
  save();
}
console.log(
  JSON.stringify(
    {
      output,
      passed: report.checks.filter((c) => c.passed).length,
      failed: report.checks.filter((c) => !c.passed).length,
    },
    null,
    2,
  ),
);
