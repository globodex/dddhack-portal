// Positive credit UI controls, one mode per fresh disposable synthetic reset.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "@playwright/test";

assert.ok(process.env.CONTROL_MANIFEST, "CONTROL_MANIFEST is required");
const manifestPath = resolve(process.env.CONTROL_MANIFEST);
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
assert.equal(manifest.disposable, true);
assert.equal(manifest.syntheticOnly, true);
assert.equal(manifest.rootConfirmedReset, true);
assert.equal(manifest.origin, "http://127.0.0.1:4177");
assert.match(manifest.source, /^[a-f0-9]{40}$/);
assert.match(manifest.worker, /^[a-f0-9]{64}$/);
const artifact = resolve(manifest.artifactRoot);
assert.equal(
  execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: artifact,
    encoding: "utf8",
  }).trim(),
  manifest.source,
);
const hash = () =>
  createHash("sha256")
    .update(readFileSync(join(artifact, "dist/server/index.js")))
    .digest("hex");
assert.equal(hash(), manifest.worker);
const mode = process.env.CREDIT_INPUT_MODE || "paste";
assert.ok(["paste", "upload"].includes(mode));
writeFileSync(manifestPath + ".credit-ui-claimed", mode + "\n", {
  flag: "wx",
  mode: 0o600,
});
const viewport =
  mode === "upload"
    ? { width: 390, height: 844 }
    : { width: 1440, height: 900 };
const root = resolve("evidence/v7-credit-batches-ui");
mkdirSync(root, { recursive: true });
const output = mkdtempSync(
  join(root, `${mode}-${manifest.source.slice(0, 7)}-`),
);
const report = {
  source: manifest.source,
  workerSha: manifest.worker,
  mode,
  viewport,
  syntheticOnly: true,
  chromiumSandbox: true,
  checks: [],
  actions: [],
  errors: [],
  blocked: [],
  screenshots: [],
  browserClosed: false,
};
const persist = () =>
  writeFileSync(join(output, "report.json"), JSON.stringify(report, null, 2));
const check = (name) => {
  report.checks.push({ name, passed: true });
  persist();
};
const headings = [`Synthetic ${mode} Alpha`, `Synthetic ${mode} Beta`];
const finalHeading = headings[0] + " Revised";
const csv = [
  headings.join(","),
  ...Array.from({ length: 8 }, (_, row) =>
    [0, 1].map((column) => `SYNTHETIC-RAW-${mode}-${column}-${row}`).join(","),
  ),
].join("\n");
const instructions = [
  "# Redeem Alpha\n**Use your own credit.**\n[Help](https://example.test/alpha)",
  "# Redeem Beta\n1. Read the synthetic steps.\n2. Redeem your own code.",
];
const counts = {
  "preview-credit-batch": 0,
  "publish-credit-batch": 0,
  "delete-credit-column": 0,
  "delete-credit-batch": 0,
};
let releasePreview;
const previewGate = new Promise((resolve) => {
  releasePreview = resolve;
});
let batchId, columnId;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  headless: true,
  chromiumSandbox: true,
});
report.browser = browser.version();
const context = await browser.newContext({
  viewport,
  hasTouch: mode === "upload",
  isMobile: mode === "upload",
  reducedMotion: "reduce",
  serviceWorkers: "block",
});
await context.route("**/*", async (route) => {
  const request = route.request(),
    url = new URL(request.url());
  if (url.origin !== manifest.origin) {
    report.blocked.push({
      kind: "external",
      method: request.method(),
      path: url.pathname,
    });
    return route.abort("blockedbyclient");
  }
  if (!["GET", "HEAD"].includes(request.method())) {
    let body;
    try {
      body = request.postDataJSON();
    } catch {}
    if (
      request.method() !== "POST" ||
      url.pathname !== "/api/portal" ||
      !Object.hasOwn(counts, body?.action)
    ) {
      report.blocked.push({
        kind: "mutation",
        action: body?.action,
        method: request.method(),
      });
      return route.abort("blockedbyclient");
    }
    const action = body.action,
      values = body.data;
    counts[action]++;
    assert.ok(
      counts[action] <= (action === "preview-credit-batch" ? 3 : 1),
      "Exact action budget",
    );
    if (
      action === "preview-credit-batch" ||
      action === "publish-credit-batch"
    ) {
      assert.equal(values.csv, csv);
      if (values.columns) assert.equal(values.columns.length, 2);
      if (action === "publish-credit-batch") {
        assert.equal(values.confirmation, "PUBLISH_CREDIT_BATCH");
        assert.equal(values.columns[0].heading, finalHeading);
        assert.equal(
          values.columns[0].instructions,
          instructions[0] + "\nFinal reviewed steps.",
        );
      }
    } else {
      assert.equal(values.batchId, batchId);
      if (action === "delete-credit-column") {
        assert.equal(values.columnId, columnId);
        assert.equal(values.confirmation, "DELETE_CREDIT_COLUMN");
      } else assert.equal(values.confirmation, "DELETE_CREDIT_BATCH");
    }
    report.actions.push({
      action,
      ordinal: counts[action],
      actor: "fake_admin",
    });
    persist();
    if (action === "preview-credit-batch" && counts[action] === 1)
      await previewGate;
  }
  return route.continue({
    headers: {
      ...request.headers(),
      "oai-authenticated-user-id": "fake_admin",
      "oai-authenticated-user-email": "admin@portal.test",
    },
  });
});
const page = await context.newPage();
page.setDefaultTimeout(12000);
page.on("pageerror", (error) => report.errors.push(error.message));
const click = (locator) =>
  mode === "upload" ? locator.tap() : locator.click();
