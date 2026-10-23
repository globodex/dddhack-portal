// Action inventory only. Root must release the matching artifact before --preview-ready.
// No write allowlist exists: confirmation dialogs are Cancel-only; all POSTs are blocked.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
const origin = "http://127.0.0.1:4173",
  artifactRoot = resolve(
    process.env.DISCOVER_QA_ARTIFACT_ROOT || "../visual-integration",
  );
const cases = [
  { mode: "mouse", width: 1440, height: 900 },
  { mode: "keyboard", width: 1440, height: 900 },
  { mode: "touch", width: 834, height: 1194 },
  { mode: "touch", width: 390, height: 844 },
  { mode: "touch", width: 320, height: 740 },
];
const identities = [
  { role: "member", id: "fake_alice", email: "alice@portal.test" },
  { role: "teamless", id: "fake_pending", email: "pending@portal.test" },
  { role: "viewer", id: "fake_stranger", email: "stranger@portal.test" },
];
const plan = {
  origin,
  artifactRoot,
  cases,
  actors: identities.map(({ role, id }) => ({ role, id })),
  touchContext: { isMobile: true, hasTouch: true },
  network: ["GET", "HEAD"],
  chromiumSandbox: true,
  limitRows: 24,
  states: ["checked", "untested", "error", "disabled"],
  gate: "root matching-artifact signal and --preview-ready",
  mutations:
    "all blocked; create/request confirmations Cancel-only; actual commits remain untested until separate root reset coordination",
};
if (!process.argv.includes("--preview-ready")) {
  console.log(JSON.stringify({ launched: false, plan }, null, 2));
  process.exit(0);
}
const files = [
  "dist/server/index.js",
  "dist/server/wrangler.json",
  "dist/client/.vite/manifest.json",
];
const fingerprint = () =>
  Object.fromEntries(
    files.map((path) => [
      path,
      createHash("sha256")
        .update(readFileSync(resolve(artifactRoot, path)))
        .digest("hex"),
    ]),
  );
