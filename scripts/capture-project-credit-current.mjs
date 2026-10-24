import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const root = "/workspace/dddhack-portal";
const origin = "http://localhost:3000";
const out = "evidence/project-credit-current";
const fingerprint = () =>
  Object.fromEntries(
    [
      "app/portal.tsx",
      "app/projects-rules-experience.css",
      "app/dashboard-v6.css",
      "app/team-discovery-experience.css",
      "app/redesign.css",
    ].map((file) => [
      file,
      createHash("sha256")
        .update(readFileSync(root + "/" + file))
        .digest("hex"),
    ]),
  );
mkdirSync(out, { recursive: true });
const report = {
  source: execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim(),
  origin,
  fixtureBackend: 8821,
  syntheticOnly: true,
  fingerprint: fingerprint(),
  screenshots: [],
  errors: [],
  writes: [],
};
const save = () =>
  writeFileSync(out + "/report.json", JSON.stringify(report, null, 2));
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  chromiumSandbox: false,
  headless: true,
});
try {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    const c = await browser.newContext({
      viewport,
      reducedMotion: "reduce",
      hasTouch: viewport.width < 500,
      isMobile: viewport.width < 500,
    });
    await c.addCookies([
      {
        name: "portal_local_fixture",
        value: "alice",
        url: origin,
        httpOnly: true,
        sameSite: "Strict",
      },
    ]);
    await c.route("**/*", (route) =>
      new URL(route.request().url()).origin === origin &&
      ["GET", "HEAD"].includes(route.request().method())
        ? route.continue()
        : route.abort(),
    );
    const p = await c.newPage();
    p.on("pageerror", (error) => {
      report.errors.push(error.message);
      save();
    });
    const shot = async (name) => {
      await p.evaluate(() => {
        window.scrollTo(0, 0);
        return document.fonts.ready;
      });
      for (const fullPage of [false, true]) {
        const path = `${out}/${name}-${viewport.width}x${viewport.height}${fullPage ? "-full" : ""}.png`;
        await p.screenshot({
          path,
          fullPage,
          animations: "disabled",
          style: "nextjs-portal{visibility:hidden!important}",
        });
        report.screenshots.push({
          path,
          viewport,
          fullPage,
          sha256: createHash("sha256").update(readFileSync(path)).digest("hex"),
        });
        save();
      }
    };
    await p.goto(origin + "/dashboard#project", {
      waitUntil: "networkidle",
      timeout: 60000,
    });
    await p.getByRole("tab", { name: "Project", exact: true }).click();
    await p
      .getByRole("button", { name: "Update project", exact: true })
      .click();
    await p.locator(".project-editor:not([inert])").waitFor();
    for (let step = 1; step <= 3; step++) {
      await shot("submission-step" + step);
      assert.equal(
        await p.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
      if (step < 3)
        await p.getByRole("button", { name: "Next", exact: true }).click();
    }
    await p.goto(origin + "/dashboard#credits", { waitUntil: "networkidle" });
    await p.getByRole("tab", { name: "Credits", exact: true }).click();
    await p.locator(".dashboard-credit").first().waitFor();
    assert.equal(
      await p.locator('[aria-label="Allocation hidden"]').count(),
      1,
    );
    assert.ok(
      !(await p.locator(".dashboard-credit").innerText()).includes(
        "SYNTHETIC-NOT-REDEEMABLE-VOUCHER",
      ),
    );
    await shot("credits-masked");
    await c.close();
  }
  assert.deepEqual(
    fingerprint(),
    report.fingerprint,
    "runtime source files stay unchanged throughout capture",
  );
  assert.equal(report.errors.length, 0);
} catch (error) {
  report.failure = String(error.stack || error);
  process.exitCode = 1;
} finally {
  report.fingerprintAtEnd = fingerprint();
  await browser.close();
  save();
}
console.log(JSON.stringify(report, null, 2));
