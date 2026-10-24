// One read-only, like-for-like DOM check. No performance replay or data mutation.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { chromium } from "@playwright/test";

const options = Object.fromEntries(
  process.argv.slice(2).reduce((rows, value, index, values) => {
    if (value.startsWith("--")) rows.push([value.slice(2), values[index + 1]]);
    return rows;
  }, []),
);
const beforeRoot = options["before-root"] || "/workspace/ddd-landing-baseline";
const afterRoot = options["after-root"] || "/workspace/dddhack-portal";
const beforeOrigin = options["before-origin"] || "http://127.0.0.1:3018";
const afterOrigin = options["after-origin"] || "http://127.0.0.1:3000";
const output = options.output || "evidence/admin-dom-comparison/report.json";
for (const origin of [beforeOrigin, afterOrigin]) {
  const url = new URL(origin);
  assert.equal(url.protocol, "http:");
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(url.hostname));
}
const git = (root, ...args) =>
  execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const beforeSource = git(beforeRoot, "rev-parse", "HEAD");
assert.equal(beforeSource, "696b125f9711a4fd6e02c3ece3adadb18b83cba7");
const report = {
  beforeSource,
  afterSource: git(afterRoot, "rev-parse", "HEAD"),
  runtimeChangesBefore: git(
    beforeRoot,
    "status",
    "--porcelain",
    "--",
    "app",
    "lib",
    "neon",
    "next.config.ts",
  ),
  runtimeChangesAfter: git(
    afterRoot,
    "status",
    "--porcelain",
    "--",
    "app",
    "lib",
    "neon",
    "next.config.ts",
  ),
  backend: "same disposable rich synthetic backend8789",
  actor: "owner synthetic fixture",
  route: "/admin/participants",
  viewport: { width: 1440, height: 900 },
  syntheticOnly: true,
  readOnly: true,
  measurements: [],
  blocked: [],
  errors: [],
  limitations: [
    "Single DOM observation per state, not a latency, transfer-size or performance benchmark.",
    "CSS-visible row count includes below-the-fold rows; in-viewport row count is reported separately.",
    "Old Registered+Locked default is retained only to explain the earlier empty-versus-populated confound.",
  ],
};
assert.equal(report.runtimeChangesBefore, "");
assert.equal(report.runtimeChangesAfter, "");
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  headless: true,
  chromiumSandbox: false,
});
for (const [variant, origin] of [
  ["before", beforeOrigin],
  ["after", afterOrigin],
]) {
  const context = await browser.newContext({
    viewport: report.viewport,
    reducedMotion: "reduce",
  });
  await context.addCookies([
    { name: "portal_local_fixture", value: "owner", url: origin },
  ]);
  await context.route("**/*", (route) => {
    const request = route.request(),
      url = new URL(request.url());
    if (url.origin !== origin || !["GET", "HEAD"].includes(request.method())) {
      report.blocked.push({
        variant,
        origin: url.origin,
        path: url.pathname,
        method: request.method(),
      });
      return route.abort();
    }
    return route.continue();
  });
  const page = await context.newPage();
  page.on("pageerror", (error) =>
    report.errors.push({ variant, message: error.message }),
  );
  await page.goto(`${origin}/admin/participants`, {
    waitUntil: "networkidle",
    timeout: 60_000,
  });
  await page.waitForFunction(() =>
    Object.keys(document.getElementById("main") || {}).some((key) =>
      key.startsWith("__reactFiber"),
    ),
  );
  await page.evaluate(() => document.fonts.ready);
  async function measure(state) {
    const values = await page.evaluate(() => {
      const section = document.querySelector(".admin-participants-page");
      const rows = [...section.querySelectorAll("tbody tr")];
      const visible = (row) =>
        row.getClientRects().length > 0 &&
        getComputedStyle(row).visibility !== "hidden";
      const inViewport = (row) => {
        const box = row.getBoundingClientRect();
        return (
          visible(row) &&
          box.bottom > 0 &&
          box.top < innerHeight &&
          box.right > 0 &&
          box.left < innerWidth
        );
      };
      return {
        documentElements: document.querySelectorAll("*").length,
        mainElements: document.getElementById("main").querySelectorAll("*")
          .length,
        participantSectionElements: section.querySelectorAll("*").length,
        renderedParticipants: rows.length,
        cssVisibleParticipants: rows.filter(visible).length,
        inViewportParticipants: rows.filter(inViewport).length,
        filters: [
          ...section.querySelectorAll(".admin-participant-filters select"),
        ].map((select) => ({
          value: select.value,
          label: select.selectedOptions[0]?.textContent.trim(),
        })),
      };
    });
    report.measurements.push({ variant, state, ...values });
  }
  await measure("initial default");
  if (variant === "before") {
    await page
      .getByRole("combobox", { name: "Personal status", exact: true })
      .selectOption("all");
    await page
      .getByRole("combobox", { name: "Team status", exact: true })
      .selectOption("all");
    await page.waitForFunction(
      () =>
        document.querySelectorAll(".admin-participants-page tbody tr").length >
        0,
    );
    await page.waitForTimeout(100);
    await measure("All statuses + All people");
  }
  await context.close();
}
await browser.close();
const before = report.measurements.find(
  (row) =>
    row.variant === "before" && row.state === "All statuses + All people",
);
const after = report.measurements.find((row) => row.variant === "after");
assert.equal(before.filters.length, 2);
assert.equal(after.filters.length, 2);
assert.ok(before.filters.every((filter) => filter.value === "all"));
assert.ok(after.filters.every((filter) => filter.value === "all"));
assert.equal(before.cssVisibleParticipants, after.cssVisibleParticipants);
assert.ok(before.cssVisibleParticipants > 0);
assert.deepEqual(report.blocked, []);
assert.deepEqual(report.errors, []);
report.likeForLike = {
  participantsEach: before.cssVisibleParticipants,
  documentElements: {
    before: before.documentElements,
    after: after.documentElements,
    difference: after.documentElements - before.documentElements,
  },
  participantSectionElements: {
    before: before.participantSectionElements,
    after: after.participantSectionElements,
    difference:
      after.participantSectionElements - before.participantSectionElements,
  },
  conclusion:
    "Use populated All filters for DOM comparisons. Empty old default versus populated new default is a content-state confound, not evidence of a performance regression.",
};
mkdirSync(dirname(resolve(output)), { recursive: true });
writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report.likeForLike));
