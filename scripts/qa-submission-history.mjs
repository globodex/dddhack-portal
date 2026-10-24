import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const origin = "http://localhost:3013",
  out = "evidence/submission-consent-row/history";
mkdirSync(out, { recursive: true });
const report = {
  syntheticOnly: true,
  origin,
  screenshots: [],
  checks: [],
  errors: [],
  writes: [],
};
const save = () =>
  writeFileSync(out + "/report.json", JSON.stringify(report, null, 2) + "\n");
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  headless: true,
  chromiumSandbox: false,
});
const snapshot = async (page, name) => {
  const path = `${out}/${name}.png`;
  await page.screenshot({
    path,
    fullPage: true,
    animations: "disabled",
    style: "nextjs-portal{visibility:hidden!important}",
  });
  report.screenshots.push(path);
  save();
};
try {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
    { width: 320, height: 480 },
  ]) {
    const context = await browser.newContext({
      viewport,
      isMobile: viewport.width < 768,
      hasTouch: viewport.width < 768,
      reducedMotion: "reduce",
    });
    await context.addCookies([
      { name: "portal_local_fixture", value: "alice", url: origin },
    ]);
    await context.route("**/*", (route) => {
      const request = route.request();
      if (new URL(request.url()).origin !== origin) return route.abort();
      if (!["GET", "HEAD"].includes(request.method())) {
        report.writes.push(request.method());
        return route.abort();
      }
      return route.continue();
    });
    const page = await context.newPage();
    let historyGets = 0;
    page.on("request", (request) => {
      if (request.url().includes("view=%2Fproject-history")) historyGets++;
    });
    page.on("pageerror", (error) => report.errors.push(error.message));
    await page.goto(origin + "/dashboard#project", {
      waitUntil: "networkidle",
    });
    await page.getByRole("tab", { name: "Project", exact: true }).click();
    const rows = page.locator(".committed-submission");
    await rows.nth(1).waitFor();
    assert.equal(await rows.count(), 2);
    assert.equal(historyGets, 0, "Closed metadata rows cause no history fetch");
    assert.equal(
      await page.locator(".committed-submission-current").count(),
      1,
    );
    assert.match(
      await rows.first().locator("summary").innerText(),
      /Submission 2.*Current/s,
    );
    assert.equal(await rows.first().getAttribute("open"), null);
    assert.equal(
      await page.locator(".dashboard-project-card").count(),
      0,
      "No duplicate draft card",
    );
    const toolbar = await page
        .locator(".dashboard-project-toolbar")
        .boundingBox(),
      list = await page.locator(".committed-submissions").boundingBox();
    assert.ok(
      toolbar.y + toolbar.height <= list.y + 1,
      "Project action row is above accordions",
    );
    assert.equal(
      await page
        .getByRole("button", { name: "Update project", exact: true })
        .count(),
      1,
    );
    const dashboard = await (
      await context.request.get(origin + "/api/portal?view=%2Fdashboard")
    ).json();
    assert.equal(
      await page.locator(".dashboard-project-feedback-count").innerText(),
      String(dashboard.feedback.length),
    );
    assert.equal(
      await page
        .getByRole("link", { name: "View project", exact: false })
        .getAttribute("href"),
      "/projects/" + encodeURIComponent(dashboard.project.slug),
    );
    const name = `${viewport.width}x${viewport.height}`;
    await snapshot(page, `closed-${name}`);
    if (viewport.width < 768) await rows.first().locator("summary").tap();
    else {
      await rows.first().locator("summary").focus();
      await page.keyboard.press("Enter");
    }
    await rows.first().locator(".committed-submission-details h4").waitFor();
    assert.equal(historyGets, 1);
    assert.match(
      await rows.first().locator(".committed-submission-details").innerText(),
      /Synthetic local version 2/,
    );
    await rows.nth(1).locator("summary").focus();
    await page.keyboard.press("Space");
    await rows.nth(1).locator(".committed-submission-details h4").waitFor();
    const previous = await rows
      .nth(1)
      .locator(".committed-submission-details")
      .innerText();
    assert.match(previous, /Synthetic local version 1/);
    assert.doesNotMatch(previous, /Synthetic local version 2/);
    assert.equal(historyGets, 1, "One cached GET serves both saved snapshots");
    const media = await rows.first().locator("img").boundingBox();
    assert.ok(
      media.width <= (viewport.width < 768 ? 220 : 240) + 1 &&
        media.height <= 136,
      "Compact banner remains contained",
    );
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    await snapshot(page, `expanded-${name}`);
    await page.getByRole("tab", { name: "Team", exact: true }).click();
    await page.locator(".studio-team-identity").waitFor();
    assert.equal(
      await page.locator(".studio-team-identity .team-avatar").count(),
      1,
    );
    assert.equal(
      await page
        .locator(".studio-team-identity .studio-eyebrow, .studio-team-color")
        .count(),
      0,
    );
    assert.equal(
      await page
        .getByRole("button", { name: "Edit team name and color", exact: true })
        .isEnabled(),
      true,
    );
    await snapshot(page, `team-header-${name}`);
    report.checks.push({
      name: `${name} action row above history; native keyboard/touch accordions show saved snapshots and exact Current chip; one lazy GET; compact media; clean Team header`,
      passed: true,
      historyGets,
    });
    save();
    await context.close();
  }
  // Eve is seeded at the hard third-attempt limit. No mutation is allowed.
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  await context.addCookies([
    { name: "portal_local_fixture", value: "eve", url: origin },
  ]);
  const page = await context.newPage();
  await page.goto(origin + "/dashboard#project", { waitUntil: "networkidle" });
  await page.getByRole("tab", { name: "Project", exact: true }).click();
  await page.locator(".committed-submission").nth(2).waitFor();
  assert.equal(await page.locator(".committed-submission").count(), 3);
  assert.equal(
    await page
      .getByRole("button", { name: "Update project", exact: true })
      .count(),
    0,
  );
  await snapshot(page, "third-attempt-readonly-390x844");
  report.checks.push({
    name: "Third committed attempt shows exactly three accordions and no Update project capability",
    passed: true,
  });
  await context.close();
  const member = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce", hasTouch: true, isMobile: true });
  await member.addCookies([{ name: "portal_local_fixture", value: "frank", url: origin }]);
  const memberPage = await member.newPage();
  await memberPage.goto(origin + "/dashboard#project", { waitUntil: "networkidle" });
  await memberPage.getByRole("tab", { name: "Project", exact: true }).click();
  await memberPage.locator(".committed-submission").nth(2).waitFor();
  assert.equal(await memberPage.getByRole("button", { name: "Update project", exact: true }).count(), 0);
  await memberPage.locator(".committed-submission summary").first().tap();
  await memberPage.locator(".committed-submission-details h4").first().waitFor();
  await snapshot(memberPage, "member-history-only-390x844");
  report.checks.push({ name: "Existing teammate can read committed history and has no Update capability", passed: true });
  await member.close();

  const fault = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  await fault.addCookies([{ name: "portal_local_fixture", value: "alice", url: origin }]);
  let failHistory = true;
  await fault.route("**/api/portal?view=%2Fproject-history", route => {
    if (failHistory) { failHistory = false; return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "Synthetic history response unavailable." }) }); }
    return route.continue();
  });
  const faultPage = await fault.newPage();
  await faultPage.goto(origin + "/dashboard#project", { waitUntil: "networkidle" });
  await faultPage.getByRole("tab", { name: "Project", exact: true }).click();
  await faultPage.locator(".committed-submission summary").first().click();
  await faultPage.locator(".committed-submissions-error").first().waitFor();
  await snapshot(faultPage, "history-response-error-390x844");
  await faultPage.getByRole("button", { name: "Retry history", exact: true }).first().click();
  await faultPage.locator(".committed-submission-details h4").first().waitFor();
  assert.equal(await faultPage.locator(".committed-submissions-error").count(), 0);
  report.checks.push({ name: "Controlled local history503 shows honest error and Retry restores saved snapshot without changing metadata", passed: true });
  await fault.close();
  assert.equal(report.errors.length, 0);
  assert.equal(report.writes.length, 0);
} catch (error) {
  report.failure = String(error.stack || error);
  process.exitCode = 1;
} finally {
  await browser.close();
  save();
}
console.log(
  JSON.stringify({
    checks: report.checks.length,
    screenshots: report.screenshots.length,
    failure: report.failure,
  }),
);
