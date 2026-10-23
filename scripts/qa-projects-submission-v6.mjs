// Prepared only until root confirms a matching disposable rich local preview.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
if (!process.argv.includes("--preview-ready")) {
  console.log(
    "Prepared only. Set V6_SOURCE, V6_WORKER_SHA and V6_ARTIFACT_ROOT after the matching synthetic preview is ready, then pass --preview-ready.",
  );
  process.exit(0);
}
const source = process.env.V6_SOURCE,
  worker = process.env.V6_WORKER_SHA;
assert.match(source || "", /^[a-f0-9]{40}$/);
assert.match(worker || "", /^[a-f0-9]{64}$/);
const artifact = resolve(process.env.V6_ARTIFACT_ROOT || ".");
const hash = () =>
  createHash("sha256")
    .update(readFileSync(join(artifact, "dist/server/index.js")))
    .digest("hex");
assert.equal(hash(), worker);
assert.equal(
  execFileSync("git", ["-C", artifact, "rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  source,
);
const base = "http://127.0.0.1:4173";
mkdirSync("evidence/v6-projects-submission", { recursive: true });
const output = mkdtempSync(
  "evidence/v6-projects-submission/" + source.slice(0, 8) + "-",
);
const report = {
  source,
  worker,
  artifact,
  output,
  syntheticOnly: true,
  sandbox: true,
  checks: [],
  screenshots: [],
  errors: [],
  blocked: [],
};
const save = () =>
  writeFileSync(join(output, "report.json"), JSON.stringify(report, null, 2));
const { chromium } =
  await import("/tmp/ddehack-playwright-runner/node_modules/playwright/index.mjs");
const browser = await chromium.launch({
  headless: true,
  chromiumSandbox: true,
});
async function context(actor, viewport) {
  const c = await browser.newContext({ viewport, serviceWorkers: "block" });
  await c.route("**/*", (route) => {
    const request = route.request();
    if (
      new URL(request.url()).origin !== base ||
      !["GET", "HEAD"].includes(request.method())
    ) {
      report.blocked.push({
        method: request.method(),
        external: new URL(request.url()).origin !== base,
      });
      return route.abort("blockedbyclient");
    }
    return route.continue({
      headers: {
        ...request.headers(),
        ...(actor
          ? {
              "oai-authenticated-user-id": "fake_" + actor,
              "oai-authenticated-user-email": actor + "@portal.test",
            }
          : {}),
      },
    });
  });
  return c;
}
async function shot(page, name, viewport) {
  await page.evaluate(() => document.fonts.ready);
  const path = join(output, `${name}-${viewport.width}x${viewport.height}.png`);
  await page.screenshot({
    path,
    fullPage: !name.startsWith("projects-"),
    animations: "disabled",
  });
  report.screenshots.push({ name, path, viewport, inspected: false });
  save();
}
async function bounds(page) {
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
    "no horizontal spill",
  );
}
try {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 834, height: 1194 },
    { width: 390, height: 844 },
    { width: 320, height: 740 },
  ]) {
    for (const actor of process.argv.includes("--wizard-only")
      ? []
      : ["bob", "stranger", null]) {
      const c = await context(actor, viewport),
        page = await c.newPage();
      page.on("pageerror", (error) =>
        report.errors.push({ actor, viewport, error: error.message }),
      );
      try {
        await page.goto(base + "/projects", { waitUntil: "networkidle" });
        await page.locator(".public-project-list").waitFor();
        await bounds(page);
        assert.equal(
          await page.locator(".project-list .row-banner").count(),
          0,
        );
        assert.ok(await page.locator(".project-list .row-logo").count());
        await shot(page, `projects-${actor || "anonymous"}`, viewport);
        await page.goto(base + "/projects/synthetic-alice", {
          waitUntil: "networkidle",
        });
        await page.locator(".public-project-detail").waitFor();
        await bounds(page);
        assert.equal(await page.locator(".project-banner").count(), 1);
        if (actor === "stranger") {
          assert.equal(
            await page.locator(".upvote-button:not([disabled])").count(),
            0,
          );
          assert.equal(
            await page.locator(".project-comment-composer").count(),
            0,
          );
        }
        if (actor === "bob")
          assert.equal(
            await page.locator(".project-comment-composer").count(),
            1,
          );
        await shot(page, `detail-${actor || "anonymous"}`, viewport);
        report.checks.push({
          name: "public list/detail permissions and bounds",
          actor,
          viewport,
          passed: true,
        });
      } finally {
        await c.close();
      }
    }
    if (process.argv.includes("--projects-only")) continue;
    const c = await context("alice", viewport),
      page = await c.newPage();
    page.on("pageerror", (error) =>
      report.errors.push({ actor: "alice", viewport, error: error.message }),
    );
    try {
      await page.goto(base + "/dashboard#project", {
        waitUntil: "networkidle",
      });
      await page.getByRole("tab", { name: "Project", exact: true }).click();
      const update = page.getByRole("button", {
        name: "Update project",
        exact: true,
      });
      if (await update.count()) await update.click();
      await page.locator(".submission-v6").waitFor();
      await bounds(page);
      assert.equal(
        await page.locator(".submission-stage:not([hidden])").count(),
        1,
      );
      assert.equal(
        await page.locator('.submission-stage[data-step="1"]').isVisible(),
        true,
      );
      assert.equal(
        await page.locator('input[name="github"]').isVisible(),
        false,
      );
      await shot(page, "wizard-1-essentials", viewport);
      await page.getByRole("button", { name: /^Next/ }).click();
      assert.equal(
        await page.locator("dialog[open]").count(),
        0,
        "Next must never open a mutation confirmation",
      );
      assert.equal(
        await page.locator('.submission-stage[data-step="2"]').isVisible(),
        true,
      );
      assert.equal(
        await page
          .locator(".submission-ecosystem-options input[type=checkbox]")
          .count(),
        6,
      );
      await page
        .getByRole("radio", { name: "Yes", exact: true })
        .locator("..")
        .click();
      await page
        .getByRole("button", { name: "Previous submission step" })
        .click();
      await page.getByRole("button", { name: /^Next/ }).click();
      assert.equal(
        await page.locator("dialog[open]").count(),
        0,
        "Next must never open a mutation confirmation",
      );
      assert.equal(
        await page.getByRole("radio", { name: "Yes", exact: true }).isChecked(),
        true,
      );
      await shot(page, "wizard-2-integrations", viewport);
      await page.getByRole("button", { name: /^Next/ }).click();
      assert.equal(
        await page.locator("dialog[open]").count(),
        0,
        "Next must never open a mutation confirmation",
      );
      assert.equal(
        await page.locator('.submission-stage[data-step="3"]').isVisible(),
        true,
      );
      await shot(page, "wizard-3-images", viewport);
      const image = page.locator("img.upload-preview.logo"),
        original = await image.getAttribute("src");
      await page.getByRole("button", { name: "Remove logo image" }).click();
      assert.equal(await image.count(), 0);
      await page.getByLabel("Upload logo", { exact: true }).setInputFiles({
        name: "synthetic-logo.png",
        mimeType: "image/png",
        buffer: Buffer.from(original.split(",")[1], "base64"),
      });
      await image.waitFor();
      const accuracy = page.getByRole("checkbox", {
        name: "I confirm this submission is accurate.",
        exact: true,
      });
      await accuracy.uncheck();
      await page.getByRole("button", { name: "Submit", exact: true }).click();
      assert.equal(await page.locator("dialog[open]").count(), 0);
      await accuracy.check();
      await shot(page, "wizard-3-accuracy-validation", viewport);
      await page.getByRole("button", { name: "Submit", exact: true }).click();
      const dialog = page.locator("dialog[open]");
      await dialog.waitFor();
      await shot(page, "wizard-final-confirmation-cancel", viewport);
      await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
      await dialog.waitFor({ state: "hidden" });
      await bounds(page);
      report.checks.push({
        name: "three steps, state retention, exact tools, media replace, accuracy, final Cancel",
        actor: "alice",
        viewport,
        passed: true,
      });
    } finally {
      await c.close();
    }
  }
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.blocked, []);
  assert.equal(hash(), worker);
} catch (error) {
  report.failure = String(error.stack || error);
  process.exitCode = 1;
} finally {
  await browser.close();
  report.browserClosed = true;
  save();
}
console.log(
  JSON.stringify({
    output,
    checks: report.checks.length,
    screenshots: report.screenshots.length,
    failure: report.failure || null,
  }),
);
