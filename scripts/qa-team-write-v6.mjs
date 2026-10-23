// Opt-in disposable local write phase. Never resets a DB or runs at import.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { resolve, join } from "node:path";
import { chromium } from "playwright-core";
import { assertTeamWriteReset } from "./team-write-reset-guard.mjs";
const origin = process.env.TEAM_WRITE_ORIGIN || "http://127.0.0.1:4173",
  artifactRoot = resolve(process.env.TEAM_WRITE_ARTIFACT_ROOT || process.cwd()),
  artifact = join(artifactRoot, "dist/server/index.js");
const source = process.env.DASHBOARD_QA_SOURCE,
  worker = process.env.DASHBOARD_QA_WORKER,
  resetToken = process.env.TEAM_WRITE_RESET_TOKEN,
  manifestPath = process.env.TEAM_WRITE_RESET_MANIFEST;
if (
  process.env.TEAM_WRITE_READY !== "1" ||
  process.env.TEAM_WRITE_FRESH_FIXTURE !== "1" ||
  !/^[a-f0-9]{40}$/.test(source || "") ||
  !/^[a-f0-9]{64}$/.test(worker || "") ||
  !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
    resetToken || "",
  ) ||
  manifestPath !== "/tmp/ddehack-controls-" + resetToken + ".json"
) {
  console.log(
    "Prepared only. Requires coordinator write-phase signal, exact fresh reset manifest/UUID and matching source/Worker.",
  );
  process.exit(0);
}
const hash = () =>
  createHash("sha256").update(readFileSync(artifact)).digest("hex");
