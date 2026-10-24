import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { revealConfirmation } from "../lib/action-confirmation.ts";
import {
  utcToISTInput,
  submissionWindowValues,
} from "../app/owner-submission-window.tsx";
import { ist } from "../lib/time.ts";
const origin = "http://localhost:3000",
  root = "/workspace/dddhack-portal",
  output = process.env.ADMIN_FINAL_OUTPUT || "evidence/admin-final-private8834";
mkdirSync(output, { recursive: true });
const report = {
  privateBackend: 8834,
  syntheticOnly: true,
  source: execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim(),
  portalSHA256: createHash("sha256")
    .update(readFileSync(root + "/app/portal.tsx"))
    .digest("hex"),
  checks: [],
  requests: [],
  screenshots: [],
  errors: [],
};
const save = () =>
  writeFileSync(
    output + "/report.json",
    JSON.stringify(report, null, 2) + "\n",
  );
const b = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  headless: true,
  chromiumSandbox: false,
});
let c = await b.newContext({
  viewport: { width: 320, height: 480 },
  isMobile: true,
  hasTouch: true,
  reducedMotion: "reduce",
  serviceWorkers: "block",
});
await c.addCookies([
  { name: "portal_local_fixture", value: "owner", url: origin },
]);
let p = await c.newPage();
p.setDefaultTimeout(15000);
let phase = "quick",
  failNext = false,
  delayNext = false,
  initial = [];
