// Opt-in disposable local write phase. Never resets a DB or runs at import.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { chromium } from "/tmp/ddehack-playwright-runner/node_modules/playwright/index.mjs";
const origin = "http://127.0.0.1:4173",
  artifact =
    "/home/param302/Dev/DDEHack-portal/.worktrees/visual-integration/dist/server/index.js";
const source = process.env.DASHBOARD_QA_SOURCE,
  worker = process.env.DASHBOARD_QA_WORKER,
  resetToken = process.env.TEAM_WRITE_RESET_TOKEN;
if (
  process.env.TEAM_WRITE_READY !== "1" ||
  process.env.TEAM_WRITE_FRESH_FIXTURE !== "1" ||
  !/^[a-f0-9]{40}$/.test(source || "") ||
  !/^[a-f0-9]{64}$/.test(worker || "") ||
  !/^[a-f0-9]{32}$/.test(resetToken || "")
) {
  console.log(
    "Prepared only. Requires coordinator write-phase signal, fresh disposable reset, unique 32-hex reset token and matching source/Worker.",
  );
  process.exit(0);
}
const hash = () =>
  createHash("sha256").update(readFileSync(artifact)).digest("hex");
assert.equal(hash(), worker);
const size = process.env.TEAM_WRITE_VIEWPORT || "mobile";
const sizes = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
  tablet: { width: 834, height: 1194 },
};
assert.ok(Object.hasOwn(sizes, size));
const output = process.env.DASHBOARD_QA_OUTPUT || "evidence/team-write-v6";
mkdirSync(output, { recursive: true });
const report = {
  source,
  worker,
  origin,
  viewport: size,
  syntheticOnly: true,
  sandbox: true,
  resetTokenHash: createHash("sha256").update(resetToken).digest("hex"),
  checks: [],
  writes: [],
  blocked: [],
  pageErrors: [],
  captures: [],
};
// A consumed token cannot be retried, even after a failure. Reset the disposable
// database and obtain a new coordinator token before any fresh attempt.
writeFileSync("/tmp/ddehack-team-write-" + resetToken, "consumed\n", {
  flag: "wx",
});
const ids = {
  forming: "fake_teamqa_forming",
  solo: "fake_teamqa_solo_team",
  accept: "fake_teamqa_request_accept",
  decline: "fake_teamqa_request_decline",
};
const browser = await chromium.launch({
    headless: true,
    chromiumSandbox: true,
  }),
  sessions = new Map();
let permit = null;
const touch = size !== "desktop",
  act = (locator) => (touch ? locator.tap() : locator.click());