const before = fingerprint(),
  source =
    process.env.DISCOVER_QA_SOURCE ||
    execFileSync("git", ["-C", artifactRoot, "rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim();
assert.match(source, /^[a-f0-9]{7,40}$/);
if (process.env.DISCOVER_QA_WORKER)
  assert.equal(before[files[0]], process.env.DISCOVER_QA_WORKER);
const output = resolve(
  "evidence/discover-rules-controls-v6",
  source.slice(0, 8) + "-" + new Date().toISOString().replaceAll(":", "-"),
);
mkdirSync(output, { recursive: true });
const report = {
  plan,
  source,
  artifactBefore: before,
  startedAt: new Date().toISOString(),
  controls: [],
  captures: [],
  errors: [],
  blocked: [],
  coverage: [],
  limitations: [
    "Actual create/request confirmation approval is not exercised. Root must separately authorize local fixture writes after clean screenshots and reset coordination.",
    "External social links are validated but not navigated because all outbound requests are blocked.",
    "Rows above bounded24limit remain explicitly untested. Missing fixture states remain untested, never inferred from element existence.",
  ],
  browserClosed: false,
};
const save = () => {
  writeFileSync(
    output + "/report.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  writeFileSync(
    output + "/controls.json",
    JSON.stringify(report.controls, null, 2) + "\n",
  );
};
let current = {};
const record = (id, state, detail = {}) => {
  report.controls.push({ ...current, id, state, ...detail });
  save();
};
let browser;
async function action(page, id, fn) {
  try {
    const detail = await fn();
    record(id, "checked", {
      evidence: "actual interaction and asserted outcome",
      ...detail,
    });
  } catch (error) {
    const name = "error-" + report.controls.length + ".png";
    await page
      .screenshot({
        path: output + "/" + name,
        fullPage: false,
        animations: "disabled",
      })
      .then(() =>
        report.captures.push({ name, path: output + "/" + name, ...current }),
      )
      .catch(() => {});
    record(id, "error", { error: error.message });
    // Keep an observed modal defect from cascading into unrelated controls.
    await page.keyboard.press("Escape").catch(() => {});
  }
}
async function disabled(page, id, test, reason) {
  try {
    const detail = await test();
    record(id, "disabled", { reason, observed: true, ...detail });
  } catch (error) {
    record(id, "error", { reason, error: error.message });
  }
}
async function activate(page, locator, mode, key = "Enter") {
  if (mode === "touch") await locator.tap();
  else if (mode === "keyboard") {
    await locator.focus();
    await page.keyboard.press(key);
  } else await locator.click();
}
async function type(page, locator, value, mode) {
  if (mode === "touch") await locator.tap();
  else if (mode === "keyboard") await locator.focus();
  else await locator.click();
  await page.keyboard.press("ControlOrMeta+A");
  if (value) await page.keyboard.type(value);
  else await page.keyboard.press("Backspace");
  assert.equal(await locator.inputValue(), value);
}
async function goto(page, path) {
  await page.goto(origin + path, { waitUntil: "networkidle" });
  await page
    .locator(path === "/rules" ? ".rules-v6" : ".discover-v6")
    .waitFor();
  await page.evaluate(() => document.fonts.ready);
  current.route = path;
}
async function data(page, path, identity) {
  const value = await page.evaluate(async (route) => {
    const r = await fetch("/api/portal?view=" + encodeURIComponent(route), {
      cache: "no-store",
    });
    if (!r.ok) throw new Error("Local API " + r.status);
    return r.json();
  }, path);
  assert.equal(value.me?.id, identity.id);
  return value;
}
async function reflow(page, scope) {
  const value = await page.locator(scope).evaluate((e) => {
    const r = e.getBoundingClientRect();
    return {
      left: r.left,
      right: r.right,
      width: innerWidth,
      document: document.documentElement.scrollWidth,
    };
  });
  assert.ok(
    value.left >= -1 &&
      value.right <= value.width + 1 &&
      value.document <= value.width + 1,
    JSON.stringify(value),
  );
  return value;
}
try {
  const { chromium } =
    await import("/tmp/ddehack-playwright-runner/node_modules/playwright/index.mjs");
  browser = await chromium.launch({ headless: true, chromiumSandbox: true });
  report.browser = browser.version();
  for (const spec of cases)
    for (const identity of identities) {
      current = {
        actor: identity.id,
        role: identity.role,
        inputMode: spec.mode,
        viewport: { width: spec.width, height: spec.height },
      };
      const context = await browser.newContext({
        viewport: { width: spec.width, height: spec.height },
        serviceWorkers: "block",
        reducedMotion: "reduce",
        ...(spec.mode === "touch"
          ? { hasTouch: true, isMobile: true }
          : { hasTouch: false, isMobile: false }),
      });
      await context.route("**/*", (route) => {
        const r = route.request(),
          url = new URL(r.url());
        if (url.origin !== origin || !["GET", "HEAD"].includes(r.method())) {
          report.blocked.push({
            ...current,
            kind: url.origin !== origin ? "external" : "mutation",
            method: r.method(),
            path: url.origin === origin ? url.pathname : undefined,
          });
          return route.abort("blockedbyclient");
        }
        return route.continue({
          headers: {
            ...r.headers(),
            "oai-authenticated-user-id": identity.id,
            "oai-authenticated-user-email": identity.email,
          },
        });
      });
      const page = await context.newPage();
      page.setDefaultTimeout(6000);
      page.on("pageerror", (e) =>
        report.errors.push({ ...current, error: e.message }),
      );
      try {
        await goto(page, "/discover/participants");
        const peopleData = await data(page, "/discover/participants", identity),
          people = peopleData.items || [];
        await action(page, "input-mode-context", async () => {
          const state = await page.evaluate(() => ({
            touch: navigator.maxTouchPoints,
            coarse: matchMedia("(pointer:coarse)").matches,
          }));
          assert.equal(state.touch > 0, spec.mode === "touch");
          return state;
        });
        await action(page, "discover.tabs.teams", async () => {
          await activate(
            page,
            page
              .locator(".discover-tabs")
              .getByRole("link", { name: "Teams", exact: true }),
            spec.mode,
          );
          await page.waitForURL("**/discover/teams");
          await page.locator(".discover-teams").waitFor();
          assert.equal(
            await page
              .locator('.discover-tabs a[aria-current="page"]')
              .innerText(),
            "Teams",
          );
        });
        await action(page, "discover.tabs.people", async () => {
          await activate(
            page,
            page
              .locator(".discover-tabs")
              .getByRole("link", { name: "People", exact: true }),
            spec.mode,
          );
          await page.waitForURL("**/discover/participants");
          await page.locator(".discover-people").waitFor();
          assert.equal(
            await page
              .locator('.discover-tabs a[aria-current="page"]')
              .innerText(),
            "People",
          );
        });
        for (const [label, filter] of [
          ["In a team", (p) => !!p.teamName],
          ["Not in a team", (p) => !p.teamName],
          ["All", () => true],
        ])
          await action(page, "people.filter." + label, async () => {
            const control = page
              .getByRole("group", { name: "Team membership" })
              .getByRole("button", { name: label, exact: true });
            await activate(page, control, spec.mode, "Space");
            assert.equal(await control.getAttribute("aria-pressed"), "true");
            assert.equal(
              await page.locator(".discover-people > li").count(),
              people.filter(filter).length,
            );
          });
        await action(page, "people.search.text-and-clear", async () => {
          const control = page.getByRole("searchbox", {
            name: "Search people",
          });
          await type(page, control, "NO-SYNTHETIC-CONTROL-MATCH", spec.mode);
          assert.equal(await page.locator(".discover-people > li").count(), 0);
          assert.equal(
            await page.locator(".discover-empty").innerText(),
            "No matches",
          );
          await type(page, control, "", spec.mode);
          assert.equal(
            await page.locator(".discover-people > li").count(),
            people.length,
          );
        });
        if (spec.mode === "keyboard")
          await action(page, "people.search.tab-order", async () => {
            await page
              .getByRole("searchbox", { name: "Search people" })
              .focus();
            await page.keyboard.press("Tab");
            assert.equal(
              await page.evaluate(
                () =>
                  !!document.activeElement?.closest(
                    ".discover-membership-filters",
                  ),
              ),
              true,
            );
          });
        for (const person of people.slice(0, 24)) {
          assert.match(person.id, /^fake_[a-z0-9_]+$/);
          const row = page.locator('[id="person-' + person.id + '"]');
          for (const openerKind of ["name", "chevron"])
            await action(
              page,
              "people.profile." + person.id + "." + openerKind,
              async () => {
                const opener =
                  openerKind === "name"
                    ? row.locator("h2 button")
                    : row.getByRole("button", {
                        name: `View ${person.name}'s profile`,
                        exact: true,
                      });
                await activate(page, opener, spec.mode);
                const dialog = page.locator(
                  "dialog.discovery-profile-v6[open]",
                );
                await dialog.waitFor();
                assert.equal(
                  await dialog.evaluate((e) => e.matches(":modal")),
                  true,
                );
                assert.equal(
                  await dialog
                    .getByRole("heading", { name: person.name, exact: true })
                    .count(),
                  1,
                );
                assert.doesNotMatch(
                  await dialog.innerText(),
                  /@portal\.test|12025550100|private core idea|FAKE-NOT-REDEEMABLE/i,
                );
                assert.equal(
                  await dialog
                    .locator('input,textarea,a[href^="tel:"],a[href*="wa.me"]')
                    .count(),
                  0,
                );
                if (openerKind === "name")
                  await activate(
                    page,
                    dialog.getByRole("button", {
                      name: "Close profile",
                      exact: true,
                    }),
                    spec.mode,
                  );
                else await page.keyboard.press("Escape");
                await page.waitForSelector("dialog.discovery-profile-v6", {
                  state: "detached",
                });
                assert.equal(
                  await opener.evaluate((e) => document.activeElement === e),
                  true,
                );
              },
            );
          for (const [index, href] of (person.socials || []).entries()) {
            let safe = false;
            try {
              const u = new URL(href);
              safe = u.protocol === "https:" && !u.username && !u.password;
            } catch {}
            if (safe)
              record("people.social." + person.id + "." + index, "untested", {
                reason:
                  "external navigation excluded by outbound network boundary; href semantics handled by screenshot runner",
              });
          }
        }
        if (people.length > 24)
          record("people.remaining-profile-rows", "untested", {
            reason: "bounded24rowbudget",
            remaining: people.length - 24,
          });
        if (people.length)
          await action(page, "people.profile.hash-link", async () => {
            await goto(page, "/discover/participants#person-" + people[0].id);
            await page.locator("dialog.discovery-profile-v6[open]").waitFor();
            await activate(
              page,
              page.getByRole("button", { name: "Close profile", exact: true }),
              spec.mode,
            );
            await page.waitForSelector("dialog.discovery-profile-v6", {
              state: "detached",
            });
          });
        await action(page, "people.reflow", () => reflow(page, ".discover-v6"));
        await goto(page, "/discover/teams");
        const teamData = await data(page, "/discover/teams", identity),
          teams = teamData.items || [];
        await action(page, "teams.search.text-and-clear", async () => {
          const control = page.getByRole("searchbox", { name: "Search teams" });
          await type(page, control, "NO-SYNTHETIC-CONTROL-MATCH", spec.mode);
          assert.equal(await page.locator(".discover-teams > li").count(), 0);
          await type(page, control, "", spec.mode);
          assert.equal(
            await page.locator(".discover-teams > li").count(),
            teams.length,
          );
        });
        for (const team of teams.slice(0, 24)) {
          const row = page.locator(".discover-teams > li").filter({
            has: page.getByRole("heading", { name: team.name, exact: true }),
          });
          const eligible =
            teamData.me.canParticipate === true &&
            !teamData.team &&
            !team.locked &&
            Number(team.readiness?.total) < 5;
          if (teamData.team?.id === team.id) {
            await disabled(
              page,
              "teams.request." + team.id,
              async () => {
                assert.equal(await row.locator(".discover-request").count(), 0);
                return { availability: "not-rendered" };
              },
              "already belongs to this team",
            );
            await action(page, "teams.own-team-link." + team.id, async () => {
              await activate(
                page,
                row.getByRole("link", { name: "Your team", exact: true }),
                spec.mode,
              );
              await page.waitForURL("**/dashboard");
              await page.locator("#main").waitFor();
              await goto(page, "/discover/teams");
            });
          } else if (eligible) {
            if (team.requested)
              await disabled(
                page,
                "teams.request." + team.id,
                async () => {
                  assert.equal(
                    await row.locator(".discover-request").isDisabled(),
                    true,
                  );
                  return { availability: "rendered-disabled" };
                },
                "request already pending",
              );
            else {
              await action(
                page,
                "teams.request.cancel." + team.id,
                async () => {
                  const blocked = report.blocked.length;
                  await activate(
                    page,
                    row.getByRole("button", {
                      name: "Request to join",
                      exact: true,
                    }),
                    spec.mode,
                  );
                  const dialog = page.locator(
                    "dialog.confirmation-dialog[open]",
                  );
                  await dialog.waitFor();
                  await activate(
                    page,
                    dialog.getByRole("button", { name: "Cancel", exact: true }),
                    spec.mode,
                  );
                  await page.waitForSelector("dialog.confirmation-dialog", {
                    state: "detached",
                  });
                  assert.equal(
                    report.blocked.length,
                    blocked,
                    "Cancel must not attempt a network mutation",
                  );
                  const after = await data(page, "/discover/teams", identity);
                  assert.equal(
                    !!after.items.find((t) => t.id === team.id)?.requested,
                    !!team.requested,
                  );
                },
              );
              record("teams.request.confirm." + team.id, "untested", {
                reason:
                  "write approval not authorized; needs root clean-screenshot/reset coordination",
              });
            }
          } else {
            await disabled(
              page,
              "teams.request." + team.id,
              async () => {
                assert.equal(await row.locator(".discover-request").count(), 0);
                return { availability: "not-rendered" };
              },
              teamData.me.canParticipate !== true
                ? "viewer restriction"
                : teamData.team
                  ? "already in a team"
                  : team.locked
                    ? "team locked"
                    : "team full",
            );
            await action(page, "teams.dialog." + team.id, async () => {
              const opener = row.getByRole("button", {
                name: "View team",
                exact: true,
              });
              await activate(page, opener, spec.mode);
              const dialog = page.locator(
                "dialog.discover-team-dialog-v6[open]",
              );
              await dialog.waitFor();
              assert.equal(
                await dialog
                  .getByRole("heading", { name: team.name, exact: true })
                  .count(),
                1,
              );
              assert.doesNotMatch(
                await dialog.innerText(),
                /@portal\.test|12025550100|private core idea|FAKE-NOT-REDEEMABLE/i,
              );
              await activate(
                page,
                dialog.getByRole("button", { name: "Close team", exact: true }),
                spec.mode,
              );
              await page.waitForSelector("dialog.discover-team-dialog-v6", {
                state: "detached",
              });
              assert.equal(
                await opener.evaluate((e) => document.activeElement === e),
                true,
              );
              await activate(page, opener, spec.mode);
              await page
                .locator("dialog.discover-team-dialog-v6[open]")
                .waitFor();
              await page.keyboard.press("Escape");
              await page.waitForSelector("dialog.discover-team-dialog-v6", {
                state: "detached",
              });
              assert.equal(
                await opener.evaluate((e) => document.activeElement === e),
                true,
              );
            });
          }
        }
        if (
          teamData.me.canParticipate === true &&
          !teamData.team &&
          !teams.some(
            (team) => !team.locked && Number(team.readiness?.total) < 5,
          )
        )
          record("teams.request.available-open-team", "untested", {
            reason:
              "No unlocked team with space exists in the read-only fixture; positive request confirmation cannot be exercised",
          });
        if (teams.length > 24)
          record("teams.remaining-rows", "untested", {
            reason: "bounded24rowbudget",
            remaining: teams.length - 24,
          });
        if (teamData.me.canParticipate === true && !teamData.team) {
          const create = page.locator(".discover-create"),
            name = create.locator('input[name="name"]');
          await action(page, "teams.create.expand", async () => {
            await activate(
              page,
              create.locator(":scope > summary"),
              spec.mode,
              "Space",
            );
            assert.equal(await name.isVisible(), true);
          });
          await action(page, "teams.create.name.required", async () => {
            await type(page, name, "", spec.mode);
            const blocked = report.blocked.length;
            await activate(
              page,
              create.getByRole("button", { name: "Create team", exact: true }),
              spec.mode,
            );
            assert.equal(
              await name.evaluate((e) => e.validity.valueMissing),
              true,
            );
            assert.equal(
              await page.locator("dialog.confirmation-dialog").count(),
              0,
            );
            assert.equal(report.blocked.length, blocked);
          });
          await action(page, "teams.create.name-and-bio", async () => {
            await type(page, name, "Synthetic Control Rehearsal", spec.mode);
            await type(
              page,
              create.locator('textarea[name="bio"]'),
              "Disposable UI input only.",
              spec.mode,
            );
            assert.equal(
              await create.locator(".badge-preview text").textContent(),
              "SR",
            );
          });
          for (const [key, label, fill] of [
            ["cobalt", "Blue", "#006afe"],
            ["forest", "Green", "#00ab43"],
            ["violet", "Purple", "#924ff7"],
            ["ember", "Orange", "#f16d00"],
            ["graphite", "Charcoal", "#262626"],
            ["yellow", "Yellow", "#f2c744"],
            ["coral", "Coral", "#ef5a6f"],
            ["grey", "Grey", "#e0e0e0"],
          ])
            await action(page, "teams.create.palette." + key, async () => {
              const radio = create.getByRole("radio", {
                name: label,
                exact: true,
              });
              if (spec.mode === "keyboard") {
                await radio.focus();
                await page.keyboard.press("Space");
              } else await activate(page, radio.locator(".."), spec.mode);
              assert.equal(await radio.isChecked(), true);
              assert.equal(
                await create
                  .locator(".badge-preview circle")
                  .getAttribute("fill"),
                fill,
              );
            });
          await action(page, "teams.create.cancel", async () => {
            const blocked = report.blocked.length;
            await activate(
              page,
              create.getByRole("button", { name: "Create team", exact: true }),
              spec.mode,
            );
            const dialog = page.locator("dialog.confirmation-dialog[open]");
            await dialog.waitFor();
            const target = await dialog
              .locator("#confirmation-target")
              .innerText();
            record(
              "teams.create.confirmation-target",
              target.includes("Synthetic Control Rehearsal")
                ? "checked"
                : "error",
              {
                evidence: "actual valid form submission opens the confirmation",
                observedTarget: target,
                expectedTarget: "Synthetic Control Rehearsal",
                ...(target.includes("Synthetic Control Rehearsal")
                  ? {}
                  : {
                      error:
                        "Create confirmation names a different team than the entered name",
                    }),
              },
            );
            await activate(
              page,
              dialog.getByRole("button", { name: "Cancel", exact: true }),
              spec.mode,
            );
            await page.waitForSelector("dialog.confirmation-dialog", {
              state: "detached",
            });
            assert.equal(report.blocked.length, blocked);
            const after = await data(page, "/discover/teams", identity);
            assert.ok(!after.team);
            assert.equal(after.items.length, teams.length);
            assert.equal(
              await name.inputValue(),
              "Synthetic Control Rehearsal",
            );
          });
          record("teams.create.confirm", "untested", {
            reason:
              "persisting team would change fixture; requires separate root approval/reset",
          });
          await action(page, "teams.create.collapse-and-retain", async () => {
            await activate(
              page,
              create.locator(":scope > summary"),
              spec.mode,
              "Space",
            );
            assert.equal(await name.isVisible(), false);
            await activate(
              page,
              create.locator(":scope > summary"),
              spec.mode,
              "Space",
            );
            assert.equal(
              await name.inputValue(),
              "Synthetic Control Rehearsal",
            );
            await activate(
              page,
              create.locator(":scope > summary"),
              spec.mode,
              "Space",
            );
          });
        } else
          await disabled(
            page,
            "teams.create",
            async () => {
              assert.equal(await page.locator(".discover-create").count(), 0);
              return { availability: "not-rendered" };
            },
            "viewer or already in a team",
          );
        await action(page, "teams.reflow", () => reflow(page, ".discover-v6"));
        report.coverage.push({
          ...current,
          teams: teams.length,
          pending: teams.filter((t) => t.requested).length,
          full: teams.filter((t) => Number(t.readiness?.total) >= 5).length,
          locked: teams.filter((t) => t.locked).length,
        });
        if (!teams.some((t) => t.requested))
          record("teams.pending-request-state", "untested", {
            reason: "no pending request in read-only fixture",
          });
        await goto(page, "/rules");
        const ruleData = await data(page, "/rules", identity);
        assert.equal(ruleData.categories.length, 5);
        for (let index = 0; index < 5; index++)
          await action(page, "rules.category." + index, async () => {
            const detail = page
                .locator(".rules-accordion > details")
                .nth(index),
              summary = detail.locator(":scope > summary"),
              open = (await detail.getAttribute("open")) !== null;
            await activate(page, summary, spec.mode, "Space");
            assert.equal((await detail.getAttribute("open")) !== null, !open);
            if (!open)
              assert.equal(await detail.locator("ol").isVisible(), true);
            await activate(page, summary, spec.mode, "Enter");
            assert.equal((await detail.getAttribute("open")) !== null, open);
          });
        await action(page, "rules.reflow", () => reflow(page, ".rules-v6"));
        await action(page, "rules.back-dashboard", async () => {
          await activate(
            page,
            page.getByRole("link", { name: "Back to Dashboard", exact: true }),
            spec.mode,
          );
          await page.waitForURL("**/dashboard");
          await page.locator("#main").waitFor();
        });
      } catch (error) {
        record("scenario.remaining-controls", "error", {
          error: error.message,
        });
      } finally {
        await context.close();
      }
    }
} finally {
  if (browser) await browser.close();
  report.browserClosed = true;
  report.artifactAfter = fingerprint();
  report.artifactUnchanged =
    JSON.stringify(before) === JSON.stringify(report.artifactAfter);
  report.finishedAt = new Date().toISOString();
  save();
}
console.log(
  JSON.stringify(
    {
      output,
      counts: Object.fromEntries(
        plan.states.map((state) => [
          state,
          report.controls.filter((c) => c.state === state).length,
        ]),
      ),
      browserClosed: report.browserClosed,
      artifactUnchanged: report.artifactUnchanged,
      pageErrors: report.errors.length,
      blocked: report.blocked.length,
    },
    null,
    2,
  ),
);
