// Real browser evidence against this branch and a fresh synthetic local fixture.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const phase = process.env.QA_PHASE || "before";
assert.ok(["before", "after"].includes(phase));
const origin = "http://localhost:3013";
const out = `evidence/submission-consent-row/${phase}`;
mkdirSync(out, { recursive: true });
const report = {
  phase,
  source: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  syntheticOnly: true,
  origin,
  backendPort: 8858,
  screenshots: [],
  checks: [],
  errors: [],
  writes: [],
};
const save = () =>
  writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 2) + "\n");
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  headless: true,
  chromiumSandbox: false,
});
const shot = async (page, name, fullPage = false) => {
  const path = `${out}/${name}.png`;
  await page.screenshot({
    path,
    fullPage,
    animations: "disabled",
    style: "nextjs-portal{visibility:hidden!important}",
  });
  report.screenshots.push({
    path,
    sha256: createHash("sha256").update(readFileSync(path)).digest("hex"),
  });
  save();
};
const editor = async (page) => {
  await page.goto(origin + "/dashboard#project", {
    waitUntil: "networkidle",
    timeout: 120000,
  });
  await page.getByRole("tab", { name: "Project", exact: true }).click();
  await page
    .getByRole("button", { name: "Update project", exact: true })
    .click();
  await page.locator('.submission-v6[data-hydrated="true"]').waitFor();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
};
try {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
    { width: 320, height: 480 },
  ]) {
    const context = await browser.newContext({
      viewport,
      reducedMotion: "reduce",
      isMobile: viewport.width < 768,
      hasTouch: viewport.width < 768,
    });
    await context.addCookies([
      {
        name: "portal_local_fixture",
        value: "alice",
        url: origin,
        httpOnly: true,
        sameSite: "Strict",
      },
    ]);
    await context.route("**/*", (route) => {
      const req = route.request();
      if (new URL(req.url()).origin !== origin) return route.abort();
      if (!["GET", "HEAD"].includes(req.method())) {
        report.writes.push({ method: req.method(), body: req.postDataJSON() });
        return route.abort();
      }
      return route.continue();
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => report.errors.push(error.message));
    await editor(page);
    const name = `${viewport.width}x${viewport.height}`;
    await page
      .locator("#submission-attestation-control")
      .scrollIntoViewIfNeeded();
    await shot(page, `step3-${name}`);
    await shot(page, `step3-full-${name}`, true);
    report.checks.push({
      name: `${name} actual final step captured`,
      passed: true,
    });
    if (phase === "after") await checkFinalStep(page, name, viewport);
    await context.close();
  }
  if (phase === "after") await checkMotion();
  assert.equal(report.writes.length, 0);
  assert.equal(report.errors.length, 0);
} catch (error) {
  report.failure = String(error.stack || error);
  process.exitCode = 1;
} finally {
  await browser.close();
  save();
}
console.log(
  JSON.stringify({
    phase,
    checks: report.checks.length,
    screenshots: report.screenshots.length,
    failure: report.failure,
  }),
);

