// Bounded read-only check of the real TeamStudio fixture. No domain mutations.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, expect } from "@playwright/test";
const source = process.env.TEAM_STUDIO_QA_SOURCE;
assert.match(
  source || "",
  /^[0-9a-f]{40}$/,
  "An explicit final source SHA is required",
);
const cwd = "/workspace/ddd-team-studio",
  origin = "http://localhost:3003";
const verify = () =>
  execFileSync(
    "git",
    ["diff", "--quiet", source, "--", "app", "lib", "next.config.ts"],
    { cwd },
  );
verify();
const out = resolve("evidence/team-studio-independent/read-only");
mkdirSync(out, { recursive: true });
const report = {
  source,
  origin,
  readOnly: true,
  device: "Chromium mobile emulation, not a physical device",
  viewport: { width: 320, height: 480 },
  startedAt: new Date().toISOString(),
  checks: [],
  captures: [],
  blocked: [],
  pageErrors: [],
};
const save = () =>
  writeFileSync(
    resolve(out, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
const check = (name, passed, details = {}) => {
  report.checks.push({ name, passed, ...details });
  save();
  assert.ok(passed, name);
};
let browser, context, page;
async function shot(name, fullPage = false) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      Array.from(document.images).map((img) => img.decode().catch(() => {})),
    );
  });
  const path = resolve(out, name + ".png");
  await page.screenshot({
    path,
    fullPage,
    animations: "disabled",
    style: "nextjs-portal{visibility:hidden!important}",
  });
  report.captures.push({
    file: name + ".png",
    fullPage,
    source,
    inspected: false,
  });
  save();
}
async function focused(label) {
  return page.evaluate(
    (label) => document.activeElement?.getAttribute("aria-label") === label,
    label,
  );
}
async function overflow() {
  return page.evaluate(() => ({
    innerWidth,
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    scrollY,
  }));
}
try {
  browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    headless: true,
    chromiumSandbox: false,
  });
  context = await browser.newContext({
    viewport: report.viewport,
    isMobile: true,
    hasTouch: true,
    reducedMotion: "reduce",
    serviceWorkers: "block",
  });
  await context.addCookies([
    { name: "portal_local_fixture", value: "bob", url: origin },
  ]);
  await context.route("**/*", (route) => {
    const r = route.request(),
      u = new URL(r.url());
    if (
      u.origin !== origin ||
      (!["GET", "HEAD"].includes(r.method()) &&
        !u.pathname.startsWith("/__nextjs_"))
    ) {
      report.blocked.push({ method: r.method(), path: u.pathname });
      save();
      return route.abort("blockedbyclient");
    }
    return route.continue();
  });
  page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on("pageerror", (error) => {
    report.pageErrors.push(error.message);
    save();
  });
  await page.goto(origin + "/dashboard", {
    waitUntil: "networkidle",
    timeout: 60000,
  });
  await page.locator('.app-shell[data-hydrated="true"]').waitFor();
  await page.locator(".studio-team").waitFor();
  const facts = await page.evaluate(async () => {
    const response = await fetch("/api/portal?view=%2Fdashboard");
    const d = await response.json();
    return {
      status: response.status,
      localTest: d.localTest,
      actor: d.me?.id,
      locked: d.team?.locked,
      members: d.members?.length,
      ideaLength: d.idea?.description?.length,
    };
  });
  report.fixture = facts;
  save();
  check(
    "Isolated fixture is a real local unlocked leader workspace",
    facts.status === 200 &&
      facts.localTest === true &&
      facts.actor === "fake_bob" &&
      !facts.locked,
  );
  let dimensions = await overflow();
  check(
    "320 short viewport has no horizontal overflow",
    dimensions.scrollWidth <= dimensions.innerWidth,
    dimensions,
  );
  await shot("01-team-320-short");
  const identity = page.getByRole("button", {
    name: "Edit team name and color",
    exact: true,
  });
  const heroBefore = await page.locator(".studio-team-identity").boundingBox();
  await identity.tap();
  const dialog = page.locator("dialog.studio-dialog");
  await dialog.waitFor();
  const heroOpen = await page.locator(".studio-team-identity").boundingBox();
  check(
    "Opening identity preserves background horizontal geometry",
    Math.abs(heroBefore.x - heroOpen.x) < 1 &&
      Math.abs(heroBefore.width - heroOpen.width) < 1,
    { before: heroBefore, after: heroOpen },
  );
  await shot("02-identity-320-short");
  const before = await overflow();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: 4, y: 420 }],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: 4, y: 180 }],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await cdp.detach();
  await page.waitForTimeout(150);
  const after = await overflow();
  check(
    "Touch drag on identity backdrop keeps background scroll fixed",
    Math.abs(after.scrollY - before.scrollY) < 1,
    { before: before.scrollY, after: after.scrollY },
  );
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "detached" });
  await expect(identity).toBeFocused();
  check(
    "Touch-open identity Escape restores opener focus",
    await focused("Edit team name and color"),
  );
  await identity.tap();
  await dialog.waitFor();
  await page.goBack();
  await dialog.waitFor({ state: "detached" });
  await expect(identity).toBeFocused();
  check(
    "Browser Back closes identity and preserves dashboard/focus",
    new URL(page.url()).pathname === "/dashboard" &&
      (await focused("Edit team name and color")),
  );
  const invite = page.getByRole("button", {
    name: "Invite member",
    exact: true,
  });
  await invite.tap();
  await dialog.waitFor();
  await shot("03-invite-320-short");
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "detached" });
  await expect(invite).toBeFocused();
  check(
    "Touch-open invite Escape restores opener focus",
    await invite.evaluate((node) => document.activeElement === node),
  );
  const edit = page.getByRole("button", {
    name: "Edit team idea",
    exact: true,
  });
  await edit.tap();
  const description = page.getByRole("textbox", {
    name: "Description",
    exact: true,
  });
  const savedDescription = await description.inputValue();
  await description.fill(savedDescription + " Read-only layout check.");
  check(
    "Client-only dirty idea hides Saved and disables lock",
    (await page.locator(".studio-saved").count()) === 0 &&
      (await page
        .getByRole("button", { name: "Review & lock team", exact: true })
        .isDisabled()),
  );
  await page.getByRole("button", { name: "Cancel", exact: true }).tap();
  await page.locator(".studio-saved").waitFor();
  check(
    "Cancel restores persisted idea/count without a save",
    (await page.locator("#studio-idea-count").textContent()) ===
      savedDescription.length + "/500",
  );
  await page.locator(".studio-next").scrollIntoViewIfNeeded();
  await shot("04-next-320-short");
  dimensions = await overflow();
  check(
    "Lower Next/timeline controls stay inside320",
    dimensions.scrollWidth <= dimensions.innerWidth,
    dimensions,
  );
  const team = page.getByRole("tab", { name: "Team", exact: true });
  await team.focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("tab", { name: "Credits", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ArrowLeft");
  await expect(team).toHaveAttribute("aria-selected", "true");
  check("Keyboard tabs move Team to Credits and back without mutation", true);
  const hitboxes = await page
    .locator(
      ".studio-member-links>a,.studio-member-links .studio-remove,.studio-team-name>div>.studio-icon-button,.studio-idea-title>.studio-icon-button,.studio-invite,.studio-next .button",
    )
    .evaluateAll((elements) =>
      elements.map((e) => {
        const r = e.getBoundingClientRect();
        return {
          name: e.getAttribute("aria-label") || e.textContent?.trim(),
          width: r.width,
          height: r.height,
        };
      }),
    );
  check(
    "Actual current controls have44px minimum targets",
    hitboxes.every((x) => x.width >= 44 && x.height >= 44),
    { hitboxes },
  );
  verify();
  check(
    "No domain mutation/external request or page error occurred",
    report.blocked.length === 0 && report.pageErrors.length === 0,
  );
  report.result = "passed";
} catch (error) {
  report.result = "failed";
  report.failure = String(error.stack || error);
  if (page && !page.isClosed()) {
    try {
      await shot("FAIL-current-ui");
    } catch {}
  }
  process.exitCode = 1;
} finally {
  await context?.close();
  await browser?.close();
  report.browserClosed = true;
  report.finishedAt = new Date().toISOString();
  save();
}
console.log(
  JSON.stringify(
    {
      source: report.source,
      result: report.result,
      checks: report.checks.length,
      browserClosed: report.browserClosed,
      failure: report.failure,
    },
    null,
    2,
  ),
);
