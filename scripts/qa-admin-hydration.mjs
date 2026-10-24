// A JavaScript-disabled browser proves that native fallback cannot submit private fields.
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
const origin = process.env.ADMIN_QA_ORIGIN || "http://localhost:3013";
const url = new URL(origin);
assert(
  ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) &&
    url.protocol === "http:" &&
    url.origin === origin,
);
const output =
  process.env.ADMIN_QA_OUTPUT || "evidence/redesign-admin-hydration";
mkdirSync(output, { recursive: true });
const report = {
  source: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  syntheticOnly: true,
  javascriptEnabled: false,
  browserSandbox: false,
  checks: [],
  requests: [],
  errors: [],
};
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  headless: true,
  chromiumSandbox: false,
});
const context = await browser.newContext({
  javaScriptEnabled: false,
  viewport: { width: 390, height: 844 },
  serviceWorkers: "block",
});
await context.addCookies([
  { name: "portal_local_fixture", value: "owner", url: origin },
]);
await context.route("**/*", (route) => {
  const r = route.request(),
    u = new URL(r.url());
  if (u.origin !== origin || !["GET", "HEAD"].includes(r.method())) {
    report.errors.push({ blocked: r.method(), path: u.pathname });
    return route.abort("blockedbyclient");
  }
  return route.continue();
});
const page = await context.newPage();
page.on("request", (r) => {
  if (r.isNavigationRequest())
    report.requests.push({ method: r.method(), url: r.url() });
});
try {
  for (const path of [
    "/admin/participants",
    "/admin/credits",
    "/admin/settings",
    "/admin/submissions/synthetic-alice",
  ]) {
    await page.goto(origin + path, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    const forms = await page.locator("form").evaluateAll((nodes) =>
      nodes.map((form) => ({
        method: form.method,
        inert: form.inert,
        hydrated: form.dataset.hydrated,
      })),
    );
    assert(forms.length > 0, path + " rendered forms");
    assert(
      forms.every(
        (f) => f.method === "post" && f.inert && f.hydrated === "false",
      ),
      path + " forms guarded",
    );
    if (path === "/admin/credits") {
      const upload = page.locator(".credit-batch-new-upload");
      if ((await upload.getAttribute("open")) === null)
        await upload.locator(":scope > summary").click();
      const field = page.locator('textarea[name="creditsCSV"]');
      const original = await field.inputValue();
      await field.click({ force: true });
      await page.keyboard.type("SYNTHETIC-PREHYDRATION-FIELD");
      await page.keyboard.press("Enter");
      assert.equal(
        await field.inputValue(),
        original,
        "inert private CSV field cannot receive native typing",
      );
    }
    for (let index = 0; index < 16; index++) await page.keyboard.press("Tab");
    assert.equal(
      await page.evaluate(
        () => !!document.activeElement?.closest('[data-hydrated="false"]'),
      ),
      false,
      path + " protected fields outside tab order",
    );
    assert.equal(
      new URL(page.url()).search,
      "",
      path + " no private query parameters",
    );
    report.checks.push({ path, forms: forms.length, passed: true });
  }
} catch (error) {
  report.errors.push(String(error.stack || error));
}
await browser.close();
writeFileSync(output + "/report.json", JSON.stringify(report, null, 2) + "\n");
console.log(
  JSON.stringify({
    checks: report.checks.length,
    errors: report.errors.length,
  }),
);
if (report.errors.length) process.exitCode = 1;
