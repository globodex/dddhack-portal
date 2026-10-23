// Artifact-gated, read-only local QA. Never starts a server or changes fixture data.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
const artifactRoot = resolve(
  process.env.DISCOVER_QA_ARTIFACT_ROOT || "../visual-integration",
);
const origin = "http://127.0.0.1:4173";
const runner =
  "/tmp/ddehack-playwright-runner/node_modules/playwright/index.mjs";
const viewportCases = [
  { width: 1440, height: 900 },
  { width: 834, height: 1194 },
  { width: 390, height: 844 },
  { width: 320, height: 740 },
];
const identities = {
  member: { id: "fake_alice", email: "alice@portal.test" },
  viewer: { id: "fake_stranger", email: "stranger@portal.test" },
  teamless: { id: "fake_pending", email: "pending@portal.test" },
};
const references = {
  discover:
    "/home/param302/Dev/DDEHack-portal/design-research/2026-10-23/main-pages-v3/03-discover-and-profile.png",
  rules:
    "/home/param302/Dev/DDEHack-portal/design-research/2026-10-23/main-pages-v3/08-team-rules-owner-logs.png",
};
const plan = {
  origin,
  artifactRoot,
  viewportCases,
  identities: Object.values(identities).map((i) => i.id),
  methods: ["GET", "HEAD"],
  chromiumSandbox: true,
  references,
  sourceEnv: "DISCOVER_QA_SOURCE",
  workerEnv: "DISCOVER_QA_WORKER",
  artifactRootEnv: "DISCOVER_QA_ARTIFACT_ROOT",
  requires: "root matching-artifact readiness signal and --preview-ready",
  writes: "local screenshots and sanitized metrics only",
};
if (!process.argv.includes("--preview-ready")) {
  console.log(JSON.stringify({ launched: false, plan }, null, 2));
  process.exit(0);
}
assert(
  existsSync(runner),
  "Approved official Playwright package missing; no replacement install allowed.",
);
const artifactPaths = [
  "dist/server/index.js",
  "dist/server/wrangler.json",
  "dist/client/.vite/manifest.json",
];
const fingerprints = () =>
  Object.fromEntries(
    artifactPaths.map((path) => [
      path,
      createHash("sha256")
        .update(readFileSync(resolve(artifactRoot, path)))
        .digest("hex"),
    ]),
  );
const before = fingerprints();
const checkoutHead = execFileSync(
  "git",
  ["-C", artifactRoot, "rev-parse", "HEAD"],
  { encoding: "utf8" },
).trim();
const source = process.env.DISCOVER_QA_SOURCE || checkoutHead;
const expectedWorker =
  process.env.DISCOVER_QA_WORKER || before[artifactPaths[0]];
assert.match(source, /^[a-f0-9]{7,40}$/, "Declared source must be a Git SHA.");
assert.equal(
  before[artifactPaths[0]],
  expectedWorker,
  "Preview artifact differs from declared Worker.",
);
for (const path of Object.values(references))
  assert(existsSync(path), "Selected reference missing: " + path);
const output = resolve(
  "evidence/discover-rules-v6",
  source.slice(0, 8) + "-" + new Date().toISOString().replaceAll(":", "-"),
);
mkdirSync(output, { recursive: true });
const report = {
  plan,
  source,
  checkoutHead,
  expectedWorker,
  artifactBefore: before,
  startedAt: new Date().toISOString(),
  browser: null,
  checks: [],
  captures: [],
  coverage: [],
  pageErrors: [],
  blocked: [],
  limitations: [
    "Local synthetic compiled preview only; no production data or real sign-in proof.",
    "Create/join mutations are never clicked or sent. Presence/disabled/role gates are compared with current safe API data.",
    "No fixture records are created. A fixture with no eligible open team cannot prove an enabled join button in the browser.",
    "Original reference and actual matching-state screenshots must be opened together after capture; capture alone is not visual acceptance.",
  ],
  references,
};
const save = () =>
  writeFileSync(
    output + "/report.json",
    JSON.stringify(report, null, 2) + "\n",
  );
const check = async (name, fn) => {
  try {
    const detail = await fn();
    report.checks.push({ name, passed: true, ...detail });
  } catch (error) {
    report.checks.push({ name, passed: false, error: error.message });
  }
  save();
};
const privacyPattern =
  /@portal\.test|12025550100|private core idea|FAKE-NOT-REDEEMABLE|SYNTHETIC-NOT-REDEEMABLE/i;
