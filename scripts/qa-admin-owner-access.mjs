import { chromium, expect, request } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const origin = "http://localhost:3000",
  root = "/workspace/dddhack-portal";
const output = process.env.ADMIN_ACCESS_OUTPUT || "evidence/admin-owner-access";
mkdirSync(output, { recursive: true });
const sourceHashes = () =>
  Object.fromEntries(
    [
      "app/add-admins.tsx",
      "app/admin-experience.css",
      "app/portal.tsx",
      "lib/admin-access.ts",
      "lib/action-confirmation.ts",
    ].map((file) => [
      file,
      createHash("sha256")
        .update(readFileSync(`${root}/${file}`))
        .digest("hex"),
    ]),
  );
const report = {
  syntheticOnly: true,
  source: execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim(),
  sourceHashes: sourceHashes(),
  checks: [],
  requests: [],
  screenshots: [],
  errors: [],
};
const save = () =>
  writeFileSync(
    `${output}/report.json`,
    JSON.stringify(report, null, 2) + "\n",
  );
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  headless: true,
  chromiumSandbox: false,
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  hasTouch: true,
  reducedMotion: "reduce",
  serviceWorkers: "block",
});
await context.addCookies([
  { name: "portal_local_fixture", value: "owner", url: origin },
]);
const admin = await request.newContext({
  baseURL: origin,
  extraHTTPHeaders: { Cookie: "portal_local_fixture=admin" },
});
const page = await context.newPage();
page.setDefaultTimeout(15000);
page.on("pageerror", (error) => report.errors.push(String(error)));
let failNext = false,
  changedRole = false,
  adminName = "Admin";
await context.route("**/*", async (route) => {
  const req = route.request(),
    url = new URL(req.url());
  if (url.origin !== origin) return route.abort("blockedbyclient");
  if (!["GET", "HEAD"].includes(req.method())) {
    assert.equal(url.pathname, "/api/portal");
    const body = req.postDataJSON();
    assert(["add-admin", "revoke-admin"].includes(body.action));
    if (body.action === "add-admin")
      assert.equal(body.data.email, "admin@portal.test");
    else assert.equal(body.data.userId, "fake_admin");
    report.requests.push(body);
    save();
    if (failNext) {
      failNext = false;
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        json: {
          code: "SERVICE_UNAVAILABLE",
          message:
            "Synthetic 503: admin access service unavailable. Try again.",
        },
      });
    }
  }
  return route.continue();
});
const access = () => page.locator(".admin-add-admins");
const revoke = () =>
  access().getByRole("button", {
    name: `Revoke admin access for ${adminName}`,
    exact: true,
  });
const dialog = () => page.locator(".confirmation-dialog[open]");
const getView = async (client, view) =>
  client.get(`${origin}/api/portal?view=${encodeURIComponent(view)}`);
