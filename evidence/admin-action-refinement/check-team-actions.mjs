import { chromium, expect as baseExpect } from "@playwright/test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
const expect = baseExpect.configure({ timeout: 20000 }),
  origin = "http://localhost:3011",
  out = "evidence/admin-action-refinement/team-actions";
mkdirSync(out, { recursive: true });
const report = {
  syntheticOnly: true,
  source: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  checks: [],
  requests: [],
  screenshots: [],
  errors: [],
  artificialPendingDelayMs: 1200,
};
for (const file of [
  "app/admin-team-actions.tsx",
  "app/admin-experience.css",
  "app/portal.tsx",
  "app/confirmation-dialog.tsx",
  "lib/action-confirmation.ts",
])
  (report.files ??= {})[file] = createHash("sha256")
    .update(readFileSync(file))
    .digest("hex");
const save = () =>
  writeFileSync(
    out + "/actions-report.json",
    JSON.stringify(report, null, 2) + "\n",
  );
const db = new DatabaseSync(
  "/tmp/ddd-admin-action-refinement-8856-team-actions.sqlite",
  { readOnly: true },
);
const snapshot = () => ({
  team: db.prepare("SELECT * FROM teams WHERE id='fake_team3'").get(),
  lock: db.prepare("SELECT * FROM team_locks WHERE team_id='fake_team3'").get(),
  idea: db.prepare("SELECT * FROM ideas WHERE team_id='fake_team3'").get(),
  members: db
    .prepare(
      "SELECT user_id FROM memberships WHERE team_id='fake_team3' ORDER BY user_id",
    )
    .all(),
  versions: db
    .prepare(
      "SELECT id,team_id,attempt,payload FROM submission_versions ORDER BY id",
    )
    .all(),
  pending: db
    .prepare("SELECT * FROM registrations WHERE email='pending@portal.test'")
    .get(),
  alice: db
    .prepare("SELECT * FROM memberships WHERE user_id='fake_alice'")
    .get(),
});
report.before = snapshot();
assert.equal(report.before.members.length, 3);
assert(report.before.lock);
assert.equal(report.before.team.name, "Common Ground");
const b = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    headless: true,
    chromiumSandbox: false,
  }),
  c = await b.newContext({
    viewport: { width: 390, height: 480 },
    hasTouch: true,
    reducedMotion: "reduce",
    serviceWorkers: "block",
  });
await c.addCookies([
  { name: "portal_local_fixture", value: "owner", url: origin },
]);
let fail = false,
  delay = false;
