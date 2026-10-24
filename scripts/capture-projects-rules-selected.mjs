import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
const out = "evidence/projects-rules-selected",
  origin = "http://localhost:3005";
mkdirSync(out, { recursive: true });
const report = {
  source: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  syntheticOnly: true,
  screenshots: [],
  errors: [],
};
const b = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  chromiumSandbox: false,
  headless: true,
});
try {
  for (const v of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    const c = await b.newContext({ viewport: v, reducedMotion: "reduce" });
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
        : r.abort(),
    );
    const p = await c.newPage();
    p.on("pageerror", (e) => report.errors.push(e.message));
    for (const [name, path] of [
      ["rules", "/rules"],
      ["projects", "/projects"],
      ["project-detail", "/projects/synthetic-alice"],
      ["leaderboard", "/leaderboard"],
    ]) {
      await p.goto(origin + path, { waitUntil: "networkidle", timeout: 60000 });
      if (name !== "rules")
        await p.locator('.projects-v6[data-hydrated="true"]').waitFor();
      await p.evaluate(() => document.fonts.ready);
      const f = out + "/" + name + "-" + v.width + "x" + v.height + ".png";
      await p.screenshot({
        path: f,
        fullPage: false,
        animations: "disabled",
        style: "nextjs-portal{visibility:hidden!important}",
      });
      report.screenshots.push({ path: f, viewport: v, route: path });
      writeFileSync(out + "/report.json", JSON.stringify(report, null, 2));
    }
    await c.close();
  }
} finally {
  await b.close();
  writeFileSync(out + "/report.json", JSON.stringify(report, null, 2));
}
console.log(JSON.stringify(report, null, 2));
