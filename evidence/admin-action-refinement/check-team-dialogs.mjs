import { chromium, expect as baseExpect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
const expect = baseExpect.configure({ timeout: 20000 }),
  origin = "http://localhost:3011",
  out = "evidence/admin-action-refinement/team-actions";
mkdirSync(out, { recursive: true });
const report = {
  syntheticOnly: true,
  phase: "read-only dialogs",
  checks: [],
  candidateRequests: [],
  screenshots: [],
  errors: [],
  mutations: [],
};
const save = () =>
  writeFileSync(
    out + "/readonly-report.json",
    JSON.stringify(report, null, 2) + "\n",
  );
const b = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  headless: true,
  chromiumSandbox: false,
});
const c = await b.newContext({
  viewport: { width: 390, height: 480 },
  hasTouch: true,
  reducedMotion: "reduce",
  serviceWorkers: "block",
});
await c.addCookies([
  { name: "portal_local_fixture", value: "owner", url: origin },
]);
await c.route("**/*", (route) => {
  const r = route.request(),
    url = new URL(r.url());
  if (url.origin !== origin) return route.abort("blockedbyclient");
  if (!["GET", "HEAD"].includes(r.method())) {
    report.mutations.push(r.url());
    return route.abort("blockedbyclient");
  }
  if (url.searchParams.get("view")?.startsWith("/admin/team-candidates/"))
    report.candidateRequests.push({
      view: url.searchParams.get("view"),
      q: url.searchParams.get("q"),
      page: url.searchParams.get("page"),
    });
  return route.continue();
});
const p = await c.newPage();
p.on("pageerror", (e) => report.errors.push(String(e)));
p.setDefaultTimeout(20000);
const child = (name) => p.getByRole("dialog", { name, exact: true });
async function check(name, fn) {
  await fn();
  report.checks.push({ name, passed: true });
  save();
}
async function shot(name) {
  const path = out + "/" + name + ".png";
  await p.screenshot({
    path,
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
try {
  await p.goto(origin + "/admin/teams", {
    waitUntil: "networkidle",
    timeout: 60000,
  });
  const toggle = p.getByRole("button", {
    name: "Toggle Common Ground details",
    exact: true,
  });
  await expect(toggle).toBeEnabled();
  const menu = p.getByRole("button", {
    name: "Change Common Ground status",
    exact: true,
  });
  await menu.tap();
  const parent = child("Change Common Ground status");
  await expect(parent).toBeVisible();
  await expect(
    parent.getByRole("button", { name: "Rename team", exact: true }),
  ).toBeEnabled();
  assert.equal(report.candidateRequests.length, 0);
  await check(
    "Rename opens without candidate fetch; editable current name; Escape restores its menu item",
    async () => {
      const trigger = parent.getByRole("button", {
        name: "Rename team",
        exact: true,
      });
      await trigger.tap();
      const d = child("Rename team");
      await expect(d).toBeVisible();
      const input = d.getByRole("textbox", { name: "Team name" });
      await expect(input).toHaveValue("Common Ground");
      await expect(input).toBeFocused();
      await input.fill("Common Ground refined");
      await expect(
        d.getByRole("button", { name: "Rename", exact: true }),
      ).toBeEnabled();
      assert.equal(report.candidateRequests.length, 0);
      await shot("rename-390-short");
      await p.keyboard.press("Escape");
      await expect(d).toHaveCount(0);
      await expect(trigger).toBeFocused();
      await expect(parent).toBeVisible();
    },
  );
  await check(
    "Add fetches only on open, bounded25 and stable modal geometry at4viewports",
    async () => {
      await parent
        .getByRole("button", { name: "Add member", exact: true })
        .tap();
      const d = child("Add member");
      await expect(d).toBeVisible();
      await expect(
        d.locator(".admin-team-candidates > li:not(.admin-candidate-empty)"),
      ).toHaveCount(25);
      assert.equal(report.candidateRequests.length, 1);
      for (const viewport of [
        { width: 1440, height: 900 },
        { width: 768, height: 1024 },
        { width: 390, height: 480 },
        { width: 320, height: 480 },
      ]) {
        await p.setViewportSize(viewport);
        assert.equal(
          await p.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          true,
        );
        const r = await d.boundingBox();
        assert(
          r.x >= 0 &&
            r.y >= 0 &&
            r.x + r.width <= viewport.width &&
            r.y + r.height <= viewport.height,
        );
        await shot("add-candidates-" + viewport.width);
      }
      assert.equal(report.candidateRequests.length, 1);
    },
  );
  await check(
    "Search pagination is server-bounded25,11 and existing-team selection is disabled",
    async () => {
      const d = child("Add member"),
        search = d.getByRole("searchbox");
      await search.fill("Synthetic Candidate");
      await expect(
        d.locator(".admin-team-candidates > li:not(.admin-candidate-empty)"),
      ).toHaveCount(25);
      await expect(d.getByText("1–25 of 36", { exact: true })).toBeVisible();
      await d.getByRole("button", { name: "Next", exact: true }).tap();
      await expect(
        d.locator(".admin-team-candidates > li:not(.admin-candidate-empty)"),
      ).toHaveCount(11);
      await expect(d.getByText("26–36 of 36", { exact: true })).toBeVisible();
      await shot("candidate-page2-320");
      await search.fill("alice@portal.test");
      await expect(
        d.locator(".admin-team-candidates > li:not(.admin-candidate-empty)"),
      ).toHaveCount(1);
      await expect(
        d.getByText(
          "Already belongs to Small Wonder. Remove them from that team first.",
          { exact: true },
        ),
      ).toBeVisible();
      await expect(
        d.getByRole("button", {
          name: "Add Alice to Common Ground",
          exact: true,
        }),
      ).toBeDisabled();
      await shot("other-team-disabled-320");
      await search.fill("stranger@portal.test");
      await expect(d.getByText("No matches", { exact: true })).toBeVisible();
      await expect(
        d.locator(".admin-team-candidates > li:not(.admin-candidate-empty)"),
      ).toHaveCount(0);
      await shot("viewer-excluded-320");
    },
  );
  await check(
    "Back dismisses only Add modal, preserving parent menu and route",
    async () => {
      await p.goBack();
      await expect(child("Add member")).toHaveCount(0);
      await expect(parent).toBeVisible();
      assert.equal(new URL(p.url()).pathname, "/admin/teams");
      await p.keyboard.press("Escape");
      await expect(parent).toBeHidden();
      await expect(menu).toBeFocused();
    },
  );
  assert.equal(report.mutations.length, 0);
} catch (e) {
  report.checks.push({
    name: "FAILED",
    passed: false,
    error: String(e.stack || e),
  });
  await shot("FAILED-readonly").catch(() => {});
  throw e;
} finally {
  report.closed = true;
  save();
  await c.close();
  await b.close();
}