const { chromium } = await import(runner);
let browser;
try {
  browser = await chromium.launch({ headless: true, chromiumSandbox: true });
  report.browser = browser.version();
  async function setup(identity, viewport) {
    const context = await browser.newContext({
      viewport,
      serviceWorkers: "block",
      reducedMotion: "reduce",
    });
    await context.route("**/*", (route) => {
      const request = route.request(),
        url = new URL(request.url());
      if (
        url.origin !== origin ||
        !["GET", "HEAD"].includes(request.method())
      ) {
        report.blocked.push({
          kind: url.origin !== origin ? "external" : "mutation",
          method: request.method(),
          path: url.origin === origin ? url.pathname : undefined,
        });
        return route.abort("blockedbyclient");
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
    page.setDefaultTimeout(7000);
    page.on("pageerror", (e) =>
      report.pageErrors.push({
        actor: identity.id,
        viewport,
        message: e.message,
      }),
    );
    return { context, page };
  }
  async function load(page, path, heading) {
    await page.goto(origin + path, { waitUntil: "networkidle" });
    await page
      .getByRole("heading", { name: heading, exact: true, level: 1 })
      .waitFor();
    await page.evaluate(() => document.fonts.ready);
  }
  async function data(page, path, identity) {
    const result = await page.evaluate(async (p) => {
      const r = await fetch("/api/portal?view=" + encodeURIComponent(p), {
        cache: "no-store",
      });
      if (!r.ok) throw new Error("Local API returned " + r.status);
      return r.json();
    }, path);
    assert.equal(result.me?.id, identity.id, "Synthetic identity mismatch");
    return result;
  }
  async function shot(page, name, label) {
    await page.waitForTimeout(100);
    const path = output + "/" + name + ".png";
    await page.screenshot({ path, fullPage: false, animations: "disabled" });
    report.captures.push({
      name,
      label,
      path,
      viewport: page.viewportSize(),
      scrollY: await page.evaluate(() => scrollY),
    });
    save();
  }
  async function bounds(page, selector) {
    const state = await page.locator(selector).evaluate((node) => {
      const rect = node.getBoundingClientRect();
      return {
        viewport: innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        left: rect.left,
        right: rect.right,
        width: rect.width,
      };
    });
    assert.ok(state.documentWidth <= state.viewport + 1, JSON.stringify(state));
    assert.ok(
      state.left >= -1 && state.right <= state.viewport + 1,
      JSON.stringify(state),
    );
    return state;
  }
  for (const viewport of viewportCases) {
    const key = viewport.width + "x" + viewport.height,
      { context, page } = await setup(identities.member, viewport);
    try {
      await load(page, "/discover/participants", "Discover");
      const peopleData = await data(
          page,
          "/discover/participants",
          identities.member,
        ),
        people = peopleData.items || [];
      await check(key + " People safe fields and expression rows", async () => {
        assert.equal(
          await page.locator(".discover-people > li").count(),
          people.length,
        );
        assert.equal(
          await page.locator(".discover-people > li > svg").count(),
          people.length,
        );
        assert.doesNotMatch(
          await page.locator(".discover-v6").innerText(),
          privacyPattern,
        );
        return {
          people: people.length,
          ...(await bounds(page, ".discover-v6")),
        };
      });
      await shot(page, "people-" + key, "Actual Discover People " + key);
      const filter = page.getByRole("group", { name: "Team membership" });
      for (const [label, wanted] of [
        ["In a team", people.filter((p) => p.teamName).length],
        ["Not in a team", people.filter((p) => !p.teamName).length],
        ["All", people.length],
      ]) {
        await check(key + " membership filter " + label, async () => {
          await filter
            .getByRole("button", { name: label, exact: true })
            .click();
          assert.equal(
            await page.locator(".discover-people > li").count(),
            wanted,
          );
          assert.equal(
            await filter
              .getByRole("button", { name: label, exact: true })
              .getAttribute("aria-pressed"),
            "true",
          );
          return { visible: wanted };
        });
      }
      await check(key + " People search and empty state", async () => {
        const input = page.getByRole("searchbox", { name: "Search people" });
        if (people.length) {
          const needle = people[0].name;
          await input.fill(needle);
          const expected = people.filter((p) =>
            `${p.name || ""} ${p.teamName || ""} ${p.bio || ""}`
              .toLowerCase()
              .includes(needle.toLowerCase()),
          ).length;
          assert.equal(
            await page.locator(".discover-people > li").count(),
            expected,
          );
        }
        await input.fill("NO-SYNTHETIC-MATCH-991");
        assert.equal(await page.locator(".discover-people > li").count(), 0);
        assert.equal(
          await page.locator(".discover-empty").innerText(),
          "No matches",
        );
        await shot(
          page,
          "people-empty-" + key,
          "Actual People no matches " + key,
        );
        await input.fill("");
      });
      const person = people.find((p) => p.socials?.length) || people[0];
      if (person) {
        assert.match(person.id, /^fake_[a-z0-9_]+$/);
        const opener = page
          .locator('[id="person-' + person.id + '"]')
          .getByRole("button", {
            name: `View ${person.name}'s profile`,
            exact: true,
          });
        await check(
          key + " profile modal opens with safe identity and social links",
          async () => {
            await opener.click();
            const dialog = page.locator("dialog.discovery-profile-v6[open]");
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
            assert.doesNotMatch(await dialog.innerText(), privacyPattern);
            assert.equal(
              await dialog.locator('a[href^="tel:"],a[href*="wa.me"]').count(),
              0,
            );
            assert.equal(await dialog.locator("input,textarea").count(), 0);
            assert.equal(
              await dialog
                .getByText("You are viewing this profile as a member", {
                  exact: true,
                })
                .count(),
              0,
            );
            return await bounds(page, "dialog.discovery-profile-v6[open]");
          },
        );
        await shot(
          page,
          "other-profile-" + key,
          "Actual safe other-profile modal " + key,
        );
        await check(
          key + " profile Escape and close restore opener focus",
          async () => {
            await page.keyboard.press("Escape");
            await page.waitForSelector("dialog.discovery-profile-v6", {
              state: "detached",
            });
            assert.equal(
              await opener.evaluate((e) => document.activeElement === e),
              true,
            );
            await opener.click();
            await page
              .getByRole("button", { name: "Close profile", exact: true })
              .click();
            await page.waitForSelector("dialog.discovery-profile-v6", {
              state: "detached",
            });
            assert.equal(
              await opener.evaluate((e) => document.activeElement === e),
              true,
            );
          },
        );
        await check(key + " safe profile hash link opens modal", async () => {
          await load(
            page,
            "/discover/participants#person-" + person.id,
            "Discover",
          );
          await page.locator("dialog.discovery-profile-v6[open]").waitFor();
          assert.equal(
            await page
              .locator("dialog.discovery-profile-v6")
              .getByRole("heading", { name: person.name, exact: true })
              .count(),
            1,
          );
          await page.keyboard.press("Escape");
          await page.waitForSelector("dialog.discovery-profile-v6", {
            state: "detached",
          });
        });
      } else
        report.limitations.push(
          key + ": no discoverable person available for modal/hash checks.",
        );
      await load(page, "/discover/teams", "Discover");
      const teamData = await data(page, "/discover/teams", identities.member);
      await check(
        key + " current team member has no create/join controls",
        async () => {
          assert.ok(
            teamData.team,
            "Member fixture must still belong to a team",
          );
          assert.equal(
            await page.locator(".discover-request,.discover-create").count(),
            0,
          );
          assert.equal(
            await page.locator(".discover-teams > li").count(),
            teamData.items.length,
          );
          return await bounds(page, ".discover-v6");
        },
      );
      await shot(
        page,
        "teams-member-" + key,
        "Actual member Teams browsing " + key,
      );
      const teamView = page
        .getByRole("button", { name: "View team", exact: true })
        .first();
      if (await teamView.count())
        await check(
          key + " safe team dialog opens and returns focus",
          async () => {
            await teamView.click();
            const dialog = page.locator("dialog.discover-team-dialog-v6[open]");
            await dialog.waitFor();
            assert.doesNotMatch(await dialog.innerText(), privacyPattern);
            assert.equal(
              await dialog.locator("form,input,textarea").count(),
              0,
            );
            await bounds(page, "dialog.discover-team-dialog-v6[open]");
            await shot(
              page,
              "team-dialog-" + key,
              "Actual safe team dialog " + key,
            );
            await page.keyboard.press("Escape");
            await page.waitForSelector("dialog.discover-team-dialog-v6", {
              state: "detached",
            });
            assert.equal(
              await teamView.evaluate((e) => document.activeElement === e),
              true,
            );
          },
        );
      await check(key + " Teams search", async () => {
        const input = page.getByRole("searchbox", { name: "Search teams" });
        await input.fill("NO-SYNTHETIC-MATCH-991");
        assert.equal(await page.locator(".discover-teams > li").count(), 0);
        await input.fill("");
        assert.equal(
          await page.locator(".discover-teams > li").count(),
          teamData.items.length,
        );
      });
      await load(page, "/rules", "Rules");
      const ruleData = await data(page, "/rules", identities.member);
      await check(
        key + " five authoritative Rules categories and initial state",
        async () => {
          assert.equal(ruleData.categories.length, 5);
          const items = page.locator(".rules-accordion > details");
          assert.equal(await items.count(), 5);
          assert.equal(
            await page.locator(".rules-accordion > details[open]").count(),
            1,
          );
          assert.equal(await items.first().getAttribute("open"), "");
          for (const category of ruleData.categories)
            assert.equal(
              await page
                .locator(".rules-accordion summary")
                .getByText(category.title, { exact: true })
                .count(),
              1,
            );
          return await bounds(page, ".rules-v6");
        },
      );
      await shot(
        page,
        "rules-" + key,
        "Actual shared Rules first category open " + key,
      );
      await check(
        key + " Rules keyboard toggles and natural reflow",
        async () => {
          const summaries = page.locator(".rules-accordion summary");
          await summaries.nth(0).focus();
          await page.keyboard.press("Enter");
          assert.equal(
            await page.locator(".rules-accordion > details[open]").count(),
            0,
          );
          await summaries.nth(2).focus();
          await page.keyboard.press("Space");
          assert.equal(
            await page
              .locator(".rules-accordion > details")
              .nth(2)
              .getAttribute("open"),
            "",
          );
          await bounds(page, ".rules-v6");
          const list = page
            .locator(".rules-accordion > details")
            .nth(2)
            .locator("ol");
          assert.ok(
            (await list.innerText()).includes(
              "Exactly three committed submissions",
            ),
          );
          await shot(
            page,
            "rules-building-" + key,
            "Actual expanded submission Rules " + key,
          );
          await summaries.nth(2).focus();
          await page.keyboard.press("Enter");
          await summaries.nth(0).focus();
          await page.keyboard.press("Enter");
        },
      );
    } finally {
      await context.close();
    }
    for (const actorName of ["viewer", "teamless"]) {
      const identity = identities[actorName],
        { context, page } = await setup(identity, viewport);
      try {
        await load(page, "/discover/teams", "Discover");
        const current = await data(page, "/discover/teams", identity),
          items = current.items || [];
        await check(
          key + " " + actorName + " Team permission gates",
          async () => {
            assert.equal(
              await page.locator(".discover-teams > li").count(),
              items.length,
            );
            assert.doesNotMatch(
              await page.locator(".discover-v6").innerText(),
              privacyPattern,
            );
            if (actorName === "viewer") {
              assert.equal(current.me.canParticipate, false);
              assert.equal(
                await page
                  .locator(".discover-request,.discover-create")
                  .count(),
                0,
              );
            } else {
              assert.equal(current.me.canParticipate, true);
              assert.ok(
                !current.team,
                "Teamless fixture unexpectedly has a team",
              );
              assert.equal(await page.locator(".discover-create").count(), 1);
              const eligible = items.filter(
                (t) => !t.locked && Number(t.readiness?.total) < 5,
              );
              assert.equal(
                await page.locator(".discover-request").count(),
                eligible.length,
              );
              report.coverage.push({
                viewport,
                actor: identity.id,
                eligibleOpenTeams: eligible.length,
                pendingRequests: eligible.filter((t) => t.requested).length,
              });
              if (!eligible.length)
                report.limitations.push(
                  key +
                    ": no unlocked non-full team, so actual positive join control is not covered.",
                );
              for (const team of eligible) {
                const row = page.locator(".discover-teams > li").filter({
                  has: page.getByRole("heading", {
                    name: team.name,
                    exact: true,
                  }),
                });
                assert.equal(
                  await row.locator(".discover-request").isDisabled(),
                  !!team.requested,
                );
              }
              await page.locator(".discover-create > summary").click();
              assert.equal(
                await page
                  .locator('.discover-create input[name="name"]')
                  .isVisible(),
                true,
              );
              await page.locator(".discover-create > summary").click();
            }
            return await bounds(page, ".discover-v6");
          },
        );
        await shot(
          page,
          "teams-" + actorName + "-" + key,
          "Actual " + actorName + " Teams gates " + key,
        );
        if (actorName === "viewer") {
          await load(page, "/discover/participants", "Discover");
          await check(key + " viewer People browse is safe", async () => {
            assert.equal(
              await page.locator(".discover-request,.discover-create").count(),
              0,
            );
            assert.doesNotMatch(
              await page.locator(".discover-v6").innerText(),
              privacyPattern,
            );
            return await bounds(page, ".discover-v6");
          });
        }
      } finally {
        await context.close();
      }
    }
  }
} catch (error) {
  report.failure = error.stack;
} finally {
  if (browser) await browser.close();
  report.browserClosed = true;
  report.artifactAfter = fingerprints();
  report.checks.push({
    name: "compiled artifact unchanged",
    passed: JSON.stringify(before) === JSON.stringify(report.artifactAfter),
  });
  report.finishedAt = new Date().toISOString();
  save();
}
console.log(
  JSON.stringify(
    {
      output,
      captures: report.captures.length,
      checks: report.checks.length,
      failed: report.checks.filter((c) => !c.passed),
      pageErrors: report.pageErrors,
      blocked: report.blocked,
      failure: report.failure,
      browserClosed: report.browserClosed,
    },
    null,
    2,
  ),
);
