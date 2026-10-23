// Coordinated local-only admin QA. Run only after the release owner releases the load-test hold.
// Every mutation is blocked except the non-committing preview-import read/validation action.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

if (!process.argv.includes("--preview-ready")) {
  console.log(
    "PREPARED ONLY. Start the matching disposable rich synthetic preview on 127.0.0.1:4173, finish isolated load measurements, then set V6_QA_SOURCE, V6_QA_WORKER_SHA and V6_QA_ARTIFACT_ROOT and rerun with --preview-ready. No browser or requests started.",
  );
  process.exit(0);
}
const source = process.env.V6_QA_SOURCE;
const workerSha = process.env.V6_QA_WORKER_SHA;
assert.match(
  source || "",
  /^[0-9a-f]{40}$/,
  "V6_QA_SOURCE must identify the compiled source",
);
assert.match(
  workerSha || "",
  /^[0-9a-f]{64}$/,
  "V6_QA_WORKER_SHA must identify the compiled Worker",
);
const artifactRoot = resolve(process.env.V6_QA_ARTIFACT_ROOT || ".");
const workerPath = join(artifactRoot, "dist/server/index.js");
const hash = (file) =>
  createHash("sha256").update(readFileSync(file)).digest("hex");
assert.equal(
  hash(workerPath),
  workerSha,
  "Worker does not match the coordinated artifact",
);
const observedHead = execFileSync(
  "git",
  ["-C", artifactRoot, "rev-parse", "HEAD"],
  { encoding: "utf8" },
).trim();
assert.equal(
  observedHead,
  source,
  "Artifact checkout moved since the coordinated source checkpoint",
);
const origin = "http://127.0.0.1:4173";
const runId = `${source.slice(0, 8)}-${workerSha.slice(0, 8)}-${new Date().toISOString().replace(/[:.]/g, "-")}`;
const output = join(
  resolve(process.env.V6_QA_OUTPUT || "evidence/v6-admin"),
  runId,
);
mkdirSync(output, { recursive: true });
const report = {
  source,
  workerSha256: workerSha,
  observedHead,
  artifactRoot,
  origin,
  startedAt: new Date().toISOString(),
  syntheticOnly: true,
  chromiumSandbox: true,
  checks: [],
  captures: [],
  pageErrors: [],
  consoleErrors: [],
  blocked: [],
  requests: [],
  verification:
    "Actual compiled local Worker with disposable synthetic D1. Not hosted sign-in or user acceptance.",
};
const { chromium } =
  await import("/tmp/ddehack-playwright-runner/node_modules/playwright/index.mjs");
