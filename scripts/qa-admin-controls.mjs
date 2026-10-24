import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
const origin = process.env.ADMIN_QA_ORIGIN || "http://localhost:3013",
  output =
    process.env.ADMIN_QA_OUTPUT || "evidence/redesign-admin-controls-final";
const local = new URL(origin);
assert(
  ["localhost", "127.0.0.1", "[::1]"].includes(local.hostname) &&
    local.protocol === "http:" &&
    local.origin === origin,
);
mkdirSync(output, { recursive: true });
const report = {
  source: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  syntheticOnly: true,
  touchEmulation: true,
  physicalDevice: false,
  browserSandbox: false,
  checks: [],
  previews: [],
  screenshots: [],
  errors: [],
};
const save = () =>
  writeFileSync(output + "/report.json", JSON.stringify(report, null, 2));
const check = (name) => {
  report.checks.push({ name, passed: true });
  save();
};
const b = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  headless: true,
  chromiumSandbox: false,
});
const c = await b.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  reducedMotion: "reduce",
  serviceWorkers: "block",
});
await c.addCookies([
  { name: "portal_local_fixture", value: "owner", url: origin },
]);
await c.route("**/*", (route) => {
  const r = route.request(),
    u = new URL(r.url());
  if (u.origin !== origin) return route.abort("blockedbyclient");
  if (u.pathname.startsWith("/__nextjs_")) return route.continue();
  if (!["GET", "HEAD"].includes(r.method())) {
    let body;
    try {
      body = r.postDataJSON();
    } catch {}
    if (!["preview-import", "preview-credit-batch"].includes(body?.action)) {
      report.errors.push({ blockedAction: body?.action, path: u.pathname });
      save();
      return route.abort("blockedbyclient");
    }
    report.previews.push({ action: body.action });
    save();
  }
  return route.continue();
});
const p = await c.newPage();
p.setDefaultTimeout(15000);
p.on("pageerror", (e) => report.errors.push(e.message));
async function goto(path) {
  await p.goto(origin + path, { waitUntil: "networkidle", timeout: 60000 });
  await p.waitForFunction(() =>
    [...document.querySelectorAll("form[data-hydrated]")].every(
      (f) => f.dataset.hydrated === "true",
    ),
  );
}
async function capture(name) {
  const fullPage = (await p.locator("dialog[open]").count()) === 0;
  if (fullPage) await p.evaluate(() => scrollTo(0, 0));
  const file = output + "/" + name + ".png";
  await p.screenshot({
    path: file,
    fullPage,
    animations: "disabled",
    caret: "initial",
    style: "nextjs-portal{visibility:hidden!important}",
  });
  report.screenshots.push({
    path: file,
    viewport: p.viewportSize(),
    fullPage,
    inspected: false,
  });
  save();
}
const dialog = () => p.locator(".confirmation-dialog[open]");
async function cancel() {
  await dialog().waitFor();
  await dialog().getByRole("button", { name: "Cancel", exact: true }).tap();
  await dialog().waitFor({ state: "hidden" });
}
try {
  await goto("/admin/participants");
  const before = (
    await (
      await c.request.get(origin + "/api/portal?view=/admin/participants")
    ).json()
  ).items.length;
  await p.getByRole("button", { name: "Add participants", exact: true }).tap();
  const imp = p.getByRole("dialog", { name: "Add participants", exact: true });
  await imp.getByRole("button", { name: "Email list", exact: true }).tap();
  await imp
    .getByRole("textbox", { name: "Email list", exact: true })
    .fill("synthetic-list-one@portal.test;synthetic-list-two@portal.test");
  await imp.getByRole("button", { name: "Add", exact: true }).tap();
  await dialog().waitFor();
  await capture("import-email-list-confirmation");
  await cancel();
  check("touch email-list preview and nested cancellation");
  await imp.getByRole("button", { name: "CSV", exact: true }).tap();
  const file = imp.getByLabel("CSV with header row", { exact: true });
  const chooserPromise = p.waitForEvent("filechooser");
  await file.tap();
  const chooser = await chooserPromise;
  await chooser.setFiles({
    name: "synthetic-participants.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("email\nsynthetic-file-only@portal.test\n"),
  });
  await expect(
    imp.getByRole("textbox", { name: "Paste CSV with header row" }),
  ).toHaveValue("email\nsynthetic-file-only@portal.test\n");
  await imp.getByRole("button", { name: "Add", exact: true }).tap();
  await dialog().waitFor();
  await capture("import-csv-confirmation");
  await cancel();
  check("native CSV chooser, file read, preview and cancellation");
  await imp
    .getByRole("textbox", { name: "Paste CSV with header row" })
    .fill('email\n"broken');
  await imp.getByRole("button", { name: "Add", exact: true }).tap();
  await expect(imp.getByRole("alert")).toContainText("Check CSV quotes");
  await capture("import-csv-error");
  await imp
    .getByRole("button", { name: "Close add participants", exact: true })
    .tap();
  assert.equal(
    (
      await (
        await c.request.get(origin + "/api/portal?view=/admin/participants")
      ).json()
    ).items.length,
    before,
  );
  check("invalid CSV is actionable and cancelled imports add no participants");
  await p.getByRole("searchbox").fill("Alice");
  const downloadPromise = p.waitForEvent("download");
  await p
    .getByRole("link", {
      name: "Export filtered participants (1)",
      exact: true,
    })
    .tap();
  const download = await downloadPromise;
  assert.equal(download.suggestedFilename().endsWith(".csv"), true);
  check("filtered participant export opens native CSV download");
  await goto("/admin/credits");
  const upload = p.locator(".credit-batch-new-upload");
  if ((await upload.getAttribute("open")) === null)
    await upload.locator(":scope > summary").tap();
  await p
    .getByRole("textbox", { name: "Paste CSV", exact: true })
    .fill(
      "Synthetic Alpha,Synthetic Beta\nSYNTHETIC-DUPLICATE-ALPHA,SYNTHETIC-DUPLICATE-BETA",
    );
  await p.getByRole("button", { name: "Add credits", exact: true }).tap();
  await expect(p.locator(".credit-batch-editor .error-message")).toContainText(
    "Rename it in the CSV",
  );
  await capture("credit-existing-heading-error");
  check("duplicate credit heading keeps refusal with actionable recovery");
  const uploadChooserPromise = p.waitForEvent("filechooser");
  await p.getByRole("button", { name: "Upload CSV", exact: true }).tap();
  const creditChooser = await uploadChooserPromise;
  const csv =
    "Synthetic Gamma,Synthetic Delta\nSYNTHETIC-TOUCH-GAMMA,SYNTHETIC-TOUCH-DELTA";
  await creditChooser.setFiles({
    name: "synthetic-credits.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await expect(
    p.getByRole("textbox", { name: "Paste CSV", exact: true }),
  ).toHaveValue(csv);
  await p.getByRole("button", { name: "Add credits", exact: true }).tap();
  const heading = p.getByRole("textbox", {
    name: "Heading for Synthetic Gamma",
    exact: true,
  });
  await heading.focus();
  await p.keyboard.press("Tab");
  await expect(
    p.getByRole("textbox", {
      name: "Instructions for Synthetic Gamma",
      exact: true,
    }),
  ).toBeFocused();
  await p.keyboard.type("Use your own synthetic credit.");
  await p
    .getByRole("textbox", {
      name: "Instructions for Synthetic Delta",
      exact: true,
    })
    .fill("Open the console and apply your own synthetic code.");
  await capture("credit-file-column-editor");
  await p.getByRole("button", { name: "Publish credits", exact: true }).tap();
  await dialog().waitFor();
  await capture("credit-publish-confirmation");
  await p.keyboard.press("Escape");
  await dialog().waitFor({ state: "hidden" });
  await p.getByRole("button", { name: "Change CSV", exact: true }).tap();
  await expect(
    p.getByRole("textbox", { name: "Paste CSV", exact: true }),
  ).toHaveValue(csv);
  check(
    "touch credit file upload, keyboard fields, publish cancellation and source recovery",
  );
  await p
    .getByRole("button", {
      name: "Delete column: Synthetic Alpha",
      exact: true,
    })
    .tap();
  await dialog().waitFor();
  await capture("credit-column-delete-confirmation");
  await p.waitForTimeout(50);
  await p.goBack();
  await dialog().waitFor({ state: "hidden" });
  assert.equal(new URL(p.url()).pathname, "/admin/credits");
  check("credit column delete browser Back cancels without navigation");
  const batchButton = p.getByRole("button", { name: /Delete credit batch:/ });
  await batchButton.tap();
  await dialog().waitFor();
  await p.keyboard.press("Escape");
  await dialog().waitFor({ state: "hidden" });
  assert.equal(
    (
      await (
        await c.request.get(origin + "/api/portal?view=/admin/credits")
      ).json()
    ).creditBatches.length,
    1,
  );
  check("credit batch delete Escape preserves published batch");
  await goto("/admin/submissions");
  const record = p
    .locator(".admin-submission-records > li")
    .filter({ hasText: "Small Wonder" });
  await record.locator(".admin-submission-management > summary").tap();
  const form = record.locator(".admin-project-action");
  await form
    .getByRole("combobox", { name: "Target", exact: true })
    .selectOption("submission");
  await form
    .getByRole("combobox", { name: "Version", exact: true })
    .selectOption("visual_alice_v2");
  await form.getByRole("button", { name: /Remove submission:/ }).tap();
  await dialog().waitFor();
  await capture("submission-removal-confirmation");
  await cancel();
  await form
    .getByRole("combobox", { name: "Target", exact: true })
    .selectOption("both");
  await form
    .getByRole("button", { name: /Remove project and submission:/ })
    .tap();
  await dialog().waitFor();
  await p.keyboard.press("Escape");
  await dialog().waitFor({ state: "hidden" });
  await form
    .getByRole("combobox", { name: "Action", exact: true })
    .selectOption("restore");
  await capture("submission-version-controls");
  check("project/submission target controls, version picker and cancellations");
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
    { width: 390, height: 480 },
  ]) {
    await p.setViewportSize(viewport);
    await goto("/admin/credits");
    await capture(
      "credits-published-" + viewport.width + "x" + viewport.height,
    );
    await goto("/admin/submissions");
    const item = p
      .locator(".admin-submission-records > li")
      .filter({ hasText: "Small Wonder" });
    await item.locator(".admin-submission-management > summary").click();
    await capture(
      "project-management-" + viewport.width + "x" + viewport.height,
    );
    assert.equal(
      await p.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    check("final staff layout fit " + viewport.width + "x" + viewport.height);
  }
  const restricted = await b.newContext();
  await restricted.addCookies([
    { name: "portal_local_fixture", value: "admin", url: origin },
  ]);
  const denied = await restricted.request.get(
    origin + "/api/portal?view=/admin/logs",
  );
  assert.equal(denied.status(), 403);
  const deniedBody = await denied.json();
  assert.equal("items" in deniedBody, false);
  await restricted.close();
  check("logs remain owner-only without returned records");
} catch (error) {
  report.errors.push(String(error.stack || error));
  save();
}
await b.close();
save();
console.log(
  JSON.stringify({
    checks: report.checks.length,
    previews: report.previews.length,
    captures: report.screenshots.length,
    errors: report.errors.length,
  }),
);
if (report.errors.length) process.exitCode = 1;
