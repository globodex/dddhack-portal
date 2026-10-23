// Actual compiled Dashboard QA. Disposable fixtures only; no hosted traffic.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { chromium } from "/tmp/ddehack-playwright-runner/node_modules/playwright/index.mjs";
const origin = "http://127.0.0.1:4173";
const artifact =
  "/home/param302/Dev/DDEHack-portal/.worktrees/visual-integration/dist/server/index.js";
const output =
  process.env.DASHBOARD_QA_OUTPUT || "evidence/dashboard-v6-actual";
const source = process.env.DASHBOARD_QA_SOURCE,
  expectedWorker = process.env.DASHBOARD_QA_WORKER;
if (
  process.env.DASHBOARD_QA_READY !== "1" ||
  !/^[a-f0-9]{40}$/.test(source || "") ||
  !/^[a-f0-9]{64}$/.test(expectedWorker || "")
) {
  console.log(
    "Prepared only. Root must confirm preview ready and supply exact source + Worker hashes.",
  );
  process.exit(0);
}
const hash = () =>
  createHash("sha256").update(readFileSync(artifact)).digest("hex");
assert.equal(
  hash(),
  expectedWorker,
  "preview artifact must match coordinator hash before browser launch",
);
mkdirSync(output, { recursive: true });
const report = {
  source,
  worker: expectedWorker,
  syntheticOnly: true,
  origin,
  sandbox: true,
  checks: [],
  layout: [],
  initialLoads: [],
  screenshots: [],
  pageErrors: [],
  blocked: [],
  methods: { GET: 0, HEAD: 0, syntheticReveal: 0 },
};
const save = () =>
  writeFileSync(output + "/report.json", JSON.stringify(report, null, 2));