const browser = await chromium.launch({
  headless: true,
  chromiumSandbox: true,
});
report.browser = browser.version();
async function check(name, work) {
  try {
    const details = await work();
    report.checks.push({ name, passed: true, ...details });
  } catch (error) {
    report.checks.push({ name, passed: false, error: error.message });
  }
}
async function session(viewport, label) {
  const context = await browser.newContext({
    viewport,
    serviceWorkers: "block",
    reducedMotion: "reduce",
  });
  await context.route("**/*", async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    if (url.origin !== origin) {
      report.blocked.push({
        kind: "external",
        origin: url.origin,
        path: url.pathname,
      });
      return route.abort("blockedbyclient");
    }
    let action;
    if (!["GET", "HEAD"].includes(request.method())) {
      try {
        action = JSON.parse(request.postData() || "{}").action;
      } catch {}
      if (
        request.method() !== "POST" ||
        url.pathname !== "/api/portal" ||
        action !== "preview-import"
      ) {
        report.blocked.push({
          kind: "mutation",
          method: request.method(),
          path: url.pathname,
          action: action || "unknown",
        });
        return route.abort("blockedbyclient");
      }
    }
    report.requests.push({
      viewport: label,
      method: request.method(),
      path: url.pathname,
      ...(action ? { action } : {}),
    });
    await route.continue({
      headers: {
        ...request.headers(),
        "oai-authenticated-user-id": "fake_admin",
        "oai-authenticated-user-email": "admin@portal.test",
      },
    });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  page.on("pageerror", (error) =>
    report.pageErrors.push({ viewport: label, message: error.message }),
  );
  page.on("console", (message) => {
    if (message.type() === "error")
      report.consoleErrors.push({ viewport: label, message: message.text() });
  });
  return { context, page };
}
async function load(page, route, title) {
  await page.goto(origin + route, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: title, exact: true }).waitFor();
  await page.evaluate(() => document.fonts.ready);
  assert.equal(
    await page.locator(".centered-loader").count(),
    0,
    "Loading state did not settle",
  );
}
async function bounds(page) {
  const metrics = await page.evaluate(() => ({
    viewportWidth: innerWidth,
    viewportHeight: innerHeight,
    documentWidth: document.documentElement.scrollWidth,
    documentHeight: document.documentElement.scrollHeight,
  }));
  assert.ok(
    metrics.documentWidth <= metrics.viewportWidth + 1,
    JSON.stringify(metrics),
  );
  return metrics;
}
async function capture(page, label, { fullPage = false } = {}) {
  await page.evaluate(() => document.fonts.ready);
  const path = join(output, label + ".png");
  await page.screenshot({ path, fullPage, animations: "disabled" });
  const image = await page.evaluate(() => ({
    width: innerWidth,
    height: innerHeight,
  }));
  const record = {
    label,
    path,
    kind: fullPage ? "browser-fullpage" : "visible-viewport",
    viewport: image,
    sha256: hash(path),
    route: new URL(page.url()).pathname,
  };
  report.captures.push(record);
  return record;
}
async function cancelDialog(page, label, target) {
  const dialog = page.locator("dialog.confirmation-dialog[open]");
  await dialog.waitFor();
  const cancel = dialog.getByRole("button", { name: "Cancel", exact: true });
  const text = await dialog.innerText();
  const focused = await cancel.evaluate(
    (element) => document.activeElement === element,
  );
  const buttons = await dialog.getByRole("button").allTextContents();
  const primaryBackground = await dialog
    .locator("button.button:not(.secondary)")
    .evaluate((element) => getComputedStyle(element).backgroundColor);
  await capture(page, label);
  // Always dismiss before assertions, including when the target or focus is wrong.
  await cancel.click();
  await dialog.waitFor({ state: "hidden" });
  assert.ok(text.includes(target), text);
  assert.equal(focused, true, "Cancel must receive initial focus");
  assert.equal(buttons.length, 2, "Exactly Cancel and one confirmation action");
  assert.equal(
    primaryBackground,
    "rgb(17, 21, 21)",
    "Admin confirmation primary must use the approved black",
  );
  return {
    target,
    buttons: buttons.map((value) => value.trim()),
    cancelFocused: focused,
  };
}
async function importChecks(page, label) {
  await load(page, "/admin/participants", "Participants");
  await page
    .getByRole("button", { name: "Add participants", exact: true })
    .click();
  const add = page.locator(".admin-import");
  await check(`${label}: focused import width`, async () => {
    const box = await page.locator(".admin-import-dialog").boundingBox();
    assert.ok(box.width <= 602, `Import width ${box.width}`);
    await capture(page, `${label}-import-single-form`);
    return { width: box.width, ...(await bounds(page)) };
  });
  await check(`${label}: single email confirmation cancelled`, async () => {
    const email = `v6-single-${label}@portal.test`;
    await add.getByLabel("Email", { exact: true }).fill(email);
    await add.getByRole("button", { name: "Add", exact: true }).click();
    const result = await cancelDialog(
      page,
      `${label}-import-single-confirm-cancel`,
      email,
    );
    assert.equal(
      await add.getByLabel("Email", { exact: true }).inputValue(),
      email,
    );
    return result;
  });
  await check(
    `${label}: deduplicated email list confirmation cancelled`,
    async () => {
      await add
        .getByRole("button", { name: "Email list", exact: true })
        .click();
      await add
        .getByLabel("Email list", { exact: true })
        .fill(
          `v6-list-one-${label}@portal.test;v6-list-two-${label}@portal.test;v6-list-one-${label}@portal.test;bob@portal.test`,
        );
      await add.getByRole("button", { name: "Add", exact: true }).click();
      return cancelDialog(
        page,
        `${label}-import-list-confirm-cancel`,
        "2 participants",
      );
    },
  );
  await check(`${label}: header CSV confirmation cancelled`, async () => {
    await add.getByRole("button", { name: "CSV", exact: true }).click();
    await add.locator("input[type=file]").setInputFiles({
      name: "synthetic-v6-cancel.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        `email\nv6-csv-one-${label}@portal.test\nv6-csv-two-${label}@portal.test\nbob@portal.test\n`,
      ),
    });
    await add.getByRole("button", { name: "Add", exact: true }).click();
    return cancelDialog(
      page,
      `${label}-import-csv-confirm-cancel`,
      "2 participants",
    );
  });
}
try {
  for (const [label, viewport] of [
    ["desktop", { width: 1440, height: 900 }],
    ["mobile", { width: 390, height: 844 }],
    ["tablet", { width: 834, height: 1194 }],
    ["narrow", { width: 320, height: 740 }],
  ]) {
    const { context, page } = await session(viewport, label);
    try {
      await check(`${label}: Participants default compact rows`, async () => {
        await load(page, "/admin/participants", "Participants");
        await capture(page, `${label}-participants-undimmed`);
        const metrics = await bounds(page);
        const rows = page.locator(".participants-table tbody tr");
        assert.equal(
          await rows.count(),
          3,
          "Expected Bob, Carol and Dave reserved Registered/Locked fixtures",
        );
        assert.equal(
          await page
            .locator(".admin-participant-filters select")
            .nth(0)
            .inputValue(),
          "registered",
        );
        assert.equal(
          await page
            .locator(".admin-participant-filters select")
            .nth(1)
            .inputValue(),
          "locked",
        );
        const first = rows.first(),
          box = await first.boundingBox();
        assert.ok(
          box.y < viewport.height,
          `First participant below viewport: ${box.y}`,
        );
        assert.equal(
          await first.locator(".admin-person-identity > svg").count(),
          1,
          "Participant dot cue missing",
        );
        assert.equal(
          await first.locator(".admin-status-menu[open]").count(),
          0,
        );
        if (viewport.width > 740)
          assert.ok(
            box.height <= 66,
            `Closed row height ${box.height} exceeds compact target`,
          );
        return {
          ...metrics,
          firstRowY: box.y,
          firstRowHeight: box.height,
          rows: await rows.count(),
        };
      });
      await check(
        `${label}: More status control opens and closes without mutation`,
        async () => {
          const row = page.locator(".participants-table tbody tr").first();
          const summary = row.locator(".admin-status-menu > summary");
          await summary.click();
          assert.equal(
            await row.locator(".admin-status-menu[open]").count(),
            1,
          );
          await row
            .locator('.admin-status-menu select[name="status"]')
            .waitFor();
          await capture(page, `${label}-participant-more-open`);
          const result = await bounds(page);
          await summary.click();
          assert.equal(
            await row.locator(".admin-status-menu[open]").count(),
            0,
          );
          return result;
        },
      );
      await check(
        `${label}: exact participant trash target cancelled`,
        async () => {
          const row = page.locator(".participants-table tbody tr").first();
          const target = (
            await row.locator(".admin-person-identity strong").innerText()
          ).trim();
          const menu = row.locator(".admin-status-menu");
          if ((await menu.getAttribute("open")) === null)
            await menu.locator("summary").click();
          await row
            .getByRole("button", { name: /^Remove participant:/ })
            .click();
          const result = await cancelDialog(
            page,
            `${label}-participant-trash-confirm-cancel`,
            target,
          );
          await menu.locator("summary").click();
          return result;
        },
      );
      await check(
        `${label}: search and actual filtered CSV export`,
        async () => {
          const search =
            viewport.width <= 740
              ? page.locator(".admin-mobile-tools input[type=search]")
              : page.locator(".admin-participant-filters input[type=search]");
          await search.fill("Bob");
          assert.equal(
            await page.locator(".participants-table tbody tr").count(),
            1,
          );
          const exportLink = page.getByRole("link", {
            name: "Export filtered participants (1)",
            exact: true,
          });
          assert.equal(
            await exportLink.count(),
            1,
            "Only one visible export control",
          );
          assert.ok((await exportLink.getAttribute("href")).includes("Bob"));
          const [download] = await Promise.all([
            page.waitForEvent("download"),
            exportLink.click(),
          ]);
          assert.equal(await download.failure(), null);
          assert.match(download.suggestedFilename(), /\.csv$/i);
          const csv = readFileSync(await download.path(), "utf8");
          assert.ok(csv.includes("bob@portal.test"));
          assert.ok(!csv.includes("carol@portal.test"));
          assert.ok(!csv.includes("SYNTHETIC-NOT-REDEEMABLE"));
          await search.fill("");
          return { exportedRows: 1, syntheticOnly: true };
        },
      );
      if (viewport.width <= 740)
        await check(`${label}: mobile filters expand and restore`, async () => {
          const toggle = page.getByRole("button", {
            name: "Participant filters",
            exact: true,
          });
          assert.equal(await toggle.getAttribute("aria-expanded"), "false");
          await toggle.click();
          await page
            .locator(".admin-participant-filters select")
            .first()
            .waitFor({ state: "visible" });
          await capture(page, `${label}-participant-filters-expanded`);
          assert.equal(
            await page
              .getByRole("link", { name: /^Export filtered participants/ })
              .count(),
            1,
            "Expanded mobile filters must retain one export control",
          );
          const result = await bounds(page);
          const status = page
              .locator(".admin-participant-filters select")
              .nth(0),
            team = page.locator(".admin-participant-filters select").nth(1);
          await status.selectOption("all");
          await team.selectOption("all");
          assert.ok(
            (await page.locator(".participants-table tbody tr").count()) >= 3,
          );
          await status.selectOption("registered");
          await team.selectOption("locked");
          assert.equal(
            await page.locator(".participants-table tbody tr").count(),
            3,
          );
          await toggle.click();
          assert.equal(await toggle.getAttribute("aria-expanded"), "false");
          return result;
        });
      if (["desktop", "mobile"].includes(label))
        await importChecks(page, label);
      await check(
        `${label}: Credits metrics match actual API metadata`,
        async () => {
          await load(page, "/admin/credits", "Credits");
          const metadata = await page.evaluate(async () => {
            const response = await fetch(
              "/api/portal?view=%2Fadmin%2Fcredits",
              { cache: "no-store" },
            );
            if (!response.ok)
              throw new Error(
                "Credit metadata read failed: " + response.status,
              );
            const data = await response.json();
            if (data.me?.id !== "fake_admin")
              throw new Error("Reserved synthetic admin identity missing");
            return data.items.map(({ name, active, inventory, assigned }) => ({
              name,
              active,
              inventory,
              assigned,
            }));
          });
          const rows = page.locator(".admin-credits-table tbody tr");
          assert.equal(await rows.count(), metadata.length);
          assert.ok(
            metadata.length > 0,
            "Rich fixture must contain actual inventory metadata",
          );
          for (let index = 0; index < metadata.length; index++) {
            const row = rows.nth(index),
              expected = metadata[index];
            assert.equal(
              (await row.locator(".credit-identity strong").innerText()).trim(),
              expected.name,
            );
            assert.equal(
              (await row.locator(".credit-state").innerText()).trim(),
              expected.active ? "Active" : "Inactive",
            );
            assert.equal(
              (
                await row.locator(".credit-metric strong").nth(0).innerText()
              ).trim(),
              String(expected.inventory),
            );
            assert.equal(
              (
                await row.locator(".credit-metric strong").nth(1).innerText()
              ).trim(),
              String(expected.assigned),
            );
            if (viewport.width <= 740) {
              const a = await row
                  .locator(".credit-metric")
                  .nth(0)
                  .boundingBox(),
                b = await row.locator(".credit-metric").nth(1).boundingBox();
              assert.ok(
                Math.abs(a.y - b.y) <= 1,
                "Inventory and Assigned must align",
              );
              assert.ok(b.x > a.x, "Numeric blocks must be side by side");
            }
          }
          await capture(page, `${label}-credits-populated`);
          return { ...(await bounds(page)), metadata };
        },
      );
      await check(`${label}: Credits search empty state`, async () => {
        await page
          .getByRole("searchbox", { name: "Search credits", exact: true })
          .fill("v6-no-such-synthetic-credit");
        assert.equal(
          await page.locator(".admin-credits-table tbody tr").count(),
          0,
        );
        await page
          .getByText("No records match this view.", { exact: true })
          .waitFor();
        await capture(page, `${label}-credits-search-empty`);
        return {
          ...(await bounds(page)),
          state:
            "Search has zero matching records; not an empty-inventory fixture",
        };
      });
      await check(
        `${label}: Teams controls and named removal target`,
        async () => {
          await load(page, "/admin/teams", "Teams");
          await capture(page, `${label}-teams-default`);
          const result = await bounds(page);
          assert.ok(await page.locator(".admin-team-list > li").count());
          assert.equal(
            await page.getByText("Remove membership", { exact: true }).count(),
            0,
          );
          const removal = page
            .locator(".admin-team-list")
            .getByRole("button", { name: /^Remove .* from / })
            .first();
          assert.ok(await removal.count(), "Named icon removal target missing");
          assert.equal(await removal.locator("svg").count(), 1);
          if (viewport.width <= 740) {
            const toggle = page.getByRole("button", {
              name: "Team filters",
              exact: true,
            });
            await toggle.click();
            await page
              .getByRole("combobox", { name: "Team lock status", exact: true })
              .waitFor({ state: "visible" });
            await capture(page, `${label}-teams-filters-expanded`);
            await bounds(page);
            await toggle.click();
          }
          return result;
        },
      );
    } finally {
      await context.close();
    }
  }
} catch (error) {
  report.failure = error.stack;
} finally {
  await browser.close();
  report.finishedAt = new Date().toISOString();
  report.workerSha256After = hash(workerPath);
  report.artifactUnchanged = report.workerSha256After === workerSha;
  report.checks.push({
    name: "No actual mutation or external request attempted",
    passed: report.blocked.length === 0,
  });
  report.checks.push({
    name: "No page errors",
    passed: report.pageErrors.length === 0,
  });
  report.checks.push({
    name: "Compiled Worker unchanged throughout capture",
    passed: report.artifactUnchanged,
  });
  writeFileSync(
    join(output, "ledger.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
}
const failed = report.checks.filter((check) => !check.passed);
console.log(
  JSON.stringify(
    {
      output,
      source,
      workerSha256: workerSha,
      checks: report.checks.length,
      passed: report.checks.length - failed.length,
      captures: report.captures.length,
      failed,
      failure: report.failure,
    },
    null,
    2,
  ),
);
if (report.failure || failed.length) process.exitCode = 1;
