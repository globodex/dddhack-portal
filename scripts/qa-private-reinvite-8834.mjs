// Explicitly authorized four-action flow on root's disposable8834 clone only.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { resolve } from "node:path";
import { chromium, expect } from "@playwright/test";

assert.equal(
  process.env.INVITE_PRIVATE_BACKEND,
  "8834",
  "Root's explicit private fixture signal is required",
);
const origin = "http://localhost:3000",
  root = "/workspace/dddhack-portal";
const source = execFileSync("git", ["rev-parse", "dccfdc2"], {
  cwd: root,
  encoding: "utf8",
}).trim();
const output = resolve("evidence/private-reinvite-8834");
mkdirSync(output, { recursive: true });
const verify = () =>
  execFileSync(
    "git",
    [
      "diff",
      "--quiet",
      source,
      "HEAD",
      "--",
      "app",
      "lib",
      "neon",
      "next.config.ts",
    ],
    { cwd: root },
  );
verify();
const resumed = process.env.RESUME_REINVITE === "1";
const report = resumed
  ? JSON.parse(readFileSync(resolve(output, "report.json"), "utf8"))
  : {
      source,
      backend: 8834,
      origin,
      syntheticOnly: true,
      disposable: true,
      viewport: { width: 390, height: 844 },
      startedAt: new Date().toISOString(),
      writes: [],
      checks: [],
      screenshots: [],
      snapshots: [],
      blocked: [],
      errors: [],
    };
