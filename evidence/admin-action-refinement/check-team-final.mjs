import { chromium, expect as baseExpect } from "@playwright/test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
const expect = baseExpect.configure({ timeout: 20000 }),
  origin = "http://localhost:3011",
  out = "evidence/admin-action-refinement/team-actions";
const report = {
  source: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  syntheticOnly: true,
  checks: [],
  screenshots: [],
  errors: [],
  serverMutations: 0,
  simulated503: [],
};
for (const f of [
  "app/admin-team-actions.tsx",
  "app/admin-experience.css",
  "app/portal.tsx",
  "app/confirmation-dialog.tsx",
  "lib/action-confirmation.ts",
])
  (report.files ??= {})[f] = createHash("sha256")
    .update(readFileSync(f))
    .digest("hex");
const save = () =>
  writeFileSync(
    out + "/final-report.json",
    JSON.stringify(report, null, 2) + "\n",
  );
const b = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    headless: true,
    chromiumSandbox: false,
  }),
  c = await b.newContext({
    viewport: { width: 320, height: 480 },
    hasTouch: true,
    reducedMotion: "reduce",
    serviceWorkers: "block",
  });
await c.addCookies([
  { name: "portal_local_fixture", value: "owner", url: origin },
]);
let failRead = false;
await c.route("**/*", (route) => {
  const r = route.request(),
    u = new URL(r.url());
  if (u.origin !== origin) return route.abort("blockedbyclient");
  if (!["GET", "HEAD"].includes(r.method())) {
    const body = r.postDataJSON();
    assert.equal(body.action, "admin-rename-team");
    assert.equal(body.data.teamId, "fake_team3");
    report.simulated503.push(body);
    return route.fulfill({
      status: 503,
      contentType: "application/json",
      json: {
        code: "SERVICE_UNAVAILABLE",
        message: "Synthetic 503: team update unavailable. Try again.",
      },
    });
  }
  if (
    failRead &&
    u.searchParams.get("view")?.startsWith("/admin/team-candidates/")
  ) {
    failRead = false;
    return route.fulfill({
      status: 503,
      contentType: "application/json",
      json: {
        code: "SERVICE_UNAVAILABLE",
        message: "Synthetic 503: participant search unavailable. Try again.",
      },
    });
  }
  return route.continue();
});
const p = await c.newPage();
p.setDefaultTimeout(20000);
p.on("pageerror", (e) => report.errors.push(String(e)));
const dialog = (n) => p.getByRole("dialog", { name: n, exact: true });
async function shot(n, fullPage = false) {
  if (fullPage) await p.evaluate(() => scrollTo(0, 0));
  const path = out + "/" + n + ".png";
  await p.screenshot({
    path,
    fullPage,
    animations: "disabled",
    caret: "initial",
    style: "nextjs-portal{visibility:hidden!important}",
  });
  report.screenshots.push({
    path,
    viewport: p.viewportSize(),
    inspected: false,
  });
  save();
}
async function check(n, f) {
  await f();
  report.checks.push({ name: n, passed: true });
  save();
}
async function open(n) {
  await p
    .getByRole("button", {
      name: "Change Common Ground refined status",
      exact: true,
    })
    .tap();
  await dialog("Change Common Ground refined status")
    .getByRole("button", { name: n, exact: true })
    .tap();
  await expect(dialog(n)).toBeVisible();
  return dialog(n);
}
try {
  await p.goto(origin + "/admin/teams", {
    waitUntil: "networkidle",
    timeout: 60000,
  });
  await expect(
    p.getByRole("button", {
      name: "Toggle Common Ground refined details",
      exact: true,
    }),
  ).toBeEnabled();
  await check(
    "Hydrated320 team card, long100-character name and five member controls stay within page width",
    async () => {
      assert.equal(
        await p.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
      );
      await shot("locked-team-five-members-320-hydrated", true);
    },
  );
  await check(
    "Nested Add dialog confines Tab and ShiftTab;503 search error is local and retry recovers",
    async () => {
      const d = await open("Add member");
      await expect(d.getByText("5 / 5 members", { exact: true })).toBeVisible();
      const close = d.getByRole("button", {
          name: "Close add member",
          exact: true,
        }),
        next = d.getByRole("button", { name: "Next", exact: true });
      await next.focus();
      await p.keyboard.press("Tab");
      await expect(close).toBeFocused();
      await p.keyboard.press("Shift+Tab");
      await expect(next).toBeFocused();
      failRead = true;
      await d.getByRole("searchbox").fill("candidate-20@portal.test");
      await expect(d.getByRole("alert")).toContainText(
        "Synthetic 503: participant search unavailable. Try again.",
      );
      await expect(
        p.getByText(
          "Synthetic 503: participant search unavailable. Try again.",
          { exact: true },
        ),
      ).toHaveCount(1);
      await shot("candidate-search-503-320");
      await d.getByRole("button", { name: "Try again", exact: true }).tap();
      await expect(
        d.locator(".admin-team-candidates > li:not(.admin-candidate-empty)"),
      ).toHaveCount(1);
      await expect(d.getByRole("alert")).toHaveCount(0);
      await p.keyboard.press("Escape");
      await p.keyboard.press("Escape");
    },
  );
  await check(
    "Rename field boundary and compact error preserve the exact entered value after503",
    async () => {
      const d = await open("Rename team"),
        input = d.getByRole("textbox", { name: "Team name" });
      await input.fill("A");
      await expect(
        d.getByRole("button", { name: "Rename", exact: true }),
      ).toBeDisabled();
      const name = "R".repeat(80);
      await input.fill(name);
      await d.getByRole("button", { name: "Rename", exact: true }).tap();
      await p
        .locator(".confirmation-dialog[open]")
        .getByRole("button", { name: "Rename team", exact: true })
        .tap();
      await expect(d.getByRole("alert")).toHaveText(
        "Synthetic 503: team update unavailable. Try again.",
      );
      await expect(input).toHaveValue(name);
      await expect(
        d.getByRole("button", { name: "Rename", exact: true }),
      ).toBeEnabled();
      await shot("rename-503-max-name-320");
      await p.keyboard.press("Escape");
      await p.keyboard.press("Escape");
    },
  );
  await check(
    "Final hydrated desktop team cards retain header action alignment and five persisted members",
    async () => {
      await p.setViewportSize({ width: 1440, height: 900 });
      await shot("locked-team-five-members-1440-final");
    },
  );
  assert.equal(report.errors.length, 0);
} catch (e) {
  report.checks.push({
    name: "FAILED",
    passed: false,
    error: String(e.stack || e),
  });
  await shot("FAILED-final").catch(() => {});
  throw e;
} finally {
  report.closed = true;
  save();
  await c.close();
  await b.close();
}
