// Targeted read-only regression run. Never permits any POST, regardless of flags.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

if (!process.argv.includes("--preview-ready")) {
  console.log(
    "Prepared only. Set V6_CONTROL_MANIFEST to the new matching artifact manifest and pass --preview-ready. This runner is always read-only.",
  );
  process.exit(0);
}
assert.ok(
  !process.argv.includes("--mutations"),
  "Targeted recovery runner cannot enable writes",
);
const manifest = JSON.parse(
  readFileSync(process.env.V6_CONTROL_MANIFEST || "", "utf8"),
);
assert.equal(manifest.syntheticOnly, true);
assert.equal(manifest.disposable, true);
assert.match(manifest.origin, /^http:\/\/127\.0\.0\.1:\d{4,5}$/);
assert.ok(
  Number(new URL(manifest.origin).port) >= 1024 &&
    Number(new URL(manifest.origin).port) <= 65535,
);
assert.match(manifest.source, /^[a-f0-9]{40}$/);
assert.match(manifest.worker, /^[a-f0-9]{64}$/);
const artifact = resolve(manifest.artifactRoot);
const fingerprint = () =>
  createHash("sha256")
    .update(readFileSync(join(artifact, "dist/server/index.js")))
    .digest("hex");
assert.equal(fingerprint(), manifest.worker);
assert.equal(
  execFileSync("git", ["-C", artifact, "rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  manifest.source,
);
for (const role of ["leader", "firstLeader"]) {
  assert.match(manifest.actors[role]?.id || "", /^fake_/);
  assert.match(manifest.actors[role]?.email || "", /^[^@]+@[^@]+\.test$/);
}
const modes = [
  {
    name: "desktop-mouse",
    viewport: { width: 1440, height: 900 },
    pointer: "mouse",
  },
  {
    name: "tablet-touch",
    viewport: { width: 834, height: 1194 },
    pointer: "touch",
  },
  {
    name: "mobile-touch",
    viewport: { width: 390, height: 844 },
    pointer: "touch",
  },
  {
    name: "narrow-touch",
    viewport: { width: 320, height: 740 },
    pointer: "touch",
  },
  {
    name: "desktop-keyboard",
    viewport: { width: 1440, height: 900 },
    pointer: "keyboard",
  },
];
const chosen = process.argv
  .find((arg) => arg.startsWith("--device="))
  ?.slice(9);
const devices = chosen ? modes.filter((mode) => mode.name === chosen) : modes;
assert.ok(devices.length, "Unknown device mode");
mkdirSync("evidence/v6-project-recovery", { recursive: true });
const output = mkdtempSync(
  "evidence/v6-project-recovery/" + manifest.source.slice(0, 8) + "-",
);
const report = {
  source: manifest.source,
  worker: manifest.worker,
  artifact,
  output,
  readOnly: true,
  physicalDeviceTested: false,
  checks: [],
  screenshots: [],
  errors: [],
  blocked: [],
};
const save = () =>
  writeFileSync(join(output, "report.json"), JSON.stringify(report, null, 2));
const { chromium } = await import("@playwright/test");
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  chromiumSandbox: true,
});
async function check(id, mode, fn) {
  try {
    await fn();
    report.checks.push({ id, mode: mode.name, passed: true });
  } catch (error) {
    report.checks.push({
      id,
      mode: mode.name,
      passed: false,
      error: error.message,
    });
  }
  save();
}
async function session(role, mode) {
  const actor = manifest.actors[role];
  const context = await browser.newContext({
    viewport: mode.viewport,
    hasTouch: mode.pointer === "touch",
    isMobile: mode.pointer === "touch",
    serviceWorkers: "block",
  });
  await context.route("**/*", (route) => {
    const request = route.request(),
      url = new URL(request.url());
    if (
      url.origin !== manifest.origin ||
      !["GET", "HEAD"].includes(request.method())
    ) {
      report.blocked.push({
        mode: mode.name,
        role,
        method: request.method(),
        external: url.origin !== manifest.origin,
      });
      return route.abort("blockedbyclient");
    }
    return route.continue({
      headers: {
        ...request.headers(),
        "oai-authenticated-user-id": actor.id,
        "oai-authenticated-user-email": actor.email,
      },
    });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  page.on("pageerror", (error) =>
    report.errors.push({ mode: mode.name, role, error: error.message }),
  );
  return { role, mode, context, page };
}
async function tabTo(s, locator) {
  for (let n = 0; n < 120; n++) {
    if (await locator.evaluate((el) => el === document.activeElement)) {
      assert.ok(
        await locator.evaluate((el) => {
          const a = getComputedStyle(el),
            b = getComputedStyle(el.parentElement);
          return (
            a.outlineStyle !== "none" ||
            a.boxShadow !== "none" ||
            b.outlineStyle !== "none"
          );
        }),
        "Visible keyboard focus",
      );
      return;
    }
    await s.page.keyboard.press("Tab");
  }
  throw new Error(`Tab did not reach ${locator}`);
}
async function activate(s, locator, key = "Enter") {
  if (s.mode.pointer === "keyboard") {
    await tabTo(s, locator);
    await s.page.keyboard.press(key);
  } else if (s.mode.pointer === "touch") await locator.tap();
  else await locator.click();
}
async function fill(s, locator, text) {
  if (s.mode.pointer === "keyboard") {
    await tabTo(s, locator);
    await s.page.keyboard.press("ControlOrMeta+A");
    await s.page.keyboard.press("Backspace");
    if (text) await s.page.keyboard.type(text);
  } else {
    if (s.mode.pointer === "touch") await locator.tap();
    await locator.fill(text);
  }
}
async function open(s) {
  const url = manifest.origin + "/dashboard#project";
  if (s.page.url() === url) await s.page.reload({ waitUntil: "networkidle" });
  else await s.page.goto(url, { waitUntil: "networkidle" });
  await s.page.evaluate(() => document.fonts.ready);
  const editor = s.page.locator(".submission-v6");
  if ((await editor.count()) && (await editor.isVisible())) return;
  await activate(s, s.page.getByRole("tab", { name: "Project", exact: true }));
  const update = s.page.getByRole("button", {
    name: "Update project",
    exact: true,
  });
  await activate(s, update);
  await editor.waitFor();
}
async function next(s) {
  await activate(s, s.page.getByRole("button", { name: /^Next/ }));
  assert.equal(
    await s.page.locator("dialog[open]").count(),
    0,
    "Next cannot open a mutation dialog",
  );
}
async function shot(s, label) {
  const path = join(output, `${label}-${s.role}-${s.mode.name}.png`);
  await s.page.screenshot({ path, fullPage: true, animations: "disabled" });
  report.screenshots.push({
    label,
    role: s.role,
    mode: s.mode.name,
    path,
    inspected: false,
  });
  save();
}
try {
  for (const mode of devices) {
    const s = await session("leader", mode);
    try {
      await check("essentials-validation-recovery", mode, async () => {
        await open(s);
        await shot(s, "clean-step1");
        const field = s.page.locator(
            '.submission-v6 input[name="projectName"]',
          ),
          original = await field.inputValue();
        await fill(s, field, "");
        await next(s);
        const alert = s.page
          .getByRole("alert")
          .filter({ hasText: "Add a project name, summary and description." });
        await alert.waitFor();
        await fill(s, field, original);
        assert.equal(await alert.count(), 0);
        await shot(s, "essentials-corrected");
      });
      await check("github-validation-recovery", mode, async () => {
        await open(s);
        await next(s);
        const field = s.page.locator('.submission-v6 input[name="github"]'),
          original = await field.inputValue();
        await fill(s, field, "https://example.test/invalid");
        await next(s);
        const alert = s.page
          .getByRole("alert")
          .filter({ hasText: "Add your GitHub repository." });
        await alert.waitFor();
        await fill(s, field, original);
        assert.equal(await alert.count(), 0);
        await shot(s, "github-corrected");
      });
      await check("native-radio-and-back-state", mode, async () => {
        await open(s);
        await next(s);
        const group = s.page.locator(".submission-v6").getByRole("radio");
        assert.equal(await group.count(), 2);
        for (const label of ["Yes", "No"]) {
          const desired = s.page.getByRole("radio", {
            name: label,
            exact: true,
          });
          if (mode.pointer === "keyboard") {
            const checked = s.page
              .locator(".submission-v6")
              .getByRole("radio", { checked: true });
            await tabTo(
              s,
              (await checked.count()) ? checked.first() : group.first(),
            );
            for (let n = 0; n < 2 && !(await desired.isChecked()); n++)
              await s.page.keyboard.press("ArrowRight");
          } else await activate(s, desired.locator(".."));
          assert.equal(await desired.isChecked(), true);
        }
        await activate(
          s,
          s.page.getByRole("button", {
            name: "Previous submission step",
            exact: true,
          }),
        );
        await next(s);
        assert.equal(
          await s.page
            .getByRole("radio", { name: "No", exact: true })
            .isChecked(),
          true,
        );
        await shot(s, "radio-back-state");
      });
      await check("accuracy-validation-recovery", mode, async () => {
        await open(s);
        await next(s);
        await next(s);
        await shot(s, "clean-step3");
        const accuracy = s.page.getByRole("checkbox", {
          name: "I confirm this submission is accurate.",
          exact: true,
        });
        if (await accuracy.isChecked()) await activate(s, accuracy, "Space");
        await activate(
          s,
          s.page.getByRole("button", { name: "Submit", exact: true }),
        );
        const alert = s.page
          .getByRole("alert")
          .filter({ hasText: "Confirm this submission is accurate." });
        await alert.waitFor();
        await activate(s, accuracy, "Space");
        assert.equal(await alert.count(), 0);
        await shot(s, "accuracy-corrected");
      });
      await check("published-first-back-focus", mode, async () => {
        await open(s);
        await activate(
          s,
          s.page.getByRole("button", {
            name: "Back to your project",
            exact: true,
          }),
        );
        await s.page
          .getByRole("button", { name: "Update project", exact: true })
          .waitFor();
        await s.page.waitForFunction(
          () => document.activeElement?.id === "dashboard-project-edit",
        );
        assert.equal(await s.page.locator(".submission-v6").count(), 0);
      });
    } finally {
      await s.context.close();
    }
    const first = await session("firstLeader", mode);
    try {
      await check("unpublished-first-back-focus", mode, async () => {
        await open(first);
        await shot(first, "clean-first-submission");
        await activate(
          first,
          first.page.getByRole("button", { name: "Back to Team", exact: true }),
        );
        await first.page
          .locator('#dashboard-tab-team[aria-selected="true"]')
          .waitFor();
        assert.equal(
          await first.page.locator(".submission-v6").isVisible(),
          false,
        );
        await first.page.waitForFunction(
          () => document.activeElement?.id === "dashboard-tab-team",
        );
        await shot(first, "first-back-team");
        await open(first);
        await first.page.locator(".submission-v6").waitFor();
      });
    } finally {
      await first.context.close();
    }
  }
  assert.equal(fingerprint(), manifest.worker);
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.blocked, []);
  if (report.checks.some((check) => !check.passed)) process.exitCode = 1;
} catch (error) {
  report.failure = String(error.stack || error);
  process.exitCode = 1;
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
      screenshots: report.screenshots.length,
      browserClosed: report.browserClosed,
    },
    null,
    2,
  ),
);