const check = async (name, operation) => {
  await operation();
  report.checks.push({ name, passed: true });
  save();
};
async function shot(name, fullPage = true) {
  await page.evaluate(() => document.fonts.ready);
  if (fullPage) await page.evaluate(() => scrollTo(0, 0));
  const path = `${output}/${name}.png`;
  await page.screenshot({
    path,
    fullPage,
    animations: "disabled",
    caret: "initial",
    style: "nextjs-portal{visibility:hidden!important}",
  });
  report.screenshots.push({
    path,
    viewport: page.viewportSize(),
    fullPage,
    inspected: false,
  });
  save();
}
async function hydrated() {
  await expect(access().locator("form")).toHaveAttribute(
    "data-hydrated",
    "true",
  );
}
async function confirm() {
  await dialog().waitFor();
  await dialog().getByRole("button").last().tap();
  await expect(dialog()).toHaveCount(0);
}
try {
  assert.match(
    JSON.stringify(
      await (await context.request.get(`${origin}/api/health`)).json(),
    ),
    /synthetic/,
  );
  assert.equal((await getView(admin, "/admin/participants")).status(), 200);
  await page.goto(`${origin}/admin/settings`, {
    waitUntil: "networkidle",
    timeout: 60000,
  });
  await hydrated();
  await page.getByRole("tab", { name: "Access", exact: true }).click();
  await expect(access()).toBeVisible();
  await check(
    "owner-only list, protected owner and responsive real list",
    async () => {
      const response = await getView(context.request, "/admin/access");
      assert.equal(response.status(), 200);
      const view = await response.json();
      adminName =
        view.items.find((person) => person.id === "fake_admin")?.name ||
        "Admin";
      assert(
        view.items.some((person) => person.id === "fake_owner" && person.owner),
      );
      assert(
        view.items.some(
          (person) => person.id === "fake_admin" && !person.owner,
        ),
      );
      for (const person of view.items)
        assert.deepEqual(Object.keys(person).sort(), [
          "email",
          "id",
          "name",
          "owner",
        ]);
      assert.equal((await getView(admin, "/admin/access")).status(), 403);
      await expect(
        access().getByRole("button", { name: /Revoke.*Owner/ }),
      ).toHaveCount(0);
      for (const viewport of [
        { width: 1440, height: 900 },
        { width: 390, height: 480 },
        { width: 320, height: 480 },
      ]) {
        await page.setViewportSize(viewport);
        await access().scrollIntoViewIfNeeded();
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          true,
        );
        await expect(revoke()).toBeEnabled();
        await shot(`owner-list-${viewport.width}`);
      }
    },
  );
  await check(
    "Escape cancels revoke with focus restoration and zero mutation",
    async () => {
      await revoke().focus();
      await page.keyboard.press("Enter");
      await expect(dialog()).toContainText("Revoke admin access");
      await expect(dialog()).toContainText(adminName);
      await shot("revoke-confirmation-320", false);
      assert.equal(report.requests.length, 0);
      await page.keyboard.press("Escape");
      await expect(dialog()).toHaveCount(0);
      await expect(revoke()).toBeFocused();
      assert.equal(report.requests.length, 0);
    },
  );
  await check(
    "failed revoke preserves row and one persistent actionable error",
    async () => {
      failNext = true;
      await revoke().tap();
      await confirm();
      await expect(
        page.getByText(
          "Synthetic 503: admin access service unavailable. Try again.",
          { exact: true },
        ),
      ).toHaveCount(1);
      await expect(revoke()).toBeEnabled();
      assert.equal((await getView(admin, "/admin/participants")).status(), 200);
      await shot("failed-revoke-row-retained", false);
    },
  );
  await check(
    "confirmed revoke persists, same authenticated admin loses staff access",
    async () => {
      await revoke().tap();
      const count = report.requests.length;
      await expect(dialog()).toContainText("Revoke admin access");
      assert.equal(report.requests.length, count);
      changedRole = true;
      await confirm();
      await expect(revoke()).toHaveCount(0);
      assert.equal((await getView(admin, "/admin/participants")).status(), 403);
      const dashboard = await getView(admin, "/dashboard");
      assert.equal(dashboard.status(), 200);
      const person = (await dashboard.json()).me;
      assert.equal(person.id, "fake_admin");
      assert.equal(person.role, "participant");
      await shot("revoked-admin-list", true);
      await page.reload({ waitUntil: "networkidle" });
      await hydrated();
      await page.getByRole("tab", { name: "Access", exact: true }).click();
      await expect(access()).toBeVisible();
      await expect(revoke()).toHaveCount(0);
    },
  );
  await check(
    "existing Add restores only synthetic admin through real confirmation",
    async () => {
      await page.setViewportSize({ width: 390, height: 480 });
      await access()
        .getByRole("textbox", { name: "Admin email", exact: true })
        .fill("  ADMIN@PORTAL.TEST  ");
      await access().getByRole("button", { name: "Add", exact: true }).click();
      await expect(dialog()).toContainText("Add admin");
      await confirm();
      await expect(revoke()).toBeEnabled();
      assert.equal((await getView(admin, "/admin/participants")).status(), 200);
      changedRole = false;
      await shot("admin-restored-390", true);
    },
  );
  await check(
    "saved submission dates retaken only after client hydration",
    async () => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.getByRole("tab", { name: "Event", exact: true }).click();
      const form = page.locator(".admin-window");
      await expect(form).toHaveAttribute("data-hydrated", "true");
      await expect(
        page.locator('.admin-window input[aria-label="Opens (IST)"]'),
      ).toBeEditable();
      await expect(
        page.locator('.admin-window input[aria-label="Opens (IST)"]'),
      ).toHaveValue("2026-10-24T08:00");
      await expect(
        page.locator('.admin-window input[aria-label="Closes (IST)"]'),
      ).toBeEditable();
      await expect(
        page.locator('.admin-window input[aria-label="Closes (IST)"]'),
      ).toHaveValue("2026-11-01T20:00");
      report.savedWindowInputs = await page
        .locator('.admin-window input[type="datetime-local"]')
        .evaluateAll((inputs) => inputs.map((input) => input.value));
      await shot("dates-hydrated-read-only", true);
    },
  );
} catch (error) {
  report.checks.push({
    name: "unexpected failure",
    passed: false,
    error: String(error.stack || error),
  });
  await shot("FAILED", true).catch(() => {});
  throw error;
} finally {
  if (changedRole) {
    const restore = await context.request.post(`${origin}/api/portal`, {
      headers: { Origin: origin },
      data: {
        action: "add-admin",
        data: { email: "admin@portal.test", confirmation: "ADD_ADMIN" },
      },
    });
    report.restoredAfterFailure = restore.status();
  }
  report.closed = true;
  report.sourceAfter = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  report.sourceHashesAfter = sourceHashes();
  report.runtimeSourcesUnchanged =
    JSON.stringify(report.sourceHashes) ===
    JSON.stringify(report.sourceHashesAfter);
  save();
  await admin.dispose();
  await context.close();
  await browser.close();
}
