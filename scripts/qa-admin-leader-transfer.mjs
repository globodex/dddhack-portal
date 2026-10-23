// Fresh disposable local control fixture only. Never creates or resets a database.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { chromium } from "playwright-core";
import { assertTeamWriteReset } from "./team-write-reset-guard.mjs";

if (process.env.CROWN_QA_READY !== "1") {
  console.log(
    "Prepared only. Requires a fresh disposable control-audit reset and explicit source/Worker receipt.",
  );
  process.exit(0);
}
const source = process.env.CROWN_QA_SOURCE;
const worker = process.env.CROWN_QA_WORKER;
const token = process.env.CROWN_QA_RESET_TOKEN;
const manifestPath = process.env.CROWN_QA_RESET_MANIFEST;
const artifactRoot = resolve(
  process.env.CROWN_QA_ARTIFACT_ROOT || process.cwd(),
);
const artifact = join(artifactRoot, "dist/server/index.js");
const origin = process.env.CROWN_QA_ORIGIN || "http://127.0.0.1:4176";
assert.equal(process.env.CROWN_QA_FRESH_FIXTURE, "1");
assert.match(source || "", /^[a-f0-9]{40}$/);
assert.match(worker || "", /^[a-f0-9]{64}$/);
assert.match(
  token || "",
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/,
);
assert.equal(manifestPath, "/tmp/ddehack-controls-" + token + ".json");
const hash = () =>
  createHash("sha256").update(readFileSync(artifact)).digest("hex");