if (resumed) {
  assert.equal(report.source, source);
  assert.equal(report.writes.length, 2);
  assert.ok(report.writes.every((row) => row.status === 200));
  report.harnessAttempts = [
    ...(report.harnessAttempts || []),
    {
      failure: report.failure,
      finishedAt: report.finishedAt,
      classified:
        "Disclosure was already open; unconditional tap closed it before email fill. No resend POST.",
    },
  ];
  delete report.failure;
  delete report.finishedAt;
  delete report.result;
  report.resumedAt = new Date().toISOString();
}
const save = () =>
  writeFileSync(
    resolve(output, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
const check = (name, passed, details = {}) => {
  report.checks.push({ name, passed, ...details });
  save();
  assert.ok(passed, name);
};
async function api(actor, view) {
  const r = await fetch(
    origin + "/api/portal?view=" + encodeURIComponent(view),
    { headers: { cookie: "portal_local_fixture=" + actor } },
  );
  return { status: r.status, body: await r.json() };
}
function facts(data) {
  return {
    actor: data.me?.id,
    team: data.team
      ? {
          id: data.team.id,
          leader: data.team.leader_id,
          locked: data.team.locked,
        }
      : null,
    members: (data.members || []).map((row) => row.id),
    actions: (data.actions || [])
      .filter((row) => row.kind === "invite" && row.user_id === "fake_pending")
      .map((row) => ({
        id: row.id,
        status: row.status,
        teamId: row.team_id,
        userId: row.user_id,
      })),
  };
}
async function snapshot(actor, label) {
  const r = await api(actor, "/dashboard");
  assert.equal(r.status, 200);
  assert.equal(r.body.localTest, true);
  const state = facts(r.body);
  report.snapshots.push({ label, ...state });
  save();
  return state;
}
let browser, currentPage;
let permit = null;
const contexts = new Set();
async function session(actor) {
  const context = await browser.newContext({
    viewport: report.viewport,
    isMobile: true,
    hasTouch: true,
    reducedMotion: "reduce",
    serviceWorkers: "block",
  });
  contexts.add(context);
  await context.addCookies([
    {
      name: "portal_local_fixture",
      value: actor,
      url: origin,
      httpOnly: true,
      sameSite: "Strict",
    },
  ]);
  await context.route("**/*", (route) => {
    const request = route.request(),
      url = new URL(request.url());
    if (url.origin !== origin) {
      report.blocked.push({
        actor,
        kind: "external",
        method: request.method(),
        path: url.pathname,
      });
      save();
      return route.abort("blockedbyclient");
    }
    if (
      !["GET", "HEAD"].includes(request.method()) &&
      !url.pathname.startsWith("/__nextjs_")
    ) {
      let payload;
      try {
        payload = request.postDataJSON();
      } catch {}
      if (
        request.method() !== "POST" ||
        url.pathname !== "/api/portal" ||
        !permit ||
        permit.actor !== actor ||
        payload?.action !== permit.action ||
        !isDeepStrictEqual(payload.data, permit.data)
      ) {
        report.blocked.push({
          actor,
          kind: "unallowlisted-write",
          action: payload?.action,
          method: request.method(),
        });
        save();
        return route.abort("blockedbyclient");
      }
      report.writes.push({
        actor,
        action: payload.action,
        data: payload.data,
        phase: permit.phase,
      });
      permit = null;
      save();
    }
    return route.continue();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  currentPage = page;
  page.on("pageerror", (error) => {
    report.errors.push({ actor, error: error.message });
    save();
  });
  return { actor, page, context };
}
async function load(s) {
  currentPage = s.page;
  await s.page.goto(origin + "/dashboard#team", {
    waitUntil: "networkidle",
    timeout: 60000,
  });
  await s.page.locator('.app-shell[data-hydrated="true"]').waitFor();
  await s.page.locator(".dashboard-v6").waitFor();
}
async function shot(s, label, locator) {
  if (locator) await locator.scrollIntoViewIfNeeded();
  await s.page
    .locator("img:visible")
    .evaluateAll((images) =>
      Promise.all(images.map((image) => image.decode())),
    );
  const file = label + ".png";
  await s.page.screenshot({
    path: resolve(output, file),
    animations: "disabled",
    style: "nextjs-portal{visibility:hidden!important}",
  });
  report.screenshots.push({ file, actor: s.actor, source, inspected: false });
  save();
}
async function action(s, phase, name, data, trigger) {
  currentPage = s.page;
  assert.equal(permit, null);
  permit = { actor: s.actor, phase, action: name, data };
  const response = s.page
    .waitForResponse(
      (r) => {
        if (
          r.request().method() !== "POST" ||
          new URL(r.url()).pathname !== "/api/portal"
        )
          return false;
        try {
          return r.request().postDataJSON().action === name;
        } catch {
          return false;
        }
      },
      { timeout: 20000 },
    )
    .then(
      (value) => ({ value }),
      (error) => ({ error }),
    );
  await trigger.tap();
  const confirm = s.page.locator("dialog.confirmation-dialog");
  await confirm.waitFor({ state: "visible" });
  const confirmationName =
    name === "team-invite"
      ? "Send invitation"
      : data.decision === "accepted"
        ? "Join team"
        : "Decline";
  await confirm
    .getByRole("button", { name: confirmationName, exact: true })
    .tap();
  const received = await response;
  if (received.error) throw received.error;
  const result = received.value;
  const body = await result.json();
  report.writes.at(-1).status = result.status();
  report.writes.at(-1).result = body;
  save();
  assert.equal(result.status(), 200, phase + ": " + JSON.stringify(body));
  assert.equal(
    permit,
    null,
    "Exactly one allowlisted request must consume permission",
  );
  await expect(confirm).not.toBeVisible();
  await s.page.waitForLoadState("networkidle");
  return body;
}

try {
  const before = await snapshot("bob", "initial-bob");
  check(
    "Private Bob fixture is the unlocked three-member team",
    before.actor === "fake_bob" &&
      before.team?.id === "fake_team3" &&
      before.team.leader === "fake_bob" &&
      !before.team.locked &&
      before.members.length === 3,
  );
  const pendingProfile = await api("pending", "/dashboard");
  if (
    pendingProfile.status !== 200 ||
    pendingProfile.body.registration?.status !== "approved"
  ) {
    const body = {
      action: "admin-status",
      data: {
        kind: "person",
        targetId: "fake_pending",
        status: "Going",
        confirmation: "CHANGE_STATUS",
      },
    };
    const r = await fetch(origin + "/api/portal", {
      method: "POST",
      headers: {
        origin,
        "content-type": "application/json",
        cookie: "portal_local_fixture=owner",
      },
      body: JSON.stringify(body),
    });
    const result = await r.json();
    report.writes.push({
      actor: "owner",
      phase: "authorized-existing-Going-fixture-setup",
      ...body,
      status: r.status,
      result,
    });
    save();
    assert.equal(r.status, 200, "Existing admin-status Going setup");
  }
  const pendingBefore = await snapshot("pending", "initial-pending");
  check(
    "Recipient starts without a team",
    pendingBefore.team === null && pendingBefore.members.length === 0,
  );
  browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    headless: true,
    chromiumSandbox: false,
  });
  const bob = await session("bob"),
    pending = await session("pending");
  let first = resumed ? report.writes[0].result : null;
  if (!resumed) {
    await load(bob);
    const settings = bob.page.locator(".dashboard-team-settings");
    if (!(await settings.evaluate((el) => el.open)))
      await settings.locator("summary").tap();
    await settings
      .getByRole("textbox", { name: "Email", exact: true })
      .fill("pending@portal.test");
    first = await action(
      bob,
      "first-invitation",
      "team-invite",
      { teamId: "fake_team3", email: "pending@portal.test" },
      settings.getByRole("button", { name: "Send invitation", exact: true }),
    );
    check(
      "First invitation returned a committed ID",
      typeof first.id === "string" && first.id.length > 10,
      { id: first.id },
    );
    await shot(
      bob,
      "01-bob-first-invitation-sent",
      bob.page.locator(".team-settings-invite"),
    );
    await load(pending);
    const invitations = pending.page.getByRole("region", {
      name: "Team invitations",
    });
    // The existing section is named by aria-label but may not expose region until
    // the browser accessibility tree settles; its class is the stable UI target.
    const card = pending.page.locator(".team-invitations");
    await card.waitFor();
    await shot(pending, "02-pending-invitation-before-decline", card);
    const firstState = await snapshot("pending", "first-pending-invitation");
    check(
      "Recipient sees the first ID",
      firstState.actions.some(
        (row) => row.id === first.id && row.status === "pending",
      ),
    );
    await action(
      pending,
      "decline-first-invitation",
      "team-respond",
      { id: first.id, decision: "declined" },
      card.getByRole("button", { name: "Decline", exact: true }),
    );
    const declined = await snapshot("pending", "after-decline");
    check(
      "Actual decline200 leaves recipient teamless",
      declined.team === null &&
        !declined.actions.some((row) => row.status === "pending"),
    );
    await shot(
      pending,
      "03-pending-declined-teamless",
      pending.page.locator(".dashboard-empty-team"),
    );
  }
  await load(bob);
  const settings = bob.page.locator(".dashboard-team-settings");
  if (!(await settings.evaluate((el) => el.open)))
    await settings.locator("summary").tap();
  const retryForm = bob.page.locator(".team-settings-invite");
  await retryForm
    .getByRole("textbox", { name: "Email", exact: true })
    .fill("pending@portal.test");
  const second = await action(
    bob,
    "resend-after-decline",
    "team-invite",
    { teamId: "fake_team3", email: "pending@portal.test" },
    retryForm.getByRole("button", { name: "Send invitation", exact: true }),
  );
  check(
    "Resend200 uses a fresh invitation ID",
    typeof second.id === "string" && second.id !== first.id,
    { firstId: first.id, secondId: second.id },
  );
  await shot(
    bob,
    "04-bob-resend-success",
    bob.page.locator(".team-settings-invite"),
  );
  await load(pending);
  const nextCard = pending.page.locator(".team-invitations");
  await nextCard.waitFor();
  const secondState = await snapshot("pending", "second-pending-invitation");
  check(
    "Only the fresh pending invitation is current",
    secondState.actions.filter((row) => row.status === "pending").length ===
      1 &&
      secondState.actions.some(
        (row) => row.id === second.id && row.status === "pending",
      ),
  );
  await shot(pending, "05-pending-fresh-invitation", nextCard);
  await action(
    pending,
    "accept-fresh-invitation",
    "team-respond",
    { id: second.id, decision: "accepted" },
    nextCard.getByRole("button", { name: "Accept invitation", exact: true }),
  );
  const accepted = await snapshot("pending", "after-accept");
  check(
    "Actual accept200 joins Bob team as fourth member",
    accepted.team?.id === "fake_team3" &&
      accepted.members.length === 4 &&
      accepted.members.includes("fake_pending"),
  );
  await shot(
    pending,
    "06-pending-accepted-team-members",
    pending.page.locator(".dashboard-members"),
  );
  const leader = await snapshot("bob", "leader-after-accept");
  check(
    "Leader persisted view has exactly four current members",
    leader.members.length === 4 && leader.members.includes("fake_pending"),
  );
  verify();
  check(
    "Only four invitation actions plus optional Going setup were issued",
    report.writes.filter((row) => row.actor !== "owner").length === 4 &&
      report.blocked.length === 0 &&
      report.errors.length === 0,
  );
  report.result = "passed";
} catch (error) {
  report.result = "failed";
  report.failure = String(error.stack || error);
  if (currentPage && !currentPage.isClosed()) {
    try {
      await currentPage.screenshot({
        path: resolve(output, "FAIL-current-ui.png"),
        animations: "disabled",
        style: "nextjs-portal{visibility:hidden!important}",
      });
      report.screenshots.push({
        file: "FAIL-current-ui.png",
        source,
        inspected: false,
      });
    } catch {}
  }
  process.exitCode = 1;
} finally {
  for (const context of contexts) await context.close();
  await browser?.close();
  report.browserClosed = true;
  report.finishedAt = new Date().toISOString();
  save();
}
console.log(
  JSON.stringify(
    {
      result: report.result,
      checks: report.checks.length,
      writes: report.writes.map((row) => ({
        actor: row.actor,
        phase: row.phase,
        status: row.status,
      })),
      screenshots: report.screenshots.length,
      failure: report.failure,
    },
    null,
    2,
  ),
);
