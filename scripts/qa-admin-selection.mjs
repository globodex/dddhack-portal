import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { revealConfirmation } from "../lib/action-confirmation.ts";
const origin = "http://localhost:3000",
  root = "/workspace/dddhack-portal";
const mode = process.env.ADMIN_SELECTION_MODE || "before";
const output =
  process.env.ADMIN_SELECTION_OUTPUT || "evidence/admin-selection-before";
mkdirSync(output, { recursive: true });
const report = {
  mode,
  syntheticOnly: true,
  allowedIds: ["fake_carol", "fake_dave"],
  source: execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim(),
  portalSHA256: createHash("sha256")
    .update(readFileSync(root + "/app/portal.tsx"))
    .digest("hex"),
  viewport: { width: 390, height: 480 },
  writes: [],
  checks: [],
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
const c = await b.newContext({
  viewport: report.viewport,
  isMobile: true,
  hasTouch: true,
  reducedMotion: "reduce",
  serviceWorkers: "block",
});
await c.addCookies([
  { name: "portal_local_fixture", value: "owner", url: origin },
]);
const roster = async () => {
  const r = await c.request.get(
    origin + "/api/portal?view=%2Fadmin%2Fparticipants",
  );
  assert.equal(r.status(), 200);
  return (await r.json()).items;
};
let initial = [];
const setStatus = async (id, status) => {
  assert(report.allowedIds.includes(id));
  assert(["Registered", "Going"].includes(status));
  const values = {
    kind: "person",
    targetId: id,
    status,
    reason: "Synthetic UI regression fixture",
  };
  const r = await c.request.post(origin + "/api/portal", {
    headers: { Origin: origin },
    data: {
      action: "admin-status",
      data: {
        ...values,
        confirmation: revealConfirmation("admin-status", values),
      },
    },
  });
  assert(r.ok(), JSON.stringify(await r.json()));
  report.writes.push({
    source: "fixture setup/restore",
    action: "admin-status",
    targetId: id,
    status,
  });
  save();
};
await c.route("**/*", (route) => {
  const r = route.request(),
    u = new URL(r.url());
  if (u.origin !== origin) return route.abort("blockedbyclient");
  if (r.method() === "POST" && u.pathname === "/api/portal") {
    const body = r.postDataJSON();
    assert.equal(body.action, "participant-bulk");
    assert.equal(body.data.status, "approved");
    assert.deepEqual(body.data.emails, ["dave@portal.test"]);
    report.writes.push({
      source: "actual browser action",
      action: body.action,
      data: body.data,
    });
    save();
  }
  return route.continue();
});
const p = await c.newPage();
p.setDefaultTimeout(15000);
p.on("pageerror", (e) => report.errors.push(e.message));
const shot = async (name, fullPage) => {
  const file = output + "/" + name + ".png";
  await p.screenshot({
    path: file,
    fullPage,
    animations: "disabled",
    caret: "initial",
    style: "nextjs-portal{visibility:hidden!important}",
  });
  report.screenshots.push({ path: file, fullPage, inspected: false });
  save();
};
try {
  const health = await (await c.request.get(origin + "/api/health")).json();
  assert.match(
    JSON.stringify(health),
    /synthetic/,
    "Only synthetic local runtime is allowed",
  );
  const items = await roster();
  initial = items.filter((r) => report.allowedIds.includes(r.id));
  assert.equal(initial.length, 2);
  for (const row of initial) {
    assert.equal(row.status, "Going");
    assert.equal(row.teamStatus, "Locked");
    assert(!row.checked_in);
  }
  report.initial = initial.map((r) => ({
    id: r.id,
    email: r.email,
    status: r.status,
    checked_in: r.checked_in,
    teamStatus: r.teamStatus,
  }));
  save();
  await setStatus("fake_dave", "Registered");
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
    .selectOption("registered");
  await p
    .getByRole("combobox", { name: "Team status", exact: true })
    .selectOption("locked");
  await expect(p.locator(".participants-table tbody tr")).toHaveCount(1);
  await expect(p.locator(".participants-table tbody tr").first()).toContainText(
    "Dave",
  );
  await p
    .getByRole("checkbox", { name: "Select dave@portal.test", exact: true })
    .check();
  await p
    .getByRole("combobox", { name: "Individual approval status", exact: true })
    .selectOption("approved");
  await p.getByRole("button", { name: "Update approval", exact: true }).tap();
  const d = p.locator(".confirmation-dialog[open]");
  await d.waitFor();
  await d.getByRole("button").last().tap();
  await expect(p.locator(".participants-table tbody tr")).toHaveCount(0);
  await expect(p.locator(".bulk-bar")).toContainText("1 selected");
  await expect(p.locator(".action-message")).toContainText("Going");
  report.observed = {
    rows: await p.locator(".participants-table tbody tr").count(),
    bulk: await p.locator(".bulk-bar").innerText(),
    toast: await p.locator(".action-message").innerText(),
    personalFilter: await p
      .getByRole("combobox", { name: "Personal status", exact: true })
      .inputValue(),
    teamFilter: await p
      .getByRole("combobox", { name: "Team status", exact: true })
      .inputValue(),
  };
  report.checks.push({
    name: "Original stale selection reproduced with actual Registered + Locked data",
    passed: true,
  });
  await p.evaluate(() => scrollTo(0, 0));
  await shot("before-stale-selection-full", true);
  await p.locator(".bulk-bar").scrollIntoViewIfNeeded();
  await shot("before-stale-selection-short", false);
  save();
} catch (error) {
  report.errors.push(String(error.stack || error));
  save();
} finally {
  try {
    if (initial.length) {
      const rows = await roster();
      for (const original of initial) {
        const current = rows.find((r) => r.id === original.id);
        if (current.status !== original.status)
          await setStatus(original.id, original.status);
      }
      const restored = await roster();
      report.restored = restored
        .filter((r) => report.allowedIds.includes(r.id))
        .map((r) => ({ id: r.id, status: r.status, checked_in: r.checked_in }));
      for (const original of initial) {
        const current = restored.find((r) => r.id === original.id);
        assert.equal(current.status, original.status);
        assert.equal(current.checked_in, original.checked_in);
      }
    }
  } catch (error) {
    report.errors.push("Fixture restore: " + String(error.stack || error));
  }
  save();
  await b.close();
}
console.log(
  JSON.stringify({
    checks: report.checks.length,
    screenshots: report.screenshots.length,
    errors: report.errors.length,
    closed: true,
  }),
);
process.exitCode = report.errors.length ? 1 : 0;
