import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs";
import cp from "node:child_process";
const out = "/tmp/ddd-shared-width/supplement";
fs.mkdirSync(out, { recursive: true });
const report = {
  source: cp
    .execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" })
    .trim(),
  GETOnly: true,
  checks: [],
  captures: [],
  metrics: [],
  errors: [],
};
const save = () =>
  fs.writeFileSync(out + "/report.json", JSON.stringify(report, null, 2));
const check = (n, v) => {
  assert.ok(v, n);
  report.checks.push(n);
  save();
};
const origin = "http://localhost:3025";
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox"],
});
async function shot(p, n) {
  await p.screenshot({ path: out + "/" + n + ".png" });
  report.captures.push(out + "/" + n + ".png");
  save();
}
async function context(width, height) {
  const c = await browser.newContext({
    viewport: { width, height },
    hasTouch: width < 741,
    isMobile: width < 741,
    deviceScaleFactor: 1,
  });
  await c.addCookies([
    { name: "portal_local_fixture", value: "alice", url: origin },
  ]);
  await c.route("**/*", (r) =>
    new URL(r.request().url()).origin === origin &&
    ["GET", "HEAD"].includes(r.request().method())
      ? r.continue()
      : r.abort(),
  );
  const p = await c.newPage();
  p.on("pageerror", (e) => report.errors.push(e.message));
  return { c, p };
}
async function go(p, r) {
  await p.goto(origin + r, { waitUntil: "networkidle", timeout: 60000 });
  await p.waitForFunction(
    () => document.querySelector(".app-shell")?.dataset.hydrated === "true",
  );
  await p.evaluate(() => document.fonts.ready);
}
try {
  for (const [w, h] of [
    [1440, 900],
    [390, 844],
  ]) {
    const { c, p } = await context(w, h);
    await go(p, "/dashboard");
    await p.getByRole("tab", { name: "Project", exact: true }).click();
    await p
      .getByRole("button", { name: "Update project", exact: true })
      .click();
    await p.locator(".submission-v6").waitFor();
    const b = await p.locator(".submission-v6").boundingBox();
    report.metrics.push({ w, h, editor: b });
    check(
      w + " real editor retains960px maximum and no overflow",
      b.width <= 960.5 &&
        (await p.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        )),
    );
    await shot(p, w + "-actual-project-editor");
    await c.close();
  }
  const { c, p } = await context(320, 480);
  await go(p, "/discover/teams");
  await p.locator(".discover-team-open").first().tap();
  await p.locator("dialog[open]").waitFor();
  const last = p.locator(".discover-team-members li").last();
  await last.scrollIntoViewIfNeeded();
  check(
    "short dialog last current member readable by natural internal scroll",
    await last.evaluate((e) => {
      const r = e.getBoundingClientRect(),
        b = e.closest(".discover-team-sheet-body").getBoundingClientRect();
      return r.top >= b.top - 0.5 && r.bottom <= b.bottom + 0.5;
    }),
  );
  await shot(p, "320-short-last-team-member");
  await p.keyboard.press("Escape");
  await c.close();
  const normal = await context(390, 844);
  await go(normal.p, "/");
  await normal.p.waitForTimeout(1800);
  check(
    "normal motion resized lower dot stage is below CTA and nonblocking",
    await normal.p.locator(".primary-cta").evaluate((e) => {
      const b = e.getBoundingClientRect(),
        stage = document
          .querySelector(".home-motion-strip")
          .getBoundingClientRect();
      return (
        stage.top >= b.bottom &&
        e.contains(
          document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2),
        )
      );
    }),
  );
  await shot(normal.p, "390-normal-motion-settled-home");
  await normal.c.close();
  check("no supplement page exceptions", !report.errors.length);
} catch (e) {
  report.failure = String(e.stack || e);
  save();
  process.exitCode = 1;
} finally {
  await browser.close();
  save();
}
if (!report.failure) {
  const z = await chromium.launchPersistentContext(
    "/tmp/ddd-shared-width/zoom-profile",
    {
      executablePath: "/usr/bin/chromium",
      headless: true,
      viewport: null,
      args: ["--no-sandbox", "--window-size=1440,900"],
    },
  );
  try {
    const settings = await z.newPage();
    await settings.goto("chrome://settings/appearance");
    await settings.evaluate(() => {
      chrome.settingsPrivate.setDefaultZoom(2, () => {});
      return true;
    });
    const page = await z.newPage();
    await z.addCookies([
      { name: "portal_local_fixture", value: "alice", url: origin },
    ]);
    await page.goto(origin + "/discover/teams", {
      waitUntil: "networkidle",
      timeout: 60000,
    });
    await page.waitForFunction(
      () => devicePixelRatio === 2 && innerWidth === 720,
    );
    await page.waitForFunction(
      () => document.querySelector(".app-shell")?.dataset.hydrated === "true",
    );
    await page.evaluate(() => document.fonts.ready);
    const metrics = await page.evaluate(() => {
      const m = document.querySelector(".main").getBoundingClientRect(),
        h = document
          .querySelector(".navigation-header")
          .getBoundingClientRect();
      return {
        innerWidth,
        innerHeight,
        outerWidth,
        outerHeight,
        DPR: devicePixelRatio,
        visualScale: visualViewport.scale,
        visualHeight: visualViewport.height,
        mainWidth: m.width,
        headerWidth: h.width,
        documentWidth: document.documentElement.scrollWidth,
      };
    });
    report.metrics.push({ nativeZoom200: metrics });
    check(
      "native browser200% main fills header canvas without overflow",
      metrics.DPR === 2 &&
        metrics.visualScale === 1 &&
        Math.abs(metrics.mainWidth - metrics.headerWidth) < 1 &&
        metrics.documentWidth <= metrics.innerWidth,
    );
    const cdp = await z.newCDPSession(page);
    const { data } = await cdp.send("Page.captureScreenshot", {
      format: "png",
      fromSurface: true,
      captureBeyondViewport: false,
    });
    const file = out + "/native-200-discover-teams.png";
    fs.writeFileSync(file, Buffer.from(data, "base64"));
    report.captures.push(file);
    save();
  } catch (e) {
    report.zoomFailure = String(e.stack || e);
    save();
    process.exitCode = 1;
  } finally {
    await z.close();
  }
}
report.browserClosed = true;
save();
console.log(
  JSON.stringify({
    checks: report.checks.length,
    captures: report.captures.length,
    failure: report.failure,
    zoomFailure: report.zoomFailure,
    errors: report.errors,
    browserClosed: true,
  }),
);
