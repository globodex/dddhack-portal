// Actual mouse/touch inspection. Every write and external request is blocked.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { chromium } from "/tmp/ddehack-playwright-runner/node_modules/playwright/index.mjs";
const origin = "http://127.0.0.1:4173",
  artifact =
    "/home/param302/Dev/DDEHack-portal/.worktrees/visual-integration/dist/server/index.js";
const source = process.env.DASHBOARD_QA_SOURCE,
  worker = process.env.DASHBOARD_QA_WORKER;
if (
  process.env.DASHBOARD_QA_READY !== "1" ||
  !/^[a-f0-9]{40}$/.test(source || "") ||
  !/^[a-f0-9]{64}$/.test(worker || "")
) {
  console.log(
    "Prepared only; exact source/Worker and coordinator readiness required.",
  );
  process.exit(0);
}
const hash = () =>
  createHash("sha256").update(readFileSync(artifact)).digest("hex");
assert.equal(hash(), worker);
const output =
  process.env.DASHBOARD_QA_OUTPUT || "evidence/team-forming-readonly-v6";
mkdirSync(output, { recursive: true });
const report = {
  source,
  worker,
  origin,
  syntheticOnly: true,
  readCancelOnly: true,
  sandbox: true,
  checks: [],
  geometry: [],
  captures: [],
  confirmations: [],
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
const sizes = [
  { label: "desktop", width: 1440, height: 900 },
  { label: "mobile-touch", width: 390, height: 844 },
  { label: "tablet-touch", width: 834, height: 1194 },
];
try {
  for (const actor of [
    "teamqa_leader",
    "teamqa_member",
    "teamqa_solo",
    "eve",
    "frank",
  ])
    for (const viewport of sizes) {
      const touch = viewport.label !== "desktop",
        context = await browser.newContext({
          viewport: { width: viewport.width, height: viewport.height },
          hasTouch: touch,
          isMobile: viewport.label === "mobile-touch",
          serviceWorkers: "block",
        });
      try {
        await context.route("**/*", async (route) => {
          const request = route.request(),
            url = new URL(request.url());
          if (
            url.origin !== origin ||
            !["GET", "HEAD"].includes(request.method())
          ) {
            report.blocked.push({
              method: request.method(),
              path: url.pathname,
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
        const prefix = actor + "-" + viewport.label,
          act = (locator) => (touch ? locator.tap() : locator.click());
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
        if (actor === "teamqa_leader" || actor === "teamqa_solo")
          await capture("whole-page", true);
        const expectedMembers =
          actor === "teamqa_solo" ? 1 : actor.startsWith("teamqa_") ? 2 : 5;
        const geometry = await panel.evaluate((p) => ({
          width: p.getBoundingClientRect().width,
          overflow: document.documentElement.scrollWidth > innerWidth,
          rows: [...p.querySelectorAll(".dashboard-member-list>li")].map(
            (e) => e.getBoundingClientRect().height,
          ),
          fieldsetPadding: p.querySelector(".dashboard-idea-form>fieldset")
            ? getComputedStyle(p.querySelector(".dashboard-idea-form>fieldset"))
                .padding
            : null,
          actions: [
            ...p.querySelectorAll(
              ".dashboard-idea-form>.form-actions>.button,.dashboard-lock-actions>.button",
            ),
          ].map((e) => e.getBoundingClientRect().width),
        }));
        report.geometry.push({ actor, viewport: viewport.label, ...geometry });
        await check(prefix + " safe layout and avatars", async () => {
          assert.equal(geometry.overflow, false);
          assert.equal(
            await panel
              .locator('.dashboard-member-list svg[aria-label$=" avatar"]')
              .count(),
            expectedMembers,
          );
        });
        if (actor === "teamqa_leader")
          await check(prefix + " forming state and compact idea", async () => {
            assert.match(
              await panel.locator(".dashboard-team-heading").innerText(),
              /Forming/,
            );
            assert.equal(geometry.fieldsetPadding, "0px");
            if (viewport.label === "mobile-touch") {
              assert.ok(
                Math.max(...geometry.rows) <= 115,
                JSON.stringify(geometry.rows),
              );
              for (const width of geometry.actions)
                assert.ok(Math.abs(width - geometry.width) <= 1);
            }
          });
        if (actor === "teamqa_member" || actor === "frank") {
          await check(
            prefix + " member cannot mutate leader controls",
            async () => {
              assert.equal(await panel.getByRole("button").count(), 0);
              assert.equal(await panel.locator("summary").count(), 0);
            },
          );
          continue;
        }
        const cancel = async (
          label,
          trigger,
          { escape = false, screenshot = false } = {},
        ) =>
          check(prefix + " " + label + " cancel", async () => {
            await trigger();
            const dialog = page.getByRole("dialog");
            await dialog.waitFor();
            const cancel = dialog.getByRole("button", {
              name: "Cancel",
              exact: true,
            });
            assert.equal(
              await cancel.evaluate((e) => e === document.activeElement),
              true,
            );
            report.confirmations.push({
              actor,
              viewport: viewport.label,
              action: label,
              title: await dialog.locator("h2").innerText(),
              target: await dialog.locator("#confirmation-target").innerText(),
            });
            if (screenshot) await capture(label + "-confirmation");
            if (escape) await page.keyboard.press("Escape");
            else await act(cancel);
            await dialog.waitFor({ state: "hidden" });
          });
        const title = panel.getByLabel("Idea title", { exact: true }),
          description = panel.locator("textarea[name=description]"),
          lock = panel.getByRole("button", {
            name: "Lock completed team",
            exact: true,
          });
        const savedTitle = await title.inputValue(),
          savedDescription = await description.inputValue();
        await check(prefix + " required validation", async () => {
          await title.fill("");
          await description.fill("");
          await act(
            panel.getByRole("button", { name: "Save team idea", exact: true }),
          );
          assert.equal(
            await title.evaluate((e) => e.validity.valueMissing),
            true,
          );
          assert.equal(await page.getByRole("dialog").count(), 0);
        });
        await title.fill("Synthetic unsaved local idea");
        await description.fill("Synthetic unsaved description.");
        await check(
          prefix + " counter and saved-idea lock prerequisite",
          async () => {
            assert.match(
              await panel.locator("#idea-count").innerText(),
              /^30\/500/,
            );
            assert.equal(await description.getAttribute("maxlength"), "500");
            assert.equal(
              await lock.isDisabled(),
              !savedTitle.trim() || !savedDescription.trim(),
            );
          },
        );
        await cancel("save-idea", () =>
          act(
            panel.getByRole("button", { name: "Save team idea", exact: true }),
          ),
        );
        if (await lock.isEnabled())
          await cancel("lock-team", () => act(lock), { escape: true });
        await act(panel.locator("summary").filter({ hasText: "Rename team" }));
        await panel
          .getByLabel("Team name", { exact: true })
          .fill("Synthetic unsaved team name");
        await cancel("rename", () =>
          act(panel.getByRole("button", { name: "Rename team", exact: true })),
        );
        await act(
          panel
            .locator("summary")
            .filter({ hasText: "Customize your team badge and accent" }),
        );
        await check(prefix + " eight touch-sized palette choices", async () =>
          assert.equal(
            await panel.locator("input[type=radio][name=palette]").count(),
            8,
          ),
        );
        await act(
          panel
            .locator("input[type=radio][name=palette][value=violet]")
            .locator(".."),
        );
        await cancel("palette", () =>
          act(
            panel.getByRole("button", {
              name: "Update team identity",
              exact: true,
            }),
          ),
        );
        await act(
          panel.locator("summary").filter({ hasText: "Membership requests" }),
        );
        if (actor === "teamqa_leader") {
          await check(
            prefix + " pending requests and protected deletion",
            async () => {
              assert.equal(await panel.locator(".request-row").count(), 2);
              assert.equal(
                await panel
                  .locator("summary")
                  .filter({ hasText: "Delete your team" })
                  .count(),
                0,
              );
            },
          );
          await cancel("accept-request", () =>
            act(
              panel
                .locator(".request-row")
                .filter({ hasText: "Synthetic Team Accept" })
                .getByRole("button", { name: "Accept", exact: true }),
            ),
          );
          await cancel("decline-request", () =>
            act(
              panel
                .locator(".request-row")
                .filter({ hasText: "Synthetic Team Decline" })
                .getByRole("button", { name: "Decline", exact: true }),
            ),
          );
          await cancel("remove-member", () =>
            act(
              panel.getByRole("button", {
                name: "Remove Synthetic Team Member from team",
                exact: true,
              }),
            ),
          );
        } else if (actor === "teamqa_solo") {
          await act(
            panel.locator("summary").filter({ hasText: "Delete your team" }),
          );
          await cancel(
            "delete-solo-team",
            () =>
              act(
                panel.getByRole("button", {
                  name: "Review team deletion",
                  exact: true,
                }),
              ),
            { screenshot: true },
          );
        } else
          await cancel("remove-Frank", () =>
            act(
              panel.getByRole("button", {
                name: "Remove Frank from team",
                exact: true,
              }),
            ),
          );
        await page.reload({ waitUntil: "networkidle" });
        await panel.waitFor();
        await check(prefix + " cancelled edits did not persist", async () => {
          assert.equal(await title.inputValue(), savedTitle);
          assert.equal(await description.inputValue(), savedDescription);
          if (actor === "teamqa_leader")
            assert.equal(
              await panel.locator(".dashboard-member-list>li").count(),
              2,
            );
        });
      } finally {
        await context.close();
      }
    }
  // Pending applicants see their existing request without being able to duplicate it.
  for (const actor of ["teamqa_accept", "teamqa_decline"]) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
      serviceWorkers: "block",
    });
    try {
      await context.route("**/*", async (route) => {
        const r = route.request(),
          u = new URL(r.url());
        if (u.origin !== origin || !["GET", "HEAD"].includes(r.method())) {
          report.blocked.push({ method: r.method(), path: u.pathname });
          return route.abort("blockedbyclient");
        }
        return route.continue({
          headers: {
            ...r.headers(),
            "oai-authenticated-user-id": "fake_" + actor,
            "oai-authenticated-user-email": actor + "@portal.test",
          },
        });
      });
      const page = await context.newPage();
      page.on("pageerror", (e) => report.pageErrors.push(e.message));
      await page.goto(origin + "/discover/teams", { waitUntil: "networkidle" });
      await check(actor + " existing request is disabled", async () => {
        const row = page
          .locator("li")
          .filter({
            has: page.getByRole("heading", {
              name: "Synthetic Green Loop",
              exact: true,
            }),
          });
        assert.equal(
          await row
            .getByRole("button", { name: "Requested", exact: true })
            .isDisabled(),
          true,
        );
      });
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
    passed: report.checks.filter((c) => c.passed).length,
    total: report.checks.length,
    failures: report.checks.filter((c) => !c.passed),
    blocked: report.blocked,
    pageErrors: report.pageErrors,
    artifactUnchanged: report.artifactUnchanged,
    browserClosed: report.browserClosed,
    report: output + "/report.json",
  }),
);
if (
  report.checks.some((c) => !c.passed) ||
  report.blocked.length ||
  report.pageErrors.length ||
  !report.artifactUnchanged
)
  process.exitCode = 1;
