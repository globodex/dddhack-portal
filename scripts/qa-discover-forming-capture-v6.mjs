// Named synthetic read-only follow-up. Requires the parent's matching-artifact gate.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
const origin = "http://127.0.0.1:4173";
const artifactRoot = resolve(
  process.env.DISCOVER_QA_ARTIFACT_ROOT || "../visual-integration",
);
const source = process.env.DISCOVER_QA_SOURCE;
const expectedWorker = process.env.DISCOVER_QA_WORKER;
const targets = ["fake_teamqa_forming", "fake_teamqa_solo_team"];
const cases = [
  { width: 1440, height: 900, touch: false },
  { width: 390, height: 844, touch: true },
  { width: 320, height: 740, touch: true },
];
if (!process.argv.includes("--preview-ready")) {
  console.log(
    JSON.stringify(
      {
        launched: false,
        origin,
        targets,
        cases,
        methods: ["GET", "HEAD"],
        chromiumSandbox: true,
      },
      null,
      2,
    ),
  );
  process.exit(0);
}
assert.match(source || "", /^[a-f0-9]{40}$/);
assert.match(expectedWorker || "", /^[a-f0-9]{64}$/);
const paths = [
  "dist/server/index.js",
  "dist/server/wrangler.json",
  "dist/client/.vite/manifest.json",
];
const fingerprint = () =>
  Object.fromEntries(
    paths.map((path) => [
      path,
      createHash("sha256")
        .update(readFileSync(resolve(artifactRoot, path)))
        .digest("hex"),
    ]),
  );
const before = fingerprint();
assert.equal(before[paths[0]], expectedWorker);
const output = resolve(
  "evidence/discover-rules-v6",
  source.slice(0, 8) +
    "-named-teams-" +
    new Date().toISOString().replaceAll(":", "-"),
);
mkdirSync(output, { recursive: true });
const report = {
  source,
  artifactBefore: before,
  cases,
  targets,
  actor: "fake_pending",
  checks: [],
  captures: [],
  blocked: [],
  errors: [],
  browserClosed: false,
};
let browser;
try {
  const { chromium } =
    await import("/tmp/ddehack-playwright-runner/node_modules/playwright/index.mjs");
  browser = await chromium.launch({ headless: true, chromiumSandbox: true });
  for (const spec of cases) {
    const context = await browser.newContext({
      viewport: { width: spec.width, height: spec.height },
      isMobile: spec.touch,
      hasTouch: spec.touch,
      reducedMotion: "reduce",
      serviceWorkers: "block",
    });
    await context.route("**/*", (route) => {
      const request = route.request(),
        url = new URL(request.url());
      if (
        url.origin !== origin ||
        !["GET", "HEAD"].includes(request.method())
      ) {
        report.blocked.push({
          method: request.method(),
          path: url.origin === origin ? url.pathname : "external",
        });
        return route.abort("blockedbyclient");
      }
      return route.continue({
        headers: {
          ...request.headers(),
          "oai-authenticated-user-id": "fake_pending",
          "oai-authenticated-user-email": "pending@portal.test",
        },
      });
    });
    try {
      const page = await context.newPage();
      page.setDefaultTimeout(7000);
      page.on("pageerror", (error) => report.errors.push(error.message));
      await page.goto(origin + "/discover/teams", { waitUntil: "networkidle" });
      await page.locator(".discover-v6").waitFor();
      const data = await page.evaluate(async () =>
        (
          await fetch("/api/portal?view=%2Fdiscover%2Fteams", {
            cache: "no-store",
          })
        ).json(),
      );
      assert.equal(data.me.id, "fake_pending");
      assert.equal(data.me.canParticipate, true);
      assert.ok(!data.team);
      for (const id of targets) {
        // Each clean target capture starts before any prior cancellation notice.
        await page.goto(origin + "/discover/teams", {
          waitUntil: "networkidle",
        });
        await page.locator(".discover-v6").waitFor();
        const team = data.items.find((row) => row.id === id);
        assert.ok(team, "Named fixture must exist: " + id);
        const search = page.getByRole("searchbox", { name: "Search teams" });
        await search.fill(team.name);
        const row = page.locator(".discover-teams > li").filter({
          has: page.getByRole("heading", { name: team.name, exact: true }),
        });
        await row.waitFor();
        assert.equal(await page.locator(".discover-teams > li").count(), 1);
        assert.equal(team.locked, false);
        assert.ok(Number(team.readiness.total) < 5);
        const request = row.getByRole("button", {
          name: "Request to join",
          exact: true,
        });
        assert.equal(await request.isEnabled(), true);
        assert.ok(
          (await row.innerText()).includes(team.readiness.total + "/5 members"),
        );
        await page.locator(".discover-heading h1").click();
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.evaluate(() => document.fonts.ready);
        const name =
          (id === targets[0] ? "teams-forming" : "teams-solo") +
          "-teamless-" +
          spec.width +
          "x" +
          spec.height;
        const path = output + "/" + name + ".png";
        await page.screenshot({
          path,
          fullPage: false,
          animations: "disabled",
        });
        report.captures.push({
          name,
          path,
          viewport: spec,
          teamId: id,
          filtered: true,
          query: team.name,
          scrollY: await page.evaluate(() => scrollY),
        });
        if (spec.touch) await request.tap();
        else await request.click();
        const dialog = page.locator("dialog.confirmation-dialog[open]");
        await dialog.waitFor();
        assert.ok(
          (await dialog.locator("#confirmation-target").innerText()).includes(
            team.name,
          ),
        );
        const cancel = dialog.getByRole("button", {
          name: "Cancel",
          exact: true,
        });
        if (spec.touch) await cancel.tap();
        else await cancel.click();
        await page
          .locator("dialog.confirmation-dialog")
          .waitFor({ state: "detached" });
        const after = await page.evaluate(async () =>
          (
            await fetch("/api/portal?view=%2Fdiscover%2Fteams", {
              cache: "no-store",
            })
          ).json(),
        );
        assert.equal(
          !!after.items.find((row) => row.id === id)?.requested,
          !!team.requested,
        );
        report.checks.push({
          name:
            name +
            " availability, exact-target confirmation, Cancel and no persisted request",
          passed: true,
          touch: spec.touch,
        });
      }
    } finally {
      await context.close();
    }
  }
} catch (error) {
  report.failure = error.stack;
} finally {
  if (browser) await browser.close();
  report.browserClosed = true;
  report.artifactAfter = fingerprint();
  report.artifactUnchanged =
    JSON.stringify(report.artifactBefore) ===
    JSON.stringify(report.artifactAfter);
  writeFileSync(
    output + "/report.json",
    JSON.stringify(report, null, 2) + "\n",
  );
}
console.log(
  JSON.stringify(
    {
      output,
      checks: report.checks.length,
      captures: report.captures.length,
      failure: report.failure,
      blocked: report.blocked.length,
      errors: report.errors.length,
      browserClosed: report.browserClosed,
      artifactUnchanged: report.artifactUnchanged,
    },
    null,
    2,
  ),
);
