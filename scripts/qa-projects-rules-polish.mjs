import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { chromium } from "@playwright/test";
const origin = "http://localhost:3005",
  out = "evidence/projects-rules-polish";
mkdirSync(out, { recursive: true });
const report = {
  source: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  checks: [],
  screenshots: [],
  errors: [],
  syntheticOnly: true,
};
const b = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  chromiumSandbox: false,
  headless: true,
});
try {
  for (const v of [
    { width: 1440, height: 900 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
    { width: 390, height: 480 },
  ]) {
    const c = await b.newContext({
      viewport: v,
      reducedMotion: "reduce",
      hasTouch: v.width < 500,
      isMobile: v.width < 500,
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
    await c.route("**/*", (r) =>
      new URL(r.request().url()).origin === origin &&
      ["GET", "HEAD"].includes(r.request().method())
        ? r.continue()
        : r.abort("blockedbyclient"),
    );
    const p = await c.newPage();
    p.on("pageerror", (e) => report.errors.push(e.message));
    const activate = async (l) =>
      v.width < 500 ? l.tap() : (await l.focus(), await l.press("Enter"));
    const shot = async (n) => {
      const f = out + "/" + n + "-" + v.width + "x" + v.height + ".png";
      await p.screenshot({
        path: f,
        fullPage: false,
        style: "nextjs-portal{visibility:hidden!important}",
      });
      report.screenshots.push(f);
    };
    await p.goto(origin + "/projects", {
      waitUntil: "networkidle",
      timeout: 60000,
    });
    await p.locator('.projects-v6[data-hydrated="true"]').waitFor();
    await p
      .getByRole("searchbox", { name: "Search projects" })
      .fill("zz-no-matching-project-zz");
    await p.getByRole("heading", { name: "No matching projects" }).waitFor();
    assert.equal(await p.locator(".project-pagination").count(), 0);
    await shot("projects-no-matches");
    await activate(p.getByRole("button", { name: "Clear search" }));
    await p.locator(".project-list > li").first().waitFor();
    await p.goto(origin + "/dashboard#project", { waitUntil: "networkidle" });
    await activate(p.getByRole("tab", { name: "Project", exact: true }));
    const opener = p.getByRole("button", { name: "Versions 2/3", exact: true });
    await activate(opener);
    await p
      .locator(".project-history-dialog[open] .history-version")
      .first()
      .waitFor();
    const close = p.getByRole("button", {
      name: "Close committed history",
      exact: true,
    });
    const a = await p
        .getByRole("heading", { name: "Committed history", exact: true })
        .boundingBox(),
      d = await close.boundingBox();
    assert.ok(Math.abs(a.y - d.y) < 15, "close control stays beside title");
    await shot("committed-history");
    await activate(close);
    await p.locator(".project-history-dialog").waitFor({ state: "detached" });
    await p.waitForTimeout(150);
    assert.equal(
      await opener.evaluate((n) => n === document.activeElement),
      true,
    );
    report.checks.push({
      viewport: v,
      name: "Empty search hides inactive pagination; compact history close works and restores focus",
      passed: true,
    });
    await c.close();
    writeFileSync(out + "/report.json", JSON.stringify(report, null, 2));
  }
  assert.equal(report.errors.length, 0);
} catch (error) {
  report.failure = String(error.stack || error);
  process.exitCode = 1;
} finally {
  await b.close();
  writeFileSync(out + "/report.json", JSON.stringify(report, null, 2));
}
console.log(JSON.stringify(report, null, 2));