async function session(actor) {
  assert.ok(["leader", "member", "accept", "decline", "solo"].includes(actor));
  if (sessions.has(actor)) return sessions.get(actor);
  const context = await browser.newContext({
    viewport: sizes[size],
    hasTouch: touch,
    isMobile: size === "mobile",
    serviceWorkers: "block",
  });
  await context.route("**/*", async (route) => {
    const r = route.request(),
      u = new URL(r.url());
    if (u.origin !== origin) {
      report.blocked.push({ kind: "external", method: r.method() });
      return route.abort("blockedbyclient");
    }
    if (!["GET", "HEAD"].includes(r.method())) {
      let body;
      try {
        body = JSON.parse(r.postData() || "{}");
      } catch {}
      if (
        r.method() !== "POST" ||
        u.pathname !== "/api/portal" ||
        !permit ||
        permit.actor !== actor ||
        body?.action !== permit.action ||
        JSON.stringify(body?.data) !== JSON.stringify(permit.data)
      ) {
        report.blocked.push({
          kind: "unallowlisted-write",
          actor,
          action: body?.action || "unknown",
        });
        return route.abort("blockedbyclient");
      }
      report.writes.push({ actor, action: permit.action });
      permit = null;
    }
    return route.continue({
      headers: {
        ...r.headers(),
        "oai-authenticated-user-id": "fake_teamqa_" + actor,
        "oai-authenticated-user-email": "teamqa_" + actor + "@portal.test",
      },
    });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on("pageerror", (e) => report.pageErrors.push(e.message));
  await page.goto(origin + "/dashboard#team", { waitUntil: "networkidle" });
  const result = {
    actor,
    page,
    panel: page.getByRole("tabpanel", { name: "Team", exact: true }),
  };
  sessions.set(actor, result);
  return result;
}
async function view(s) {
  const result = await s.page.evaluate(async () => {
    const r = await fetch("/api/portal?view=%2Fdashboard", {
      cache: "no-store",
    });
    if (!r.ok) throw new Error("Own dashboard read failed: " + r.status);
    return r.json();
  });
  assert.equal(result.me.id, "fake_teamqa_" + s.actor);
  return result;
}
async function reload(s) {
  await s.page.goto(origin + "/dashboard#team", { waitUntil: "networkidle" });
  await s.panel.waitFor();
  return view(s);
}
async function record(label, fn) {
  await fn();
  report.checks.push({ label, passed: true });
}
async function capture(s, label) {
  const path = output + "/" + s.actor + "-" + size + "-" + label + ".png";
  await s.page.screenshot({ path, fullPage: false, animations: "disabled" });
  report.captures.push({ path, original: true, fullPage: false });
}
async function commit(s, action, data, trigger) {
  assert.equal(permit, null);
  await trigger();
  const dialog = s.page.getByRole("dialog");
  await dialog.waitFor();
  assert.equal(
    await dialog
      .getByRole("button", { name: "Cancel", exact: true })
      .evaluate((e) => e === document.activeElement),
    true,
  );
  permit = { actor: s.actor, action, data };
  const response = s.page.waitForResponse(
    (r) =>
      r.url() === origin + "/api/portal" && r.request().method() === "POST",
  );
  await act(dialog.getByRole("button").last());
  const r = await response;
  assert.equal(r.ok(), true, action + " status " + r.status());
  await dialog.waitFor({ state: "hidden" });
  await s.page.waitForLoadState("networkidle");
  assert.equal(permit, null);
  return r.json();
}
try {
  const leader = await session("leader"),
    member = await session("member"),
    solo = await session("solo"),
    accept = await session("accept"),
    decline = await session("decline");
  await record(
    "fresh reserved fixture gate before the first write",
    async () => {
      const l = await view(leader),
        s = await view(solo);
      assert.equal(l.team.id, ids.forming);
      assert.equal(l.team.leader_id, "fake_teamqa_leader");
      assert.equal(l.team.name, "Synthetic Green Loop");
      assert.equal(l.teamStatus, "Forming");
      assert.deepEqual(l.members.map((m) => m.id).sort(), [
        "fake_teamqa_leader",
        "fake_teamqa_member",
      ]);
      assert.equal(l.idea.title, "");
      assert.equal(l.idea.description, "");
      assert.equal(l.submissionAccess.attemptsUsed, 0);
      assert.equal(
        l.actions.filter(
          (a) =>
            a.status === "pending" && [ids.accept, ids.decline].includes(a.id),
        ).length,
        2,
      );
      assert.equal(s.team.id, ids.solo);
      assert.equal(s.team.name, "Synthetic Solo Team");
      assert.equal(s.members.length, 1);
      assert.equal(s.submissionAccess.attemptsUsed, 0);
      for (const applicant of [accept, decline])
        assert.ok(!(await view(applicant)).team);
      assert.equal(report.writes.length, 0);
    },
  );
  await record("member has no leader editing controls", async () =>
    assert.equal(await member.panel.getByRole("button").count(), 0),
  );
  await record(
    "native empty idea validation and saved-idea Lock prerequisite",
    async () => {
      await act(
        leader.panel.getByRole("button", {
          name: "Save team idea",
          exact: true,
        }),
      );
      assert.equal(
        await leader.panel
          .getByLabel("Idea title", { exact: true })
          .evaluate((e) => e.validity.valueMissing),
        true,
      );
      assert.equal(await leader.page.getByRole("dialog").count(), 0);
      assert.equal(
        await leader.panel
          .getByRole("button", { name: "Lock completed team", exact: true })
          .isDisabled(),
        true,
      );
    },
  );
  const idea = {
    title: "Synthetic control idea",
    description:
      "Synthetic local saved idea for the isolated Team write phase.",
  };
  await leader.panel.getByLabel("Idea title", { exact: true }).fill(idea.title);
  await leader.panel
    .locator("textarea[name=description]")
    .fill(idea.description);
  await record("save idea persists and enables Lock", async () => {
    await commit(leader, "save-workspace-idea", idea, () =>
      act(
        leader.panel.getByRole("button", {
          name: "Save team idea",
          exact: true,
        }),
      ),
    );
    const l = await reload(leader);
    assert.equal(l.idea.title, idea.title);
    assert.equal(l.idea.description, idea.description);
    assert.equal(
      await leader.panel
        .getByRole("button", { name: "Lock completed team", exact: true })
        .isEnabled(),
      true,
    );
  });
  const renamed = "Synthetic Renamed Loop";
  await act(leader.panel.locator("summary").filter({ hasText: "Rename team" }));
  await leader.panel.getByLabel("Team name", { exact: true }).fill(renamed);
  await record("rename persists", async () => {
    await commit(
      leader,
      "rename-team",
      { name: renamed, reason: "Leader renamed unlocked team" },
      () =>
        act(
          leader.panel.getByRole("button", {
            name: "Rename team",
            exact: true,
          }),
        ),
    );
    assert.equal((await reload(leader)).team.name, renamed);
  });
  await act(
    leader.panel
      .locator("summary")
      .filter({ hasText: "Customize your team badge and accent" }),
  );
  await record(
    "all eight palette inputs respond to actual mouse or touch",
    async () => {
      for (const key of [
        "cobalt",
        "forest",
        "violet",
        "ember",
        "graphite",
        "yellow",
        "grey",
        "coral",
      ]) {
        const input = leader.panel.locator(
          'input[type=radio][name=palette][value="' + key + '"]',
        );
        await act(input.locator(".."));
        assert.equal(await input.isChecked(), true);
      }
    },
  );
  await record("palette persists", async () => {
    await commit(
      leader,
      "team-style",
      { avatar: "initials", palette: "coral" },
      () =>
        act(
          leader.panel.getByRole("button", {
            name: "Update team identity",
            exact: true,
          }),
        ),
    );
    assert.equal((await reload(leader)).team.palette, "coral");
  });
  await act(
    leader.panel.locator("summary").filter({ hasText: "Membership requests" }),
  );
  await record("accept request persists membership", async () => {
    await commit(
      leader,
      "respond-team",
      { requestId: ids.accept, accept: true },
      () =>
        act(
          leader.panel
            .locator(".request-row")
            .filter({ hasText: "Synthetic Team Accept" })
            .getByRole("button", { name: "Accept", exact: true }),
        ),
    );
    const l = await reload(leader);
    assert.equal(l.members.length, 3);
    assert.equal((await reload(accept)).team.id, ids.forming);
  });
  await act(
    leader.panel.locator("summary").filter({ hasText: "Membership requests" }),
  );
  await record("decline request leaves applicant teamless", async () => {
    await commit(
      leader,
      "respond-team",
      { requestId: ids.decline, accept: false },
      () =>
        act(
          leader.panel
            .locator(".request-row")
            .filter({ hasText: "Synthetic Team Decline" })
            .getByRole("button", { name: "Decline", exact: true }),
        ),
    );
    const l = await reload(leader);
    assert.equal(
      l.actions.find((a) => a.id === ids.decline).status,
      "declined",
    );
    assert.ok(!(await reload(decline)).team);
  });
  await record(
    "remove accepted member recalculates their private access",
    async () => {
      await commit(
        leader,
        "remove-workspace-member",
        {
          userId: "fake_teamqa_accept",
          reason: "Team leader removed membership",
        },
        () =>
          act(
            leader.panel.getByRole("button", {
              name: "Remove Synthetic Team Accept from team",
              exact: true,
            }),
          ),
      );
      assert.equal((await reload(leader)).members.length, 2);
      const a = await reload(accept);
      assert.ok(!a.team);
      assert.ok(!a.privateVenue);
      assert.ok(!a.idea);
    },
  );
  await capture(leader, "saved-before-lock");
  await record(
    "lock persists and removes editing for leader and member",
    async () => {
      await commit(leader, "lock-team", { confirmation: "LOCK_TEAM" }, () =>
        act(
          leader.panel.getByRole("button", {
            name: "Lock completed team",
            exact: true,
          }),
        ),
      );
      const l = await reload(leader);
      assert.equal(l.teamStatus, "Locked");
      assert.equal(l.submissionAccess.attemptsUsed, 0);
      assert.equal(await leader.panel.getByRole("button").count(), 0);
      assert.equal(await leader.panel.locator("summary").count(), 0);
      await reload(member);
      assert.equal(await member.panel.getByRole("button").count(), 0);
    },
  );
  await capture(leader, "locked");
  await act(
    solo.panel.locator("summary").filter({ hasText: "Delete your team" }),
  );
  await record(
    "named sole unlocked deletion returns leader to teamless state",
    async () => {
      await commit(
        solo,
        "delete-own-team",
        { reason: null, confirmation: "DELETE_OWN_TEAM" },
        () =>
          act(
            solo.panel.getByRole("button", {
              name: "Review team deletion",
              exact: true,
            }),
          ),
      );
      assert.ok(!(await reload(solo)).team);
    },
  );
  const createdName = "Synthetic Team QA Created";
  await solo.panel.getByLabel("Team name", { exact: true }).fill(createdName);
  let createdId;
  await record(
    "teamless eligible participant can create a replacement team",
    async () => {
      const result = await commit(
        solo,
        "create-workspace-team",
        { name: createdName, bio: "", avatar: "initials", palette: "forest" },
        () =>
          act(
            solo.panel.getByRole("button", {
              name: "Create team",
              exact: true,
            }),
          ),
      );
      createdId = result.teamId;
      assert.match(createdId, /^[a-f0-9-]{36}$/);
      assert.equal((await reload(solo)).team.id, createdId);
    },
  );
  await decline.page.goto(origin + "/discover/teams", {
    waitUntil: "networkidle",
  });
  await record(
    "teamless applicant can request the newly created team",
    async () => {
      const row = decline.page
        .locator("li")
        .filter({
          has: decline.page.getByRole("heading", {
            name: createdName,
            exact: true,
          }),
        });
      await commit(decline, "request-team", { teamId: createdId }, () =>
        act(row.getByRole("button", { name: "Request to join", exact: true })),
      );
      await decline.page.reload({ waitUntil: "networkidle" });
      assert.equal(
        await row
          .getByRole("button", { name: "Requested", exact: true })
          .isDisabled(),
        true,
      );
      const s = await reload(solo);
      assert.equal(
        s.actions.filter(
          (a) =>
            a.team_id === createdId &&
            a.user_id === "fake_teamqa_decline" &&
            a.status === "pending",
        ).length,
        1,
      );
    },
  );
  await record(
    "all writes stayed within the exact named-fake action allowlist",
    async () => {
      assert.equal(report.writes.length, 10);
      assert.equal(report.blocked.length, 0);
      assert.equal(report.pageErrors.length, 0);
    },
  );
} catch (e) {
  report.failure = e.message;
  process.exitCode = 1;
} finally {
  for (const s of sessions.values()) await s.page.context().close();
  await browser.close();
  report.browserClosed = true;
  report.workerAfter = hash();
  report.artifactUnchanged = report.workerAfter === worker;
  writeFileSync(output + "/report.json", JSON.stringify(report, null, 2));
}
console.log(
  JSON.stringify({
    checks: report.checks,
    writes: report.writes,
    blocked: report.blocked,
    pageErrors: report.pageErrors,
    failure: report.failure,
    browserClosed: report.browserClosed,
    artifactUnchanged: report.artifactUnchanged,
    report: output + "/report.json",
  }),
);
if (
  report.blocked.length ||
  report.pageErrors.length ||
  !report.artifactUnchanged
)
  process.exitCode = 1;
