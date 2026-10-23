// Actual disposable local Dispatch role projections, read-only navigation only.
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
const origin = process.env.MOBILE_NAV_ORIGIN || "http://127.0.0.1:4181";
assert.equal(new URL(origin).hostname, "127.0.0.1");
const owner = readFileSync("lib/identity.ts", "utf8").match(
  /OWNER_EMAIL = "([^"]+)"/,
)[1];
const cases = [
  ["anonymous", "/", "Sign in"],
  ["alice", "/dashboard", "Dashboard"],
  ["admin", "/admin/participants", "Participants"],
  ["owner", "/admin/participants", "Logs"],
  ["judge", "/dashboard", "Assigned projects"],
  ["mentor", "/dashboard", "Assigned projects"],
  ["volunteer", "/dashboard", "Administration"],
  ["pending", "/profile", "Your profile"],
  ["stranger", "/dashboard", "Sign in"],
];
const out = resolve("evidence/v7-mobile-navigation");
mkdirSync(out, { recursive: true });
const report = {
  source: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  worker: createHash("sha256")
    .update(readFileSync("dist/server/index.js"))
    .digest("hex"),
  sandbox: true,
  syntheticOnly: true,
  readOnly: true,
  checks: [],
  captures: [],
  limitations: [
    "Loopback Dispatch fixtures only; no production authentication or physical-device claim.",
  ],
};
let browser;
try {
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true,
    chromiumSandbox: true,
  });
  for (const [actor, path, label] of cases) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
      reducedMotion: "reduce",
      serviceWorkers: "block",
    });
    await context.route("**/*", (route) => {
      const request = route.request(),
        url = new URL(request.url());
      if (url.origin !== origin || !["GET", "HEAD"].includes(request.method()))
        return route.abort();
      const headers = { ...request.headers() };
      if (actor !== "anonymous")
        Object.assign(headers, {
          "oai-authenticated-user-id": "fake_" + actor,
          "oai-authenticated-user-email":
            actor === "owner" ? owner : actor + "@portal.test",
          "oai-authenticated-user-full-name": "Synthetic " + actor,
        });
      return route.continue({ headers });
    });
    const page = await context.newPage();
    const loaded = page.waitForResponse(
      (r) => new URL(r.url()).pathname === "/api/portal",
    );
    await page.goto(origin + path);
    const apiResponse = await loaded;
    if (actor === "stranger") {
      assert.equal(apiResponse.status(), 403);
      await page
        .getByRole("button", { name: "Sign out / switch account", exact: true })
        .waitFor();
    } else assert.equal(apiResponse.status(), 200);
    await page.evaluate(() => document.fonts.ready);
    const trigger = page.locator(
      actor === "anonymous" ? ".public-menu" : ".mobile-header > button",
    );
    await trigger.tap();
    const dialog = page.locator("#mobile-navigation");
    await dialog.waitFor({ state: "visible" });
    assert.equal(
      (await dialog.getByRole("link", { name: label, exact: true }).count()) +
        (await dialog
          .getByRole("button", { name: label, exact: true })
          .count()),
      1,
    );
    const links = await dialog
      .locator("nav > a,nav > button")
      .allTextContents();
    const rect = await dialog.boundingBox();
    assert.equal(rect.width, 390);
    assert.equal(rect.height, 844);
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });
    assert.equal(
      await trigger.evaluate((e) => e === document.activeElement),
      true,
    );
    await trigger.tap();
    await dialog
      .getByRole("button", { name: "Close navigation", exact: true })
      .tap();
    await dialog.waitFor({ state: "hidden" });
    if (["admin", "pending"].includes(actor)) {
      await trigger.tap();
      const image = resolve(
        out,
        `navigation-${actor}-actual-route-390x844.png`,
      );
      await page.screenshot({ path: image, animations: "disabled" });
      report.captures.push(image);
    }
    report.checks.push({
      actor,
      path,
      links,
      touchClose: true,
      escapeFocusRestore: true,
    });
    console.log("PASS actual role " + actor);
    await context.close();
  }
} catch (error) {
  report.failure = error.stack || String(error);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  writeFileSync(
    resolve(out, "actual-role-report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      checks: report.checks.length,
      captures: report.captures.length,
      failure: report.failure,
    }),
  );
}
