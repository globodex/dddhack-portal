// Artifact-bound, synthetic Team inspection. Every write is blocked at routing.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { chromium } from "/tmp/ddehack-playwright-runner/node_modules/playwright/index.mjs";
const origin = "http://127.0.0.1:4173";
const artifact =
  "/home/param302/Dev/DDEHack-portal/.worktrees/visual-integration/dist/server/index.js";
const source = process.env.DASHBOARD_QA_SOURCE,
  worker = process.env.DASHBOARD_QA_WORKER;
if (
  process.env.DASHBOARD_QA_READY !== "1" ||
  !/^[a-f0-9]{40}$/.test(source || "") ||
  !/^[a-f0-9]{64}$/.test(worker || "")
) {
  console.log(
    "Prepared only; exact coordinator readiness/source/Worker required.",
  );
  process.exit(0);
}
const hash = () =>
  createHash("sha256").update(readFileSync(artifact)).digest("hex");
assert.equal(hash(), worker);
const output =
  process.env.DASHBOARD_QA_OUTPUT || "evidence/team-controls-readonly-v6";
mkdirSync(output, { recursive: true });
const report = {
  source,
  worker,
  syntheticOnly: true,
  readCancelOnly: true,
  sandbox: true,
  checks: [],
  captures: [],
  inventory: [],
  blocked: [],
  pageErrors: [],
};
const browser = await chromium.launch({
  headless: true,
  chromiumSandbox: true,
});
async function check(label, fn) {
  try {
    await fn();
    report.checks.push({ label, passed: true });
  } catch (e) {
    report.checks.push({ label, passed: false, failure: e.message });
  }
}
try {
  for (const actor of ["eve", "frank"])
    for (const viewport of [
      { label: "desktop", width: 1440, height: 900 },
      { label: "mobile-touch", width: 390, height: 844 },
      { label: "tablet-touch", width: 834, height: 1194 },
    ]) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        hasTouch: viewport.label !== "desktop",
        isMobile: viewport.label === "mobile-touch",
        serviceWorkers: "block",
      });
      try {
        await context.route("**/*", async (route) => {
          const request = route.request();
          if (
            new URL(request.url()).origin !== origin ||
            !["GET", "HEAD"].includes(request.method())
          ) {
            report.blocked.push({
              method: request.method(),
              path: new URL(request.url()).pathname,
            });
            return route.abort("blockedbyclient");
          }
          return route.continue({
            headers: {
              ...request.headers(),
              "oai-authenticated-user-id": "fake_" + actor,
              "oai-authenticated-user-email": actor + "@portal.test",
            },
          });
        });
        const page = await context.newPage();
        page.setDefaultTimeout(8000);
        page.on("pageerror", (e) => report.pageErrors.push(e.message));
        await page.goto(origin + "/dashboard#team", {
          waitUntil: "networkidle",
        });
        const panel = page.getByRole("tabpanel", { name: "Team", exact: true });
        await panel.waitFor();
        await page.evaluate(() => document.fonts.ready);
        const prefix = actor + "-" + viewport.label;
        const capture = async (label, fullPage = false) => {
          const path = `${output}/${prefix}-${label}.png`;
          await page.screenshot({ path, fullPage, animations: "disabled" });
          report.captures.push({
            actor,
            viewport: viewport.label,
            label,
            path,
            original: true,
            fullPage,
          });
        };
        await capture("initial");
        await capture("whole-page", true);
        report.inventory.push({
          actor,
          viewport,
          heading: await panel.locator(".dashboard-team-heading").innerText(),
          buttons: await panel.getByRole("button").allTextContents(),
          summaries: await panel.locator("summary").allTextContents(),
          members: await panel.locator(".dashboard-member-list>li").count(),
          overflow: await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
          ),
        });
        await check(prefix + " has no horizontal overflow", async () =>
          assert.equal(report.inventory.at(-1).overflow, false),
        );
        await check(prefix + " one expression per member", async () =>
          assert.equal(
            await panel
              .locator('.dashboard-member-list svg[aria-label$=" avatar"]')
              .count(),
            5,
          ),
        );
        if (actor === "frank") {
          await check(
            prefix + " member cannot edit leader controls",
            async () => {
              for (const label of [
                "Save team idea",
                "Lock completed team",
                "Rename team",
                "Update team identity",
              ])
                assert.equal(
                  await panel
                    .getByRole("button", { name: label, exact: true })
                    .count(),
                  0,
                );
              assert.equal(
                await panel
                  .getByRole("button", { name: /Remove .* from team/ })
                  .count(),
                0,
              );
            },
          );
          continue;
        }
        const cancel = async (label, trigger, escape = false) =>
          check(prefix + " " + label + " confirmation cancel", async () => {
            await trigger();
            const dialog = page.getByRole("dialog");
            await dialog.waitFor();
            assert.equal(
              await dialog
                .getByRole("button", { name: "Cancel", exact: true })
                .evaluate((e) => e === document.activeElement),
              true,
            );
            const title = await dialog.locator("h2").innerText();
            if (escape) await page.keyboard.press("Escape");
            else
              await dialog
                .getByRole("button", { name: "Cancel", exact: true })
                .click();
            await dialog.waitFor({ state: "hidden" });
            report.inventory.push({
              actor,
              viewport: viewport.label,
              cancelled: label,
              confirmationTitle: title,
            });
          });
        const title = panel.getByLabel("Idea title", { exact: true }),
          description = panel.locator("textarea[name=description]");
        const originalTitle = await title.inputValue(),
          originalDescription = await description.inputValue();
        await check(
          prefix + " empty idea blocked by native validation",
          async () => {
            await title.fill("");
            await description.fill("");
            await panel
              .getByRole("button", { name: "Save team idea", exact: true })
              .click();
            assert.equal(
              await title.evaluate((e) => e.validity.valueMissing),
              true,
            );
            assert.equal(await page.getByRole("dialog").count(), 0);
            await title.fill(originalTitle);
            await description.fill(originalDescription);
          },
        );
        await cancel("save idea", () =>
          panel
            .getByRole("button", { name: "Save team idea", exact: true })
            .click(),
        );
        await cancel(
          "lock team",
          () =>
            panel
              .getByRole("button", { name: "Lock completed team", exact: true })
              .click(),
          true,
        );
        await panel
          .locator("summary")
          .filter({ hasText: "Rename team" })
          .click();
        await panel
          .getByLabel("Team name", { exact: true })
          .fill("Synthetic renamed team");
        await cancel("rename", () =>
          panel
            .getByRole("button", { name: "Rename team", exact: true })
            .click(),
        );
        await panel
          .locator("summary")
          .filter({ hasText: "Customize your team badge and accent" })
          .click();
        await check(prefix + " eight named palettes", async () =>
          assert.equal(
            await panel.locator("input[type=radio][name=palette]").count(),
            8,
          ),
        );
        await panel.locator("input[type=radio][value=violet]").check();
        await cancel("palette", () =>
          panel
            .getByRole("button", { name: "Update team identity", exact: true })
            .click(),
        );
        await panel
          .locator("summary")
          .filter({ hasText: "Membership requests" })
          .click();
        report.inventory.push({
          actor,
          viewport: viewport.label,
          pendingRequestActions: await panel
            .getByRole("button", { name: /^(Accept|Decline)$/ })
            .count(),
          deleteVisible: await panel
            .locator("summary")
            .filter({ hasText: "Delete your team" })
            .count(),
          leaveControls: await panel
            .getByRole("button", { name: /leave/i })
            .count(),
          transferControls: await panel
            .getByRole("button", { name: /transfer/i })
            .count(),
        });
        await cancel("remove Frank", () =>
          panel
            .getByRole("button", {
              name: "Remove Frank from team",
              exact: true,
            })
            .click(),
        );
        await capture("controls-expanded", true);
      } finally {
        await context.close();
      }
    }
} finally {
  await browser.close();
  report.browserClosed = true;
  report.workerAfter = hash();
  report.artifactUnchanged = report.workerAfter === worker;
  writeFileSync(output + "/report.json", JSON.stringify(report, null, 2));
}
console.log(
  JSON.stringify({
    checks: report.checks,
    blocked: report.blocked,
    pageErrors: report.pageErrors,
    artifactUnchanged: report.artifactUnchanged,
    browserClosed: report.browserClosed,
    report: output + "/report.json",
  }),
);
if (
  report.checks.some((x) => !x.passed) ||
  report.blocked.length ||
  report.pageErrors.length ||
  !report.artifactUnchanged
)
  process.exitCode = 1;