const roster = async () => {
  const r = await c.request.get(
    origin + "/api/portal?view=%2Fadmin%2Fparticipants",
  );
  assert.equal(r.status(), 200);
  return (await r.json()).items;
};
const setStatus = async (id, status) => {
  assert(["fake_carol", "fake_dave"].includes(id));
  assert(["Registered", "Going"].includes(status));
  const d = {
    kind: "person",
    targetId: id,
    status,
    reason: "Synthetic private QA fixture",
  };
  const r = await c.request.post(origin + "/api/portal", {
    headers: { Origin: origin },
    data: {
      action: "admin-status",
      data: { ...d, confirmation: revealConfirmation("admin-status", d) },
    },
  });
  assert(r.ok(), JSON.stringify(await r.json()));
};
await c.route("**/*", async (route) => {
  const r = route.request(),
    u = new URL(r.url());
  if (u.origin !== origin) return route.abort("blockedbyclient");
  if (r.method() === "POST" && u.pathname === "/api/portal") {
    const body = r.postDataJSON();
    report.requests.push({ phase, ...body });
    save();
    if (phase === "dates") {
      assert(
        ["preview-submission-window", "publish-submission-window"].includes(
          body.action,
        ),
      );
      if (body.action === "publish-submission-window")
        assert.equal(body.data.windowWarnings, undefined);
    } else {
      assert(["quick-check-in", "participant-bulk"].includes(body.action));
      assert.deepEqual(body.data.emails, ["dave@portal.test"]);
      if (failNext) {
        failNext = false;
        return route.fulfill({
          status: 503,
          contentType: "application/json",
          json: {
            code: "SERVICE_UNAVAILABLE",
            message:
              "Synthetic 503: participant service unavailable. Try again.",
          },
        });
      }
      if (delayNext) {
        delayNext = false;
        await new Promise((r) => setTimeout(r, 1200));
      }
    }
  }
  return route.continue();
});
async function shot(name, fullPage = true) {
  if (fullPage) await p.evaluate(() => scrollTo(0, 0));
  const path = output + "/" + name + ".png";
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
    fullPage,
    inspected: false,
  });
  save();
}
async function run(name, action) {
  try {
    await action();
    report.checks.push({ name, passed: true });
  } catch (e) {
    report.checks.push({
      name,
      passed: false,
      error: String(e.stack || e),
      url: p.url(),
      main: await p
        .locator("main")
        .innerText({ timeout: 1000 })
        .catch(() => null),
    });
    await shot("FAILED-" + name.replace(/[^a-zA-Z0-9]+/g, "-"), true).catch(
      () => {},
    );
  }
  save();
}
const dialog = () => p.locator(".confirmation-dialog[open]");
async function confirm() {
  await dialog().waitFor();
  await dialog().getByRole("button").last().tap();
  await dialog().waitFor({ state: "hidden" });
}
async function people(status = "all") {
  await p.goto(origin + "/admin/participants", {
    waitUntil: "networkidle",
    timeout: 60000,
  });
  await p.waitForFunction(() =>
    [...document.querySelectorAll("form[data-hydrated]")].every(
      (f) => f.dataset.hydrated === "true",
    ),
  );
  await p.getByRole("searchbox").fill("dave@portal.test");
  await p
    .getByRole("button", { name: "Participant filters", exact: true })
    .tap();
  await p
    .getByRole("combobox", { name: "Personal status", exact: true })
    .selectOption(status);
  await p
    .getByRole("combobox", { name: "Team status", exact: true })
    .selectOption("all");
  await p.evaluate(() => document.fonts.ready);
}
try {
  const health = await (await c.request.get(origin + "/api/health")).json();
  assert.match(JSON.stringify(health), /synthetic/);
  initial = (await roster()).filter((r) =>
    ["fake_carol", "fake_dave"].includes(r.id),
  );
  assert.equal(initial.length, 2);
  for (const r of initial) {
    assert.equal(r.status, "Going");
    assert(!r.checked_in);
  }
  await run(
    "quick check-in stable pending, no confirmation, one request, fresh dropdown",
    async () => {
      await people();
      await p
        .getByRole("checkbox", { name: "Select dave@portal.test", exact: true })
        .check();
      const quick = p.getByRole("button", {
        name: "Check in Dave",
        exact: true,
      });
      await quick.scrollIntoViewIfNeeded();
      report.idleBounds = await quick.boundingBox();
      await shot("quick-idle-320", false);
      delayNext = true;
      await quick.dblclick();
      await expect(dialog()).toHaveCount(0);
      await expect(quick).toBeDisabled();
      report.pendingBounds = await quick.boundingBox();
      assert.equal(report.pendingBounds.width, report.idleBounds.width);
      assert(Math.abs(report.pendingBounds.y - report.idleBounds.y) <= 1);
      assert(Math.abs(report.pendingBounds.x - report.idleBounds.x) <= 1);
      await shot("quick-pending-stable-320", false);
      await expect(p.locator(".admin-person-status")).toContainText(
        "Checked in",
        { timeout: 12000 },
      );
      await expect(quick).toHaveCount(0);
      await expect(p.locator(".bulk-bar")).toHaveCount(0);
      assert.equal(
        report.requests.filter((r) => r.action === "quick-check-in").length,
        1,
      );
      await shot("quick-persisted-checked-in");
      await p
        .getByRole("button", { name: "Change Dave status", exact: true })
        .tap();
      report.dropdown = await p
        .getByRole("combobox", { name: "New status", exact: true })
        .inputValue();
      assert.equal(report.dropdown, "Checked in");
      await shot("quick-fresh-status-dropdown", false);
      await p.keyboard.press("Escape");
    },
  );
  await run("one persistent 503 error with selection retained", async () => {
    phase = "failure";
    await setStatus("fake_dave", "Registered");
    await p.setViewportSize({ width: 390, height: 480 });
    await people("registered");
    await p
      .getByRole("checkbox", { name: "Select dave@portal.test", exact: true })
      .check();
    await p
      .getByRole("combobox", {
        name: "Individual approval status",
        exact: true,
      })
      .selectOption("approved");
    failNext = true;
    await p.getByRole("button", { name: "Update approval", exact: true }).tap();
    await confirm();
    await expect(p.locator('.action-message[data-tone="error"]')).toContainText(
      "Synthetic 503",
    );
    await expect(p.locator(".bulk-bar")).toContainText("1 selected");
    assert.equal(
      await p
        .getByText(
          "Synthetic 503: participant service unavailable. Try again.",
          { exact: true },
        )
        .count(),
      1,
    );
    assert.equal(
      await p
        .locator(".error-message")
        .filter({ hasText: "Synthetic 503" })
        .count(),
      0,
    );
    await shot("one-error-selection-retained");
    await setStatus("fake_dave", "Going");
  });
  // Restore participant state before any date or Alice context work.
  for (const old of initial) {
    const row = (await roster()).find((r) => r.id === old.id);
    if (row.status !== old.status || row.checked_in !== old.checked_in)
      await setStatus(old.id, old.status);
  }
  report.restored = (await roster())
    .filter((r) => ["fake_carol", "fake_dave"].includes(r.id))
    .map((r) => ({ id: r.id, status: r.status, checked_in: r.checked_in }));
  for (const r of report.restored) {
    assert.equal(r.status, "Going");
    assert.equal(r.checked_in, null);
  }
  save();
  await run(
    "first Publish confirms both IST dates and warnings, then persists and reloads",
    async () => {
      phase = "dates";
      await p.goto(origin + "/admin/settings", {
        waitUntil: "networkidle",
        timeout: 60000,
      });
      const settings = await (
        await c.request.get(origin + "/api/portal?view=%2Fadmin%2Fsettings")
      ).json();
      report.originalWindow = {
        open: settings.policy.submissionOpen,
        close: settings.policy.submissionClose,
      };
      const dates = submissionWindowValues(
        "2026-10-24T08:00",
        "2026-11-01T20:00",
      );
      report.requestedWindow = dates;
      const window = p.locator(".admin-window");
      await window
        .locator('input[aria-label="Opens (IST)"]')
        .fill("2026-10-24T08:00");
      await window
        .locator('input[aria-label="Closes (IST)"]')
        .fill("2026-11-01T20:00");
      await window.getByRole("button", { name: "Publish", exact: true }).tap();
      await dialog().waitFor();
      assert.equal(
        report.requests.filter((r) => r.action === "preview-submission-window")
          .length,
        1,
      );
      assert.equal(
        report.requests.filter((r) => r.action === "publish-submission-window")
          .length,
        0,
      );
      await expect(dialog()).toContainText(ist(dates.open));
      await expect(dialog()).toContainText(ist(dates.close));
      await expect(dialog()).toContainText("Repository creation");
      report.confirmationText = await dialog().innerText();
      await shot("date-first-click-confirmation", false);
      await dialog().evaluate((d) => (d.scrollTop = 0));
      await shot("date-confirmation-dates-top", false);
      await confirm();
      await expect(dialog()).toHaveCount(0);
      assert.equal(
        report.requests.filter((r) => r.action === "publish-submission-window")
          .length,
        1,
      );
      const persisted = await (
        await c.request.get(origin + "/api/portal?view=%2Fadmin%2Fsettings")
      ).json();
      report.persistedWindow = {
        open: persisted.policy.submissionOpen,
        close: persisted.policy.submissionClose,
      };
      assert.equal(
        Date.parse(report.persistedWindow.open),
        Date.parse(dates.open),
      );
      assert.equal(
        Date.parse(report.persistedWindow.close),
        Date.parse(dates.close),
      );
      await p.reload({ waitUntil: "networkidle" });
      await expect(
        window.locator('input[aria-label="Opens (IST)"]'),
      ).toHaveValue(utcToISTInput(dates.open));
      await expect(
        window.locator('input[aria-label="Closes (IST)"]'),
      ).toHaveValue(utcToISTInput(dates.close));
      await shot("dates-persist-after-reload");
    },
  );
  await c.close();
  c = await b.newContext({
    viewport: { width: 390, height: 480 },
    isMobile: true,
    hasTouch: true,
    reducedMotion: "reduce",
    serviceWorkers: "block",
  });
  await c.addCookies([
    { name: "portal_local_fixture", value: "alice", url: origin },
  ]);
  await c.route("**/*", (route) => {
    const r = route.request(),
      u = new URL(r.url());
    if (u.origin !== origin || !["GET", "HEAD"].includes(r.method())) {
      report.errors.push({
        blockedAliceMutation: r.method(),
        path: u.pathname,
      });
      return route.abort("blockedbyclient");
    }
    return route.continue();
  });
  p = await c.newPage();
  p.setDefaultTimeout(15000);
  await run(
    "Alice leader inputs are editable with exactly two attempts and no save/submit",
    async () => {
      const before = await (
        await c.request.get(origin + "/api/portal?view=%2Fdashboard")
      ).json();
      const attempts =
        before.submissionAccess?.attemptsUsed ?? before.attempts?.length;
      report.aliceAccess = before.submissionAccess;
      assert.equal(attempts, 2);
      await p.goto(origin + "/dashboard", {
        waitUntil: "networkidle",
        timeout: 60000,
      });
      await p.getByRole("tab", { name: "Project", exact: true }).tap();
      await p
        .getByRole("button", { name: "Update project", exact: true })
        .tap();
      const field = p.locator('input[name="projectName"]');
      await expect(field).toBeEnabled();
      await expect(field).toBeEditable();
      await field.tap();
      await expect(field).toBeFocused();
      await p.keyboard.press("ArrowRight");
      await shot("alice-project-input-editable-no-save");
      const after = await (
        await c.request.get(origin + "/api/portal?view=%2Fdashboard")
      ).json();
      assert.equal(
        after.submissionAccess?.attemptsUsed ?? after.attempts?.length,
        2,
      );
    },
  );
} catch (error) {
  report.errors.push(String(error.stack || error));
  save();
} finally {
  report.endSource = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  report.endPortalSHA256 = createHash("sha256")
    .update(readFileSync(root + "/app/portal.tsx"))
    .digest("hex");
  save();
  await c.close().catch(() => {});
  await b.close();
}
console.log(
  JSON.stringify({
    checks: report.checks.length,
    passed: report.checks.filter((x) => x.passed).length,
    screenshots: report.screenshots.length,
    errors: report.errors.length,
    closed: true,
  }),
);
process.exitCode =
  report.errors.length || report.checks.some((x) => !x.passed) ? 1 : 0;