await c.route("**/*", async (route) => {
  const req = route.request();
  if (new URL(req.url()).origin !== origin)
    return route.abort("blockedbyclient");
  if (req.method() === "POST") {
    const body = req.postDataJSON();
    assert(
      ["admin-add-team-member", "admin-rename-team"].includes(body.action),
    );
    assert.equal(body.data.teamId, "fake_team3");
    report.requests.push(body);
    save();
    if (fail) {
      fail = false;
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        json: {
          code: "SERVICE_UNAVAILABLE",
          message: "Synthetic 503: team update unavailable. Try again.",
        },
      });
    }
    if (delay) {
      delay = false;
      await new Promise((r) => setTimeout(r, 1200));
    }
  }
  return route.continue();
});
const p = await c.newPage();
p.on("pageerror", (e) => report.errors.push(String(e)));
p.setDefaultTimeout(20000);
const child = (name) => p.getByRole("dialog", { name, exact: true }),
  confirmation = () => p.locator(".confirmation-dialog[open]");
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
async function check(name, fn) {
  await fn();
  report.checks.push({ name, passed: true });
  save();
}
async function openTeam(name, action) {
  await p.goto(origin + "/admin/teams", {
    waitUntil: "networkidle",
    timeout: 60000,
  });
  const menu = p.getByRole("button", {
    name: `Change ${name} status`,
    exact: true,
  });
  await expect(menu).toBeEnabled();
  await menu.tap();
  const parent = child(`Change ${name} status`);
  await expect(
    parent.getByRole("button", { name: action, exact: true }),
  ).toBeEnabled();
  await parent.getByRole("button", { name: action, exact: true }).tap();
  const d = child(action);
  await expect(d).toBeVisible();
  return d;
}
async function search(d, text) {
  await d.getByRole("searchbox").fill(text);
  await expect(d.locator(".admin-team-candidates")).toHaveAttribute(
    "aria-busy",
    "false",
  );
}
try {
  await check(
    "Locked rename: exact target, cancel preserves old value and restores focus to its still-open parent dialog",
    async () => {
      const d = await openTeam("Common Ground", "Rename team");
      await d
        .getByRole("textbox", { name: "Team name" })
        .fill("Common Ground refined");
      const submit = d.getByRole("button", { name: "Rename", exact: true });
      await submit.tap();
      await expect(confirmation()).toBeVisible();
      await expect(confirmation()).toContainText(
        "Common Ground → Common Ground refined",
      );
      assert.equal(report.requests.length, 0);
      await shot("rename-confirmation-390");
      await p.keyboard.press("Escape");
      await expect(confirmation()).toHaveCount(0);
      await expect(submit).toBeEnabled();
      await expect(submit).toBeFocused();
      await expect(d.getByRole("textbox", { name: "Team name" })).toHaveValue(
        "Common Ground refined",
      );
      assert.equal(snapshot().team.name, "Common Ground");
    },
  );
  await check(
    "Locked rename persists once, expectedName unchanged, survives reload and retains lock/crown/idea/history",
    async () => {
      const d = child("Rename team");
      await d.getByRole("button", { name: "Rename", exact: true }).tap();
      await confirmation()
        .getByRole("button", { name: "Rename team", exact: true })
        .tap();
      await expect(d).toHaveCount(0);
      await p.reload({ waitUntil: "networkidle" });
      await expect(
        p.getByRole("button", {
          name: "Toggle Common Ground refined details",
          exact: true,
        }),
      ).toBeEnabled();
      assert.equal(
        report.requests.filter((r) => r.action === "admin-rename-team").length,
        1,
      );
      assert.deepEqual(report.requests[0].data, {
        teamId: "fake_team3",
        name: "Common Ground refined",
        expectedName: "Common Ground",
        confirmation: "RENAME_TEAM",
      });
      const now = snapshot();
      assert.equal(now.team.name, "Common Ground refined");
      for (const key of ["lock", "idea", "versions", "alice"])
        assert.deepEqual(now[key], report.before[key]);
      assert.equal(now.team.leader_id, report.before.team.leader_id);
      await p.setViewportSize({ width: 1440, height: 900 });
      await shot("renamed-locked-team-1440");
    },
  );
  await check(
    "Add registered pending member: exact person/team confirmation, cancel no POST and keyboard returns to candidate",
    async () => {
      await p.setViewportSize({ width: 320, height: 480 });
      const d = await openTeam("Common Ground refined", "Add member");
      await search(d, "pending@portal.test");
      const add = d.getByRole("button", {
        name: "Add Pending to Common Ground refined",
        exact: true,
      });
      await expect(add).toBeEnabled();
      await add.tap();
      await expect(confirmation()).toBeVisible();
      await expect(confirmation()).toContainText(
        "pending@portal.test → Common Ground refined",
      );
      await shot("add-member-confirmation-320");
      await confirmation()
        .getByRole("button", { name: "Cancel", exact: true })
        .tap();
      await expect(confirmation()).toHaveCount(0);
      await expect(add).toBeEnabled();
      await expect(add).toBeFocused();
      assert.equal(
        report.requests.filter((r) => r.action === "admin-add-team-member")
          .length,
        0,
      );
    },
  );
  await check(
    "503 preserves candidate/search/modal with one full actionable local error and retry available",
    async () => {
      const d = child("Add member");
      fail = true;
      await d
        .getByRole("button", {
          name: "Add Pending to Common Ground refined",
          exact: true,
        })
        .tap();
      await confirmation()
        .getByRole("button", { name: "Add member", exact: true })
        .tap();
      await expect(d.getByRole("alert")).toHaveText(
        "Synthetic 503: team update unavailable. Try again.",
      );
      await expect(
        p.getByText("Synthetic 503: team update unavailable. Try again.", {
          exact: true,
        }),
      ).toHaveCount(1);
      await expect(d.getByRole("searchbox")).toHaveValue("pending@portal.test");
      await expect(
        d.getByRole("button", {
          name: "Add Pending to Common Ground refined",
          exact: true,
        }),
      ).toBeEnabled();
      assert.equal(snapshot().members.length, 3);
      await shot("add-member-503-retained-320");
    },
  );
  await check(
    "Retry adds registered Pending to locked team once without changing approval; all existing private invariants preserved",
    async () => {
      const d = child("Add member");
      delay = true;
      await d
        .getByRole("button", {
          name: "Add Pending to Common Ground refined",
          exact: true,
        })
        .tap();
      await confirmation()
        .getByRole("button", { name: "Add member", exact: true })
        .tap();
      await expect(
        d.getByRole("button", {
          name: "Add Pending to Common Ground refined",
          exact: true,
        }),
      ).toBeDisabled();
      await expect(d.getByRole("searchbox")).toBeDisabled();
      await shot("add-member-pending-320");
      await expect(d).toHaveCount(0);
      const now = snapshot();
      assert.equal(now.members.length, 4);
      assert(now.members.some((r) => r.user_id === "fake_pending"));
      assert.deepEqual(now.pending, report.before.pending);
      for (const key of ["lock", "idea", "versions", "alice"])
        assert.deepEqual(now[key], report.before[key]);
      assert.equal(now.team.leader_id, report.before.team.leader_id);
      await p.reload({ waitUntil: "networkidle" });
      await expect(
        p.getByText("Pending", { exact: true }).first(),
      ).toBeVisible();
      await shot("locked-team-four-members-320");
    },
  );
  await check(
    "Fifth member persists and refreshed picker blocks all sixth-member actions while preserving existing membership",
    async () => {
      const d = await openTeam("Common Ground refined", "Add member");
      await search(d, "candidate-00@portal.test");
      await expect(
        d.getByRole("button", {
          name: "Add Synthetic Candidate 00 to Common Ground refined",
          exact: true,
        }),
      ).toBeEnabled();
      await d
        .getByRole("button", {
          name: "Add Synthetic Candidate 00 to Common Ground refined",
          exact: true,
        })
        .tap();
      await confirmation()
        .getByRole("button", { name: "Add member", exact: true })
        .tap();
      await expect(d).toHaveCount(0);
      assert.equal(snapshot().members.length, 5);
      const full = await openTeam("Common Ground refined", "Add member");
      await expect(
        full.getByText("This team already has five members.", { exact: true }),
      ).toBeVisible();
      await expect(
        full.getByText("5 / 5 members", { exact: true }),
      ).toBeVisible();
      assert.equal(
        await full.locator(".admin-team-candidates button:enabled").count(),
        0,
      );
      await shot("five-member-team-blocked-320");
      await p.keyboard.press("Escape");
      await expect(full).toHaveCount(0);
      await expect(child("Change Common Ground refined status")).toBeVisible();
      await p.keyboard.press("Escape");
      await p.setViewportSize({ width: 1440, height: 900 });
      await shot("locked-team-five-members-1440");
    },
  );
  await check(
    "Shared credit-trash confirmation Escape now restores exact opener without deletion",
    async () => {
      await p.setViewportSize({ width: 390, height: 480 });
      await p.goto(origin + "/admin/credits", {
        waitUntil: "networkidle",
        timeout: 60000,
      });
      await expect(
        p.getByRole("button", { name: /^Add more / }).first(),
      ).toBeEnabled();
      await p.locator(".credit-upload-management > summary").tap();
      const del = p.getByRole("button", {
        name: "Delete column: Builder resources",
        exact: true,
      });
      await del.focus();
      await p.keyboard.press("Enter");
      await expect(confirmation()).toBeVisible();
      await p.keyboard.press("Escape");
      await expect(confirmation()).toHaveCount(0);
      await expect(del).toBeEnabled();
      await expect(del).toBeFocused();
      await shot("credit-trash-cancel-focus-restored");
    },
  );
  report.after = snapshot();
  for (const key of ["lock", "idea", "versions", "alice", "pending"])
    assert.deepEqual(report.after[key], report.before[key]);
  assert.equal(report.after.team.leader_id, report.before.team.leader_id);
  assert.equal(report.after.members.length, 5);
  assert.equal(
    report.requests.filter((r) => r.action === "admin-rename-team").length,
    1,
  );
  assert.equal(
    report.requests.filter((r) => r.action === "admin-add-team-member").length,
    3,
  );
  assert.equal(report.errors.length, 0);
} catch (e) {
  report.checks.push({
    name: "FAILED",
    passed: false,
    error: String(e.stack || e),
  });
  await shot("FAILED-team-actions").catch(() => {});
  throw e;
} finally {
  report.closed = true;
  save();
  await c.close();
  await b.close();
  db.close();
}