assert.equal(hash(), worker);
const manifestBytes = readFileSync(manifestPath);
assertTeamWriteReset({
  manifest: JSON.parse(manifestBytes.toString("utf8")),
  path: manifestPath,
  token: resetToken,
  source,
  worker,
  artifactRoot,
  origin,
});
const size = process.env.TEAM_WRITE_VIEWPORT || "mobile";
const sizes = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
  tablet: { width: 834, height: 1194 },
  keyboard: { width: 1440, height: 900 },
};
assert.ok(Object.hasOwn(sizes, size));
const output = process.env.DASHBOARD_QA_OUTPUT || "evidence/team-write-v6";
mkdirSync(output, { recursive: true });
const report = {
  source,
  worker,
  origin,
  viewport: size,
  inputMode: ["mobile", "tablet"].includes(size)
    ? "touch-emulation"
    : size === "keyboard"
      ? "keyboard"
      : "mouse",
  syntheticOnly: true,
  sandbox: true,
  resetTokenHash: createHash("sha256").update(resetToken).digest("hex"),
  resetManifestPath: manifestPath,
  resetManifestHash: createHash("sha256").update(manifestBytes).digest("hex"),
  checks: [],
  writes: [],
  blocked: [],
  pageErrors: [],
  captures: [],
  confirmations: [],
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
let browser;
const sessions = new Map();
let permit = null;
const touch = ["mobile", "tablet"].includes(size);
async function act(locator) {
  if (size !== "keyboard") return touch ? locator.tap() : locator.click();
  const radio = locator.locator("input[type=radio]");
  if (await radio.count()) {
    await radio.focus();
    return radio.press("Space");
  }
  await locator.focus();
  return locator.press("Enter");
}
async function expand(summary) {
  if (!(await summary.locator("..").evaluate((e) => e.open)))
    await act(summary);
}
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
        !isDeepStrictEqual(body?.data, permit.data)
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
  try {
    await fn();
    report.checks.push({ label, passed: true });
  } catch (error) {
    report.failedCheck = label;
    throw error;
  }
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
  const target = await dialog.locator("#confirmation-target").innerText();
  if (action === "delete-own-team") assert.equal(target, "Synthetic Solo Team");
  if (action === "remove-workspace-member") {
    assert.match(target, /Synthetic Team Accept/);
    assert.match(target, /fake_teamqa_accept/);
  }
  report.confirmations.push({ actor: s.actor, action, target });
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
  browser = await chromium.launch({
    headless: true,
    chromiumSandbox: true,
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  });
  report.browserStarted = true;
  const leader = await session("leader"),
    member = await session("member"),
    solo = await session("solo"),
    accept = await session("accept"),
    decline = await session("decline");
  if (size === "keyboard") {
    await record(
      "dashboard tabs support Arrow keys, Home and End",
      async () => {
        let current = leader.page.getByRole("tab", {
          name: "Team",
          exact: true,
        });
        await current.focus();
        for (const [key, label, hash] of [
          ["ArrowRight", "Credits", "#credits"],
          ["ArrowRight", "Project", "#project"],
          ["ArrowRight", "Team", "#team"],
          ["ArrowLeft", "Project", "#project"],
          ["Home", "Team", "#team"],
          ["End", "Project", "#project"],
          ["Home", "Team", "#team"],
        ]) {
          await current.press(key);
          current = leader.page.getByRole("tab", { name: label, exact: true });
          assert.equal(await current.getAttribute("aria-selected"), "true");
          assert.equal(
            await current.evaluate((e) => e === document.activeElement),
            true,
          );
          assert.equal(new URL(leader.page.url()).hash, hash);
          assert.equal(
            await leader.page
              .getByRole("tabpanel", { name: label, exact: true })
              .isVisible(),
            true,
          );
        }
      },
    );
  }
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
    description: "Synthetic local saved idea. ".repeat(30).slice(0, 499) + ".",
  };
  await leader.panel.getByLabel("Idea title", { exact: true }).fill(idea.title);
  await record(
    "description is required before any save confirmation",
    async () => {
      await act(
        leader.panel.getByRole("button", {
          name: "Save team idea",
          exact: true,
        }),
      );
      assert.equal(
        await leader.panel
          .locator("textarea[name=description]")
          .evaluate((e) => e.validity.valueMissing),
        true,
      );
      assert.equal(await leader.page.getByRole("dialog").count(), 0);
      assert.equal(report.writes.length, 0);
    },
  );
  await leader.panel
    .locator("textarea[name=description]")
    .fill(idea.description);
  await record(
    "500-character description boundary is enforced by real typing",
    async () => {
      const description = leader.panel.locator("textarea[name=description]");
      await description.press("End");
      await description.press("x");
      assert.equal((await description.inputValue()).length, 500);
      assert.match(
        await leader.panel.locator("#idea-count").innerText(),
        /^500\/500/,
      );
      assert.equal(await description.inputValue(), idea.description);
    },
  );
  if (size === "keyboard") {
    await record(
      "confirmation traps Tab and cancels with Escape without writing",
      async () => {
        await act(
          leader.panel.getByRole("button", {
            name: "Save team idea",
            exact: true,
          }),
        );
        const dialog = leader.page.getByRole("dialog");
        await dialog.waitFor();
        const cancel = dialog.getByRole("button", {
          name: "Cancel",
          exact: true,
        });
        const confirm = dialog.getByRole("button").last();
        assert.equal(
          await cancel.evaluate((e) => e === document.activeElement),
          true,
        );
        await cancel.press("Shift+Tab");
        assert.equal(
          await confirm.evaluate((e) => e === document.activeElement),
          true,
        );
        await confirm.press("Tab");
        assert.equal(
          await cancel.evaluate((e) => e === document.activeElement),
          true,
        );
        await cancel.press("Escape");
        await dialog.waitFor({ state: "hidden" });
        assert.equal(report.writes.length, 0);
      },
    );
  }
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
  await expand(
    leader.panel.locator("summary").filter({ hasText: "Rename team" }),
  );
  await record("rename required and minimum length validation", async () => {
    const name = leader.panel.getByLabel("Team name", { exact: true });
    await name.fill("");
    await act(
      leader.panel.getByRole("button", { name: "Rename team", exact: true }),
    );
    assert.equal(await name.evaluate((e) => e.validity.valueMissing), true);
    await name.pressSequentially("x");
    await act(
      leader.panel.getByRole("button", { name: "Rename team", exact: true }),
    );
    assert.equal(await name.evaluate((e) => e.validity.tooShort), true);
    assert.equal(await leader.page.getByRole("dialog").count(), 0);
  });
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
  await expand(
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
  await expand(
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
  await expand(
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
  await expand(
    solo.panel.locator("summary").filter({ hasText: "Delete your team" }),
  );
  await record(
    "cancelled named deletion keeps the sole team intact",
    async () => {
      await act(
        solo.panel.getByRole("button", {
          name: "Review team deletion",
          exact: true,
        }),
      );
      const dialog = solo.page.getByRole("dialog");
      await dialog.waitFor();
      assert.equal(
        await dialog.locator("#confirmation-target").innerText(),
        "Synthetic Solo Team",
      );
      await act(dialog.getByRole("button", { name: "Cancel", exact: true }));
      await dialog.waitFor({ state: "hidden" });
      assert.equal((await reload(solo)).team.id, ids.solo);
      await expand(
        solo.panel.locator("summary").filter({ hasText: "Delete your team" }),
      );
    },
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
  await record("replacement team name remains required", async () => {
    const name = solo.panel.getByLabel("Team name", { exact: true });
    await act(
      solo.panel.getByRole("button", { name: "Create team", exact: true }),
    );
    assert.equal(await name.evaluate((e) => e.validity.valueMissing), true);
    assert.equal(await solo.page.getByRole("dialog").count(), 0);
  });
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
      const row = decline.page.locator("li").filter({
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
  report.failureStack = e.stack;
  const leader = sessions.get("leader");
  if (leader)
    report.failureState = {
      requests: await leader.panel.locator(".request-row").allTextContents(),
      details: await leader.panel.locator("details").evaluateAll((nodes) =>
        nodes.map((n) => ({
          summary: n.querySelector("summary")?.textContent,
          open: n.open,
        })),
      ),
    };
  process.exitCode = 1;
} finally {
  for (const s of sessions.values()) await s.page.context().close();
  if (browser) await browser.close();
  report.browserClosed = !!browser;
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