async function checkFinalStep(page, name, viewport) {
  const metrics = await page.evaluate(() => {
    const box = (selector) => {
      const r = document.querySelector(selector).getBoundingClientRect();
      return {
        x: r.x,
        y: r.y,
        width: r.width,
        height: r.height,
        bottom: r.bottom,
      };
    };
    const button = document.querySelector(".submission-submit");
    const style = getComputedStyle(button);
    const dots = document.querySelector(".submission-dots");
    return {
      checkbox: box("#submission-attestation-control"),
      row: box(".submission-attestation-wrap"),
      banner: box(".submission-media-field-banner"),
      logo: box(".submission-media-field-logo"),
      media: box(".submission-media"),
      actions: box(".submission-actions"),
      form: box(".project-editor"),
      dots: box(".submission-dots"),
      decorationInForm: !!dots.closest("form"),
      decorationPointerEvents: getComputedStyle(dots).pointerEvents,
      decorationAriaHidden: dots.getAttribute("aria-hidden"),
      motion: dots.dataset.motion,
      running: dots.dataset.running,
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: innerWidth,
      background: style.backgroundColor,
      foreground: style.color,
    };
  });
  assert.ok(
    metrics.checkbox.width >= 44 && metrics.checkbox.height >= 44,
    "44px checkbox",
  );
  assert.ok(
    metrics.row.y >= Math.max(metrics.banner.bottom, metrics.logo.bottom) - 1,
    "Accuracy is below both media blocks",
  );
  assert.ok(
    Math.abs(metrics.row.width - metrics.media.width) < 1,
    "Accuracy spans both columns",
  );
  assert.ok(metrics.actions.y >= metrics.row.bottom - 1);
  assert.ok(
    metrics.dots.y >= metrics.form.bottom + 16,
    "Dots remain below form and actions",
  );
  assert.equal(metrics.decorationInForm, false);
  assert.equal(metrics.decorationPointerEvents, "none");
  assert.equal(metrics.decorationAriaHidden, "true");
  assert.equal(metrics.motion, "static");
  assert.equal(metrics.running, "false");
  assert.ok(
    metrics.documentWidth <= metrics.viewportWidth + 1,
    "No horizontal overflow",
  );
  const luminance = (rgb) =>
    rgb
      .match(/\d+/g)
      .slice(0, 3)
      .map(Number)
      .map((x) => x / 255)
      .map((x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4))
      .reduce((sum, x, i) => sum + x * [0.2126, 0.7152, 0.0722][i], 0);
  const ratio =
    (luminance(metrics.foreground) + 0.05) /
    (luminance(metrics.background) + 0.05);
  assert.ok(ratio >= 4.5, "Green primary text contrast");
  const checkbox = page.locator("#submission-attestation-control");
  await checkbox.focus();
  await page.keyboard.press("Space");
  assert.equal(
    await checkbox.isChecked(),
    false,
    "Keyboard toggles native checkbox",
  );
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await page.locator("#submission-attestation-error").waitFor();
  assert.equal(await checkbox.getAttribute("aria-invalid"), "true");
  assert.equal(
    await checkbox.evaluate((node) => node === document.activeElement),
    true,
    "Validation focuses accuracy checkbox",
  );
  await shot(page, `accuracy-error-${name}`);
  const label = page.locator(".submission-attestation");
  const labelBox = await label.boundingBox();
  await label.click({
    position: { x: labelBox.width - 8, y: labelBox.height / 2 },
  });
  assert.equal(
    await checkbox.isChecked(),
    true,
    "Entire consent row is a click target",
  );
  await checkbox.focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  assert.equal(
    await page
      .locator(".submission-submit")
      .evaluate((node) => node === document.activeElement),
    true,
  );
  assert.ok(
    await page
      .locator(".submission-submit")
      .evaluate((node) => getComputedStyle(node).outlineStyle !== "none"),
    "Primary focus indicator",
  );
  await page.keyboard.press("Enter");
  await page.locator(".confirmation-dialog[open]").waitFor();
  assert.equal(await page.locator(".submission-submit").isDisabled(), true);
  assert.equal(
    await page.locator(".submission-submit").getAttribute("aria-busy"),
    "true",
  );
  assert.match(
    await page.locator(".submission-submit").innerText(),
    /Submitting/,
  );
  await shot(page, `confirmation-${name}`);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Submit", exact: true }).waitFor();
  assert.equal(await page.locator(".submission-submit").isEnabled(), true);
  const state = await (
    await page.request.get(origin + "/api/portal?view=%2Fdashboard")
  ).json();
  assert.equal(
    state.submissionAccess.attemptsUsed,
    2,
    "Validation and cancellation consume no attempt",
  );
  report.checks.push({
    name: `${name} full-width accuracy row, target, focus, validation, green contrast, cancellation, static dots and no overflow`,
    passed: true,
    contrast: ratio,
    metrics,
  });
  save();
}

async function checkMotion() {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: "no-preference",
  });
  await context.addCookies([
    { name: "portal_local_fixture", value: "alice", url: origin },
  ]);
  await context.route("**/*", (route) =>
    new URL(route.request().url()).origin !== origin ||
    !["GET", "HEAD"].includes(route.request().method())
      ? route.abort()
      : route.continue(),
  );
  const page = await context.newPage();
  await editor(page);
  const dots = page.locator(".submission-dots");
  await dots.scrollIntoViewIfNeeded();
  await page.waitForFunction(
    () =>
      document.querySelector(".submission-dots").dataset.motion ===
      "interactive",
  );
  const first = dots.locator(".submission-dot").first();
  const b = await first.boundingBox();
  await page.mouse.move(b.x + b.width * 0.75, b.y + b.height * 0.25);
  await page.waitForFunction(() =>
    document
      .querySelector(".submission-dot")
      .style.translate.split(" ")
      .some((value) => Math.abs(parseFloat(value)) > 0.5),
  );
  const moved = await first.evaluate((node) => node.style.translate);
  await shot(page, "fine-pointer-repel");
  // Headless Chromium keeps all tabs visible. Exercise the same visibility API
  // event explicitly; this is a controlled lifecycle check, not a hidden-tab screenshot.
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  assert.equal(await dots.getAttribute("data-motion"), "static");
  assert.equal(await dots.getAttribute("data-running"), "false");
  await page.evaluate(() => {
    delete document.hidden;
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.mouse.move(0, 0);
  await page.waitForFunction(
    () =>
      document.querySelector(".submission-dots").dataset.running === "false",
  );
  assert.match(
    await first.evaluate((node) => node.style.translate),
    /^0px(?: 0px)?$/,
  );
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForFunction(
    () =>
      document.querySelector(".submission-dots").dataset.motion === "static",
  );
  assert.equal(
    await dots.getAttribute("data-running"),
    "false",
    "Offscreen pauses",
  );
  await dots.scrollIntoViewIfNeeded();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.waitForFunction(
    () =>
      document.querySelector(".submission-dots").dataset.motion === "static",
  );
  assert.equal(await dots.getAttribute("data-running"), "false");
  report.checks.push({
    name: "Fine pointer repels and settles; offscreen/reduced motion pause; controlled document.hidden visibility event stops animation",
    passed: true,
    moved,
  });
  save();
  await context.close();
}