const browser = await chromium.launch({
  headless: true,
  chromiumSandbox: true,
});
report.browser = browser.version();
const viewports = [
  { label: "desktop", width: 1440, height: 900 },
  { label: "mobile", width: 390, height: 844 },
  { label: "tablet", width: 834, height: 1194 },
];
async function session(actor, viewport) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    serviceWorkers: "block",
  });
  await context.route("**/*", async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    if (url.origin !== origin) {
      report.blocked.push({ kind: "external", method: request.method() });
      return route.abort("blockedbyclient");
    }
    if (!["GET", "HEAD"].includes(request.method())) {
      let body;
      try {
        body = JSON.parse(request.postData() || "{}");
      } catch {}
      if (
        actor !== "alice" ||
        request.method() !== "POST" ||
        url.pathname !== "/api/portal" ||
        body?.action !== "reveal-credit" ||
        body?.data?.typeId !== "fake_credit"
      ) {
        report.blocked.push({
          kind: "mutation",
          action: body?.action || "unknown",
        });
        return route.abort("blockedbyclient");
      }
      report.methods.syntheticReveal++;
    } else report.methods[request.method()]++;
    await route.continue({
      headers: {
        ...request.headers(),
        "oai-authenticated-user-id": "fake_" + actor,
        "oai-authenticated-user-email": actor + "@portal.test",
        "oai-authenticated-user-full-name": "Synthetic " + actor,
      },
    });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on("pageerror", (error) =>
    report.pageErrors.push({
      actor,
      width: viewport.width,
      error: error.message,
    }),
  );
  const response = await page.goto(origin + "/dashboard", {
    waitUntil: "networkidle",
  });
  report.initialLoads.push({
    actor,
    viewport: viewport.width,
    status: response.status(),
    type: response.headers()["content-type"],
    title: await page.title(),
  });
  save();
  try {
    await page.locator(".dashboard-v6").waitFor();
  } catch (error) {
    await page.screenshot({
      path: `${output}/initial-load-diagnostic-${actor}-${viewport.width}.png`,
      fullPage: false,
      animations: "disabled",
    });
    report.initialLoadFailure = {
      actor,
      viewport: viewport.width,
      status: response.status(),
      error: error.message,
    };
    save();
    throw error;
  }
  await page.evaluate(() => document.fonts.ready);
  return { context, page };
}
async function check(name, viewport, operation) {
  try {
    const details = await operation();
    report.checks.push({
      name,
      viewport: viewport.width,
      passed: true,
      ...details,
    });
  } catch (error) {
    report.checks.push({
      name,
      viewport: viewport.width,
      passed: false,
      error: error.message,
    });
  }
  save();
}
async function capture(page, name, viewport, deliverable = true) {
  // A revealed local voucher is deliberately never photographed, even on failure.
  assert.equal(
    await page.locator('code[aria-label="Your private allocation"]').count(),
    0,
    "screenshots require every allocation masked",
  );
  await page.evaluate(() => scrollTo(0, 0));
  const path = `${output}/${name}-${viewport.label}-${viewport.width}x${viewport.height}.png`;
  await page.screenshot({ path, fullPage: false, animations: "disabled" });
  report.screenshots.push({
    label: name,
    viewport,
    path,
    original: true,
    fullPage: false,
    deliverable,
    allocationMasked: true,
  });
  save();
}
async function select(page, section) {
  await page.getByRole("tab", { name: section, exact: true }).click();
  await page.getByRole("tabpanel", { name: section, exact: true }).waitFor();
}
async function masked(page) {
  await page.locator('code[aria-label="Allocation hidden"]').first().waitFor();
  assert.equal(
    await page.locator('code[aria-label="Your private allocation"]').count(),
    0,
  );
}
async function reveal(page) {
  const request = page.waitForResponse(
    (response) =>
      response.url() === origin + "/api/portal" &&
      response.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Reveal my allocation", exact: true })
    .first()
    .click();
  const response = await request;
  assert.equal(
    response.status(),
    200,
    "reserved local allocation reveal succeeds",
  );
  assert.match(response.headers()["cache-control"] || "", /no-store/);
  await page
    .locator('code[aria-label="Your private allocation"]')
    .first()
    .waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Copy allocation", exact: true })
      .first()
      .isEnabled(),
    true,
  );
}
try {
  for (const viewport of viewports) {
    const { context, page } = await session("alice", viewport);
    try {
      await capture(page, "01-team-locked", viewport);
      await check("team-layout-and-shell", viewport, async () => {
        assert.equal(
          await page.locator(".dashboard-member-list > li").count(),
          3,
          "mockup-review fixture contains three actual members",
        );
        const members = await page
          .locator(".dashboard-member-list > li")
          .evaluateAll((rows) =>
            rows.map((row) => ({
              expressions: row.querySelectorAll('svg[aria-label$=" avatar"]')
                .length,
              initials: row.querySelectorAll(".person-monogram,.team-avatar")
                .length,
            })),
          );
        assert.ok(
          members.every((row) => row.expressions === 1 && row.initials === 0),
          "one expression per person; no duplicate initials",
        );
        assert.equal(
          await page.locator(".dashboard-team-heading .team-avatar").count(),
          1,
        );
        assert.equal(
          await page.locator(".dashboard-venue").isVisible(),
          true,
          "eligible actor receives actual gated synthetic venue",
        );
        assert.equal(
          await page
            .getByRole("button", { name: "Save team idea", exact: true })
            .count(),
          0,
          "locked team is read-only",
        );
        const geometry = await page.evaluate(() => {
          const rect = (selector) => {
            const e = document.querySelector(selector),
              r = e.getBoundingClientRect(),
              s = getComputedStyle(e);
            return {
              x: r.x,
              y: r.y,
              width: r.width,
              height: r.height,
              display: s.display,
              position: s.position,
              background: s.backgroundColor,
              color: s.color,
            };
          };
          return {
            overflow: document.documentElement.scrollWidth > innerWidth,
            header: rect(".mobile-header"),
            sidebar: rect(".sidebar"),
            main: rect("main"),
            active: rect('.sidebar nav a[aria-current="page"]'),
          };
        });
        report.layout.push({ viewport: viewport.width, geometry });
        save();
        assert.equal(geometry.overflow, false);
        assert.ok(
          geometry.header.height >= 64 && geometry.header.height <= 65,
          "header content plus border stays within 64–65px",
        );
        assert.equal(geometry.header.position, "sticky");
        if (viewport.width >= 1200) {
          assert.equal(geometry.header.width, viewport.width);
          assert.equal(geometry.sidebar.y, 64);
          assert.equal(geometry.sidebar.width, 232);
          assert.equal(geometry.active.color, "rgb(255, 255, 255)");
        }
        return { geometry, members };
      });
      await check("tab-hash-and-keyboard", viewport, async () => {
        for (const section of ["Credits", "Project", "Team"]) {
          await select(page, section);
          assert.equal(new URL(page.url()).hash, "#" + section.toLowerCase());
          assert.equal(await page.getByRole("tabpanel").count(), 1);
        }
        const team = page.getByRole("tab", { name: "Team", exact: true });
        await team.focus();
        await page.keyboard.press("ArrowRight");
        assert.equal(
          await page
            .getByRole("tab", { name: "Credits", exact: true })
            .getAttribute("aria-selected"),
          "true",
        );
        await page.keyboard.press("End");
        assert.equal(
          await page
            .getByRole("tab", { name: "Project", exact: true })
            .getAttribute("aria-selected"),
          "true",
        );
        await page.keyboard.press("Home");
        assert.equal(await team.getAttribute("aria-selected"), "true");
        await page.goto(origin + "/dashboard#project", {
          waitUntil: "networkidle",
        });
        await page
          .getByRole("tabpanel", { name: "Project", exact: true })
          .waitFor();
        assert.equal(
          await page
            .getByRole("tab", { name: "Project", exact: true })
            .getAttribute("aria-selected"),
          "true",
        );
      });
      await check("responsive-navigation-disclosure", viewport, async () => {
        if (viewport.width >= 1200) {
          const hide = page.getByRole("button", {
            name: "Hide navigation",
            exact: true,
          });
          assert.equal(await hide.getAttribute("aria-expanded"), "true");
          await hide.click();
          assert.equal(await page.locator(".sidebar").isVisible(), false);
          assert.equal(
            await page
              .locator("main")
              .evaluate((e) => getComputedStyle(e).marginLeft),
            "0px",
          );
          const show = page.getByRole("button", {
            name: "Show navigation",
            exact: true,
          });
          assert.equal(await show.getAttribute("aria-expanded"), "false");
          await show.click();
          assert.equal(await page.locator(".sidebar").isVisible(), true);
          assert.equal(
            await page
              .getByRole("button", { name: "Log out", exact: true })
              .locator("svg")
              .count(),
            1,
          );
        } else {
          assert.equal(await page.locator(".sidebar").isVisible(), false);
          await page
            .getByRole("button", { name: "Open menu", exact: true })
            .click();
          assert.equal(await page.locator(".sidebar").isVisible(), true);
          await page
            .getByRole("button", { name: "Close menu", exact: true })
            .click();
          assert.equal(await page.locator(".sidebar").isVisible(), false);
        }
      });
      await check("voucher-mask-reveal-hide-tab-reset", viewport, async () => {
        await select(page, "Credits");
        await masked(page);
        await capture(page, "02-credits-masked", viewport);
        assert.equal(
          await page
            .getByRole("button", { name: "Copy allocation", exact: true })
            .first()
            .isDisabled(),
          true,
        );
        assert.equal(
          await page
            .getByRole("button", { name: "Reveal my allocation", exact: true })
            .first()
            .locator("svg")
            .count(),
          1,
        );
        await reveal(page);
        await page
          .getByRole("button", { name: "Hide allocation", exact: true })
          .first()
          .click();
        await masked(page);
        await reveal(page);
        await select(page, "Team");
        await select(page, "Credits");
        await masked(page);
        await reveal(page);
        // Exercise the installed blur listener with a real browser event dispatch;
        // no DOM values or screenshot pixels are changed by the harness.
        await page.evaluate(() => window.dispatchEvent(new Event("blur")));
        await masked(page);
        return {
          revealedScreenshots: 0,
          copyInitiallyDisabled: true,
          revealHttpNoStore: true,
          blurCheck: "window blur event dispatched in the actual page",
        };
      });
      await check(
        "project-readonly-votes-and-two-versions",
        viewport,
        async () => {
          await select(page, "Project");
          await capture(page, "03-project-summary", viewport);
          assert.equal(await page.locator(".dashboard-upvotes").count(), 1);
          assert.equal(
            await page.locator(".dashboard-upvotes").evaluate((e) => e.tagName),
            "SPAN",
          );
          assert.equal(
            await page.getByRole("button", { name: /^Upvote/ }).count(),
            0,
          );
          assert.equal(
            await page
              .getByRole("button", { name: "Versions 2/3", exact: true })
              .count(),
            1,
          );
          assert.equal(
            await page.locator(".dashboard-feedback .feedback-entry").count(),
            1,
          );
          await page
            .getByRole("button", { name: "Versions 2/3", exact: true })
            .click();
          const dialog = page.locator(".project-history-dialog[open]");
          await dialog.waitFor();
          await page.locator(".history-version").nth(1).waitFor();
          assert.equal(await page.locator(".history-version").count(), 2);
          await capture(page, "04-project-version-history", viewport, false);
          await page.keyboard.press("Escape");
          await dialog.waitFor({ state: "hidden" });
          assert.equal(
            await page
              .getByRole("button", { name: "Versions 2/3", exact: true })
              .evaluate((e) => document.activeElement === e),
            true,
            "history returns focus to its trigger",
          );
        },
      );
    } finally {
      await context.close();
    }
  }
  const viewport = viewports[1];
  const { context: restrictedContext, page: restricted } = await session(
    "bob",
    viewport,
  );
  try {
    await check("registered-user-private-data-absent", viewport, async () => {
      assert.equal(await restricted.locator(".dashboard-venue").count(), 0);
      await select(restricted, "Credits");
      assert.equal(await restricted.locator(".credit-secret").count(), 0);
      await select(restricted, "Project");
      assert.equal(
        await restricted.locator(".dashboard-project-card").count(),
        0,
      );
      return { privateVenueAbsent: true, personalCreditsAbsent: true };
    });
  } finally {
    await restrictedContext.close();
  }
  const { context: eveContext, page: eve } = await session("eve", viewport);
  try {
    await check("third-attempt-project-readonly", viewport, async () => {
      await select(eve, "Project");
      assert.equal(
        await eve
          .getByRole("button", { name: "Versions 3/3", exact: true })
          .count(),
        1,
      );
      assert.equal(
        await eve
          .getByRole("button", {
            name: /Update project|Save draft|Commit submission/,
          })
          .count(),
        0,
      );
      await capture(eve, "05-project-third-attempt-readonly", viewport);
      await select(eve, "Credits");
      assert.equal(
        await eve
          .getByRole("button", { name: "Reveal my allocation", exact: true })
          .first()
          .isDisabled(),
        true,
      );
      return {
        committedVersions: 3,
        mutationControlsAbsent: true,
        unallocatedVoucherRevealDisabled: true,
      };
    });
  } finally {
    await eveContext.close();
  }
} finally {
  await browser.close();
  report.browserClosed = true;
  report.workerAfter = hash();
  report.artifactUnchanged = report.workerAfter === expectedWorker;
  save();
}
console.log(
  JSON.stringify({
    checks: report.checks.length,
    failed: report.checks.filter((check) => !check.passed),
    screenshots: report.screenshots.length,
    pageErrors: report.pageErrors,
    blocked: report.blocked,
    artifactUnchanged: report.artifactUnchanged,
    browserClosed: report.browserClosed,
  }),
);
if (
  report.checks.some((check) => !check.passed) ||
  report.pageErrors.length ||
  report.blocked.length ||
  !report.artifactUnchanged
)
  process.exitCode = 1;