async function snapshot(name) {
  const path = join(output, `${name}-${viewport.width}x${viewport.height}.png`);
  await page.screenshot({ path, fullPage: true, animations: "disabled" });
  report.screenshots.push({
    path,
    route: "/admin/credits",
    role: "synthetic-admin",
    viewport,
    source: manifest.source,
    workerSha: manifest.worker,
    inspected: false,
  });
}
async function view() {
  return page.evaluate(async () => {
    const response = await fetch("/api/portal?view=/admin/credits", {
      cache: "no-store",
    });
    return {
      status: response.status,
      cache: response.headers.get("cache-control"),
      data: await response.json(),
    };
  });
}
async function confirm() {
  const dialog = page.locator("dialog[open]");
  await dialog.waitFor();
  assert.ok(!(await dialog.innerText()).includes("SYNTHETIC-RAW"));
  await click(dialog.locator("button").last());
}
try {
  await page.goto(manifest.origin + "/admin/credits");
  const editor = page.locator(".credit-batch-editor");
  await editor.waitFor();
  if (mode === "upload") {
    const chooser = page.waitForEvent("filechooser");
    await click(
      editor.getByRole("button", { name: "Upload CSV", exact: true }),
    );
    await (
      await chooser
    ).setFiles({
      name: "synthetic-credits.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv),
    });
    await page.waitForFunction(() =>
      document
        .querySelector('textarea[name="creditsCSV"]')
        .value.includes("SYNTHETIC-RAW"),
    );
  } else await editor.getByLabel("Paste CSV", { exact: true }).fill(csv);
  await click(editor.getByRole("button", { name: "Preview", exact: true }));
  const preparing = editor.getByRole("button", {
    name: "Preparing…",
    exact: true,
  });
  await preparing.waitFor();
  assert.equal(await preparing.isDisabled(), true);
  assert.equal(await preparing.getAttribute("aria-busy"), "true");
  assert.equal(await editor.locator(".credit-batch-spinner").count(), 1);
  assert.equal(
    await editor.getByLabel("Paste CSV", { exact: true }).isEnabled(),
    true,
  );
  check(
    "Preview has immediate local busy feedback without freezing unrelated controls",
  );
  releasePreview();
  await editor.locator(".credit-batch-column-editor").first().waitFor();
  assert.equal(
    await editor.locator(".credit-batch-samples tbody tr").count(),
    5,
  );
  assert.equal(
    (await editor.locator(".credit-batch-samples").innerText()).includes(
      "SYNTHETIC-RAW",
    ),
    false,
  );
  assert.equal(await editor.locator('textarea[name="creditsCSV"]').count(), 0);
  check(
    "Preview masks every value, limits samples to five and removes raw CSV from the review DOM",
  );
  await editor
    .getByLabel(`Heading for ${headings[0]}`, { exact: true })
    .fill(finalHeading);
  for (let i = 0; i < 2; i++)
    await editor
      .getByLabel(`Instructions for ${headings[i]}`, { exact: true })
      .fill(instructions[i]);
  assert.ok(
    (
      await editor.locator(".credit-batch-markdown-preview").first().innerText()
    ).includes("Redeem Alpha"),
  );
  await click(editor.getByRole("button", { name: "Review", exact: true }));
  await editor
    .getByRole("button", { name: "Publish credits", exact: true })
    .waitFor();
  assert.equal(
    await editor
      .locator(".credit-batch-column-editor textarea")
      .first()
      .getAttribute("readonly"),
    "",
  );
  check(
    "Markdown renders safely and edited columns receive a final server review",
  );
  await click(
    editor.getByRole("button", { name: "Edit instructions", exact: true }),
  );
  assert.equal(
    await editor
      .getByRole("button", { name: "Publish credits", exact: true })
      .count(),
    0,
  );
  await editor
    .locator(".credit-batch-column-editor textarea")
    .first()
    .fill(instructions[0] + "\nFinal reviewed steps.");
  await click(editor.getByRole("button", { name: "Review", exact: true }));
  await editor
    .getByRole("button", { name: "Publish credits", exact: true })
    .waitFor();
  check(
    "Editing invalidates publish readiness until the changed instructions are reviewed again",
  );
  await snapshot("reviewed-columns-masked");
  await click(
    editor.getByRole("button", { name: "Publish credits", exact: true }),
  );
  await click(
    page
      .locator("dialog[open]")
      .getByRole("button", { name: "Cancel", exact: true }),
  );
  assert.equal(counts["publish-credit-batch"], 0);
  check("Cancel publication creates no publish request");
  await click(
    editor.getByRole("button", { name: "Publish credits", exact: true }),
  );
  await confirm();
  await page
    .locator(".credit-batch-existing")
    .filter({ hasText: finalHeading })
    .waitFor();
  const published = await view();
  assert.equal(published.status, 200);
  assert.match(published.cache, /no-store/);
  assert.equal(JSON.stringify(published.data).includes("SYNTHETIC-RAW"), false);
  const batch = published.data.creditBatches.find((item) =>
    item.columns.some((column) => column.heading === finalHeading),
  );
  assert.ok(batch);
  batchId = batch.id;
  columnId = batch.columns.find((column) => column.heading === finalHeading).id;
  assert.equal(batch.columns.length, 2);
  assert.ok(batch.columns.every((column) => column.inventory === 8));
  assert.equal(
    batch.columns.find((column) => column.id === columnId).instructions,
    instructions[0] + "\nFinal reviewed steps.",
  );
  check(
    "Publication persists exact headings and reviewed instructions without returning raw inventory",
  );
  await snapshot("published-columns");
  const card = page
    .locator(".credit-batch-existing")
    .filter({ hasText: finalHeading });
  await click(
    card.getByRole("button", {
      name: `Delete column: ${finalHeading}`,
      exact: true,
    }),
  );
  await click(
    page
      .locator("dialog[open]")
      .getByRole("button", { name: "Cancel", exact: true }),
  );
  assert.equal(counts["delete-credit-column"], 0);
  await click(
    card.getByRole("button", {
      name: `Delete column: ${finalHeading}`,
      exact: true,
    }),
  );
  await confirm();
  await page.waitForFunction(
    (heading) =>
      ![...document.querySelectorAll(".credit-batch-existing-column h4")].some(
        (node) => node.textContent === heading,
      ),
    finalHeading,
  );
  const oneColumn = (await view()).data.creditBatches.find(
    (item) => item.id === batchId,
  );
  assert.equal(oneColumn.columns.length, 1);
  assert.equal(oneColumn.columns[0].heading, headings[1]);
  check(
    "Exact column deletion preserves the other column and its instructions",
  );
  await click(
    page.getByRole("button", {
      name: `Delete credit batch: ${batchId}`,
      exact: true,
    }),
  );
  await confirm();
  await page.waitForFunction(
    (id) =>
      ![...document.querySelectorAll(".credit-batch-delete button")].some(
        (node) =>
          node.getAttribute("aria-label") === `Delete credit batch: ${id}`,
      ),
    batchId,
  );
  assert.equal(
    (await view()).data.creditBatches.some((item) => item.id === batchId),
    false,
  );
  check(
    "Exact batch deletion removes the remaining column from the active projection",
  );
  assert.equal(report.errors.length, 0, JSON.stringify(report.errors));
  assert.equal(report.blocked.length, 0, JSON.stringify(report.blocked));
} catch (error) {
  report.failure = error.stack;
  process.exitCode = 1;
  await snapshot("failure").catch(() => {});
} finally {
  releasePreview();
  await context.close();
  await browser.close();
  report.browserClosed = true;
  assert.equal(hash(), manifest.worker);
  persist();
}
console.log(
  JSON.stringify(
    {
      report: join(output, "report.json"),
      checks: report.checks.length,
      actionCounts: counts,
      screenshots: report.screenshots.length,
      failure: report.failure,
      browserClosed: report.browserClosed,
    },
    null,
    2,
  ),
);