const manifestBytes = readFileSync(manifestPath);
const manifest = JSON.parse(manifestBytes);
assertTeamWriteReset({
  manifest,
  path: manifestPath,
  token,
  source,
  worker,
  artifactRoot,
  origin,
});
assert.equal(hash(), worker);
assert.equal(
  execFileSync("git", ["-C", artifactRoot, "rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  source,
);
assert.equal(manifest.project?.id, "visual_project_alice");
assert.equal(manifest.actors?.leader?.id, "fake_alice");
assert.equal(manifest.actors?.nonleader?.id, "fake_review_one");
const mode = process.env.CROWN_QA_MODE || "desktop";
const sizes = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
  keyboard: { width: 1440, height: 900 },
};
assert.ok(Object.hasOwn(sizes, mode));
const output = resolve(
  process.env.CROWN_QA_OUTPUT || "evidence/v7-admin-crown-" + mode,
);
mkdirSync(output, { recursive: true });
writeFileSync("/tmp/ddehack-crown-write-" + token, "consumed\n", {
  flag: "wx",
});
const report = {
  source,
  worker,
  origin,
  mode,
  viewport: sizes[mode],
  syntheticOnly: true,
  chromiumSandbox: true,
  resetTokenHash: createHash("sha256").update(token).digest("hex"),
  resetManifestHash: createHash("sha256").update(manifestBytes).digest("hex"),
  checks: [],
  posts: [],
  blocked: [],
  pageErrors: [],
  captures: [],
};
const target = {
  teamId: "fake_team1",
  name: "Small Wonder",
  oldId: "fake_alice",
  oldName: "Alice",
  newId: "fake_review_one",
  newName: "Synthetic Member One",
};
const body = {
  teamId: target.teamId,
  userId: target.newId,
  expectedLeaderId: target.oldId,
  confirmation: "TRANSFER_TEAM_LEADER",
};
const forbiddenBody = {
  ...body,
  userId: "fake_review_two",
  expectedLeaderId: target.newId,
};
const actors = {
  admin: { id: "fake_admin", email: "admin@portal.test" },
  previous: manifest.actors.leader,
  next: manifest.actors.nonleader,
};
let browser,
  permit = null;
const sessions = new Map();
async function activate(locator) {
  await locator.scrollIntoViewIfNeeded();
  if (mode === "keyboard") {
    await locator.focus();
    return locator.press("Enter");
  }
  return mode === "mobile" ? locator.tap() : locator.click();
}
async function check(label, operation) {
  try {
    await operation();
    report.checks.push({ label, passed: true });
  } catch (error) {
    report.failedCheck = label;
    throw error;
  }
}
async function session(actor) {
  if (sessions.has(actor)) return sessions.get(actor);
  const identity = actors[actor];
  assert.ok(
    identity &&
      identity.id.startsWith("fake_") &&
      identity.email.endsWith("@portal.test"),
  );
  const context = await browser.newContext({
    viewport: sizes[mode],
    hasTouch: mode === "mobile",
    isMobile: mode === "mobile",
    serviceWorkers: "block",
    reducedMotion: "reduce",
  });
  await context.route("**/*", async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    if (url.origin !== origin) {
      report.blocked.push({ kind: "external", method: request.method() });
      return route.abort();
    }
    if (!["GET", "HEAD"].includes(request.method())) {
      let requestBody;
      try {
        requestBody = JSON.parse(request.postData() || "{}");
      } catch {}
      if (
        request.method() !== "POST" ||
        url.pathname !== "/api/portal" ||
        !permit ||
        permit.actor !== actor ||
        requestBody?.action !== "transfer-team-leader" ||
        !isDeepStrictEqual(requestBody.data, permit.data)
      ) {
        report.blocked.push({
          kind: "unallowlisted-write",
          actor,
          action: requestBody?.action,
        });
        return route.abort();
      }
      report.posts.push({
        actor,
        purpose: permit.purpose,
        action: requestBody.action,
      });
      permit = null;
    }
    return route.continue({
      headers: {
        ...request.headers(),
        "oai-authenticated-user-id": identity.id,
        "oai-authenticated-user-email": identity.email,
      },
    });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(12_000);
  page.on("pageerror", (error) => report.pageErrors.push(error.message));
  const value = { actor, page, context };
  sessions.set(actor, value);
  await page.goto(
    origin + (actor === "admin" ? "/admin/teams" : "/dashboard#project"),
    { waitUntil: "networkidle" },
  );
  return value;
}
async function view(session, path) {
  return session.page.evaluate(async (path) => {
    const response = await fetch(
      "/api/portal?view=" + encodeURIComponent(path),
      { cache: "no-store" },
    );
    return { status: response.status, value: await response.json() };
  }, path);
}
async function dashboard(session) {
  const result = await view(session, "/dashboard");
  assert.equal(result.status, 200);
  assert.equal(result.value.me.id, actors[session.actor].id);
  return result.value;
}
function snapshot(data) {
  return {
    teamId: data.team?.id,
    leaderId: data.team?.leader_id,
    locked: data.team?.locked,
    lockedAt: data.team?.lockedAt,
    members: data.members
      .map((member) => ({ id: member.id, role: member.role }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    attempts: data.attempts,
    attemptsUsed: data.submissionAccess.attemptsUsed,
    projectRevision: data.project?.revision,
    publishedVersionId: data.project?.published_version_id,
  };
}
async function capture(session, label) {
  const path = join(output, `${session.actor}-${mode}-${label}.png`);
  await session.page.screenshot({
    path,
    fullPage: false,
    animations: "disabled",
  });
  report.captures.push({
    path,
    actor: actors[session.actor].id,
    source,
    worker,
    viewport: sizes[mode],
    original: true,
  });
}
async function openConfirmation(admin) {
  const button = admin.page.getByRole("button", {
    name: `Make ${target.newName} team leader for ${target.name}`,
    exact: true,
  });
  await activate(button);
  const dialog = admin.page.getByRole("dialog");
  await dialog.waitFor();
  const text = await dialog.locator("#confirmation-target").innerText();
  assert.ok(text.includes(target.name), "Confirmation names the team");
  assert.ok(
    text.includes(target.oldName),
    "Confirmation names the previous leader",
  );
  assert.ok(text.includes(target.newName), "Confirmation names the new leader");
  assert.equal(
    await dialog
      .getByRole("button", { name: "Cancel", exact: true })
      .evaluate((node) => node === document.activeElement),
    true,
  );
  return dialog;
}
async function negativePost(session, data, purpose) {
  assert.equal(permit, null);
  permit = { actor: session.actor, data, purpose };
  const result = await session.page.evaluate(async (data) => {
    const response = await fetch("/api/portal", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "transfer-team-leader", data }),
      cache: "no-store",
    });
    const value = await response.json();
    return { status: response.status, code: value.code };
  }, data);
  assert.equal(permit, null);
  report.posts.at(-1).status = result.status;
  report.posts.at(-1).code = result.code;
  return result;
}
try {
  browser = await chromium.launch({
    headless: true,
    chromiumSandbox: true,
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  });
  const admin = await session("admin"),
    previous = await session("previous"),
    next = await session("next");
  const before = await dashboard(previous);
  await check(
    "fresh locked two-attempt team has the exact previous leader and current teammate",
    async () => {
      assert.equal(before.team.id, target.teamId);
      assert.equal(before.team.leader_id, target.oldId);
      assert.equal(before.team.locked, true);
      assert.equal(before.submissionAccess.attemptsUsed, 2);
      assert.equal(before.submissionAccess.isLeader, true);
      assert.equal(before.submissionAccess.canCommit, true);
      assert.equal(
        before.members.filter((member) => member.id === target.newId).length,
        1,
      );
      assert.equal(
        (await dashboard(next)).submissionAccess.personallyCheckedIn,
        false,
      );
      report.before = snapshot(before);
    },
  );
  await check(
    "named cancellation sends no POST and leaves the crown unchanged",
    async () => {
      const count = report.posts.length;
      const dialog = await openConfirmation(admin);
      await capture(admin, "cancel-confirmation");
      await activate(
        dialog.getByRole("button", { name: "Cancel", exact: true }),
      );
      await dialog.waitFor({ state: "hidden" });
      assert.equal(report.posts.length, count);
      assert.equal((await dashboard(previous)).team.leader_id, target.oldId);
    },
  );
  await check(
    "confirmed admin crown transfer commits exactly one UI POST",
    async () => {
      const dialog = await openConfirmation(admin);
      assert.equal(permit, null);
      permit = { actor: "admin", data: body, purpose: "positive-ui-transfer" };
      const response = admin.page.waitForResponse(
        (response) =>
          response.url() === origin + "/api/portal" &&
          response.request().method() === "POST",
      );
      await activate(dialog.getByRole("button").last());
      const result = await response;
      report.posts.at(-1).status = result.status();
      assert.equal(result.status(), 200);
      await dialog.waitFor({ state: "hidden" });
      await admin.page.waitForLoadState("networkidle");
      assert.equal(permit, null);
      await capture(admin, "after-transfer");
    },
  );
  const oldAfter = await dashboard(previous),
    newAfter = await dashboard(next);
  await check(
    "one new leader, unchanged membership, lock, private idea and submitted history",
    async () => {
      assert.equal(oldAfter.team.leader_id, target.newId);
      assert.equal(newAfter.team.leader_id, target.newId);
      assert.deepEqual(
        oldAfter.members.map((member) => member.id).sort(),
        before.members.map((member) => member.id).sort(),
      );
      assert.equal(
        newAfter.members.filter((member) => member.role === "leader").length,
        1,
      );
      assert.equal(
        newAfter.members.find((member) => member.role === "leader").id,
        target.newId,
      );
      assert.equal(newAfter.team.locked, true);
      assert.equal(newAfter.team.lockedAt, before.team.lockedAt);
      assert.deepEqual(newAfter.attempts, before.attempts);
      assert.equal(newAfter.submissionAccess.attemptsUsed, 2);
      assert.equal(
        JSON.stringify(newAfter.idea) === JSON.stringify(before.idea),
        true,
        "Private idea unchanged",
      );
      assert.equal(
        JSON.stringify(newAfter.project) === JSON.stringify(before.project),
        true,
        "Saved project unchanged",
      );
      report.after = snapshot(newAfter);
    },
  );
  await check(
    "old and new dashboards recheck crown and personal attendance permissions",
    async () => {
      assert.equal(oldAfter.submissionAccess.isLeader, false);
      assert.equal(oldAfter.submissionAccess.canCommit, false);
      assert.equal(newAfter.submissionAccess.isLeader, true);
      assert.equal(newAfter.submissionAccess.personallyCheckedIn, false);
      assert.equal(newAfter.submissionAccess.canCommit, false);
      for (const actor of [previous, next]) {
        await actor.page.reload({ waitUntil: "networkidle" });
        assert.equal(
          await actor.page.locator("#dashboard-project-edit").count(),
          0,
        );
        assert.equal(
          await actor.page
            .getByRole("region", { name: "Project submission", exact: true })
            .count(),
          0,
        );
        assert.equal(
          await actor.page.locator(".admin-leader-transfer button").count(),
          0,
        );
        await capture(actor, "dashboard-after-transfer");
      }
    },
  );
  await check(
    "stale admin retry is rejected without another transfer",
    async () => {
      assert.deepEqual(await negativePost(admin, body, "negative-api-stale"), {
        status: 409,
        code: "TEAM_LEADER_CHANGED",
      });
      assert.equal((await dashboard(previous)).team.leader_id, target.newId);
    },
  );
  await check(
    "participant is forbidden from the admin team view and crown action",
    async () => {
      assert.equal((await view(next, "/admin/teams")).status, 403);
      assert.deepEqual(
        await negativePost(next, forbiddenBody, "negative-api-participant"),
        { status: 403, code: "ADMIN_REQUIRED" },
      );
      assert.equal((await dashboard(next)).team.leader_id, target.newId);
    },
  );
  await check(
    "exact action allowlist permits one success and two declared negative probes",
    async () => {
      assert.equal(report.posts.length, 3);
      assert.equal(
        report.posts.filter((post) => post.status === 200).length,
        1,
      );
      assert.equal(report.blocked.length, 0);
      assert.equal(report.pageErrors.length, 0);
    },
  );
} catch (error) {
  report.failure = error.message;
  report.failureStack = error.stack;
  process.exitCode = 1;
} finally {
  for (const session of sessions.values()) await session.context.close();
  if (browser) await browser.close();
  report.browserClosed = !!browser;
  report.artifactUnchanged = hash() === worker;
  writeFileSync(
    join(output, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
}
console.log(
  JSON.stringify({
    report: join(output, "report.json"),
    checks: report.checks.length,
    posts: report.posts,
    failedCheck: report.failedCheck,
    failure: report.failure,
    blocked: report.blocked,
    pageErrors: report.pageErrors,
    browserClosed: report.browserClosed,
    artifactUnchanged: report.artifactUnchanged,
  }),
);
if (
  !report.artifactUnchanged ||
  report.blocked.length ||
  report.pageErrors.length
)
  process.exitCode = 1;
