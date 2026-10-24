import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const origin = "http://127.0.0.1:3003";
const output = process.env.ADMIN_QA_OUTPUT || "evidence/redesign-admin";
mkdirSync(output, { recursive: true });
const report = {
  source: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  dirty: !!execFileSync("git", ["status", "--porcelain", "--", "app"], {
    encoding: "utf8",
  }).trim(),
  syntheticOnly: true,
  runtime: "Next.js development with independent synthetic fixture backend",
  browserSandbox: false,
  physicalDevice: false,
  screenshots: [],
  checks: [],
  errors: [],
  requests: [],
};
const save = () =>
  writeFileSync(`${output}/report.json`, JSON.stringify(report, null, 2));
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  headless: true,
  chromiumSandbox: false,
});
const check = (name) => {
  report.checks.push({ name, passed: true });
  save();
};
for (const viewport of [
  { width: 1440, height: 900 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
  { width: 390, height: 480 },
]) {
  const context = await browser.newContext({
    viewport,
    reducedMotion: "reduce",
    serviceWorkers: "block",
    ...(viewport.width === 390 ? { isMobile: true, hasTouch: true } : {}),
  });
  await context.addCookies([
    {
      name: "portal_local_fixture",
      value: "owner",
      url: origin,
      httpOnly: true,
      sameSite: "Strict",
    },
  ]);
  await context.route("**/*", (route) =>
    new URL(route.request().url()).origin === origin
      ? route.continue()
      : route.abort("blockedbyclient"),
  );
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on("pageerror", (error) =>
    report.errors.push({ viewport, error: error.message }),
  );
  page.on("request", (r) => {
    if (new URL(r.url()).pathname === "/api/portal")
      report.requests.push({ viewport, method: r.method(), url: r.url() });
  });
  async function capture(name) {
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: `${output}/${name}-${viewport.width}x${viewport.height}.png`,
      fullPage: true,
      animations: "disabled",
    });
    const overflowing = await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    );
    assert.equal(
      overflowing,
      false,
      `${name} horizontal overflow at ${viewport.width}`,
    );
    report.screenshots.push({
      name,
      viewport,
      path: `${output}/${name}-${viewport.width}x${viewport.height}.png`,
      inspected: false,
    });
    save();
  }
  try {
    await page.goto(`${origin}/admin/settings`, {
      waitUntil: "networkidle",
      timeout: 60000,
    });
    await page
      .getByRole("heading", { name: "Settings", exact: true })
      .waitFor();
    assert.equal(
      await page
        .getByText("Use a complete IST date and time.", { exact: true })
        .isVisible(),
      false,
    );
    await capture("settings-event");
    const settings = page.getByRole("tablist", { name: "Settings sections" });
    await settings.getByRole("tab", { name: "Results", exact: true }).click();
    await page
      .getByRole("heading", { name: "Results visibility", exact: true })
      .waitFor();
    await capture("settings-results");
    await settings.getByRole("tab", { name: "Access", exact: true }).click();
    await page
      .getByRole("heading", { name: "Admin access", exact: true })
      .waitFor();
    await capture("settings-access");
    await settings.getByRole("tab", { name: "Content", exact: true }).click();
    await page
      .getByRole("heading", { name: "Public event content", exact: true })
      .waitFor();
    await capture("settings-content-agenda");
    const content = page.getByRole("tablist", { name: "Event content" });
    await content.getByRole("tab", { name: "FAQ", exact: true }).click();
    await capture("settings-content-faq");
    await content.getByRole("tab", { name: "Rules", exact: true }).click();
    await capture("settings-content-rules");
    await settings.getByRole("tab", { name: "Event", exact: true }).focus();
    await page.keyboard.press("ArrowRight");
    assert.equal(
      await settings
        .getByRole("tab", { name: "Results", exact: true })
        .getAttribute("aria-selected"),
      "true",
    );
    check(`settings keyboard tabs ${viewport.width}x${viewport.height}`);
    await settings.getByRole("tab", { name: "Event", exact: true }).click();
    const closes = page.getByLabel("Closes (IST)", { exact: true });
    await closes.fill("");
    await closes.blur();
    assert.equal(await closes.getAttribute("aria-invalid"), "true");
    await capture("settings-date-error");
    await page.goto(`${origin}/admin/participants`, {
      waitUntil: "networkidle",
      timeout: 60000,
    });
    await page
      .getByRole("heading", { name: "Participants", exact: true })
      .waitFor();
    assert.equal(
      (await page.locator(".participants-table tbody tr").count()) > 0,
      true,
    );
    await capture("participants-populated");
    const search = page.getByRole("searchbox");
    await search.fill("zzz-no-synthetic-result");
    assert.equal(await page.locator(".participants-table tbody tr").count(), 0);
    await capture("participants-empty");
    await page
      .getByRole("button", { name: "Clear filters", exact: true })
      .click();
    assert.equal(await search.inputValue(), "");
    check(`participant search reset ${viewport.width}x${viewport.height}`);
    if (viewport.width === 390) {
      await page
        .getByRole("button", { name: "Participant filters", exact: true })
        .tap();
      await page
        .getByLabel("Personal status", { exact: true })
        .selectOption("registered");
      await capture("participants-filters");
      await page
        .getByRole("button", { name: "Clear filters", exact: true })
        .tap();
    }
    const importButton = page.getByRole("button", {
      name: "Add participants",
      exact: true,
    });
    await importButton.click();
    await page
      .getByRole("dialog", { name: "Add participants", exact: true })
      .waitFor();
    await capture("participants-add-dialog");
    await page.keyboard.press("Escape");
    await page
      .getByRole("dialog", { name: "Add participants", exact: true })
      .waitFor({ state: "hidden" });
    assert.equal(
      await importButton.evaluate((node) => node === document.activeElement),
      true,
    );
    await importButton.click();
    await page
      .getByRole("dialog", { name: "Add participants", exact: true })
      .waitFor();
    await page.waitForTimeout(50);
    await page.goBack();
    await page
      .getByRole("dialog", { name: "Add participants", exact: true })
      .waitFor({ state: "hidden" });
    assert.equal(new URL(page.url()).pathname, "/admin/participants");
    check(`import Escape Back focus ${viewport.width}x${viewport.height}`);
    const status = page.getByRole("button", {
      name: "Change Alice status",
      exact: true,
    });
    await status.click();
    await page
      .getByRole("dialog", { name: "Change Alice status", exact: true })
      .waitFor();
    await capture("participants-status-dialog");
    await page.keyboard.press("Escape");
    await page
      .getByRole("dialog", { name: "Change Alice status", exact: true })
      .waitFor({ state: "hidden" });
    assert.equal(
      await status.evaluate((node) => node === document.activeElement),
      true,
    );
    check(`status Escape focus ${viewport.width}x${viewport.height}`);
    await page.goto(`${origin}/admin/teams`, {
      waitUntil: "networkidle",
      timeout: 60000,
    });
    const team = page.locator(".admin-team-disclosure").first();
    await team.locator("summary").click();
    await capture("teams-expanded");
    await page.goto(`${origin}/admin/submissions`, {
      waitUntil: "networkidle",
      timeout: 60000,
    });
    await capture("submissions-empty");
    await page.goto(`${origin}/admin/credits`, {
      waitUntil: "networkidle",
      timeout: 60000,
    });
    await capture("credits");
    await page.goto(`${origin}/admin/logs`, {
      waitUntil: "networkidle",
      timeout: 60000,
    });
    await capture("logs-empty");
  } catch (error) {
    report.errors.push({ viewport, error: String(error.stack || error) });
    save();
  }
  await context.close();
}
await browser.close();
save();
console.log(
  JSON.stringify({
    report: `${output}/report.json`,
    checks: report.checks.length,
    captures: report.screenshots.length,
    errors: report.errors.length,
  }),
);
if (report.errors.length) process.exitCode = 1;
