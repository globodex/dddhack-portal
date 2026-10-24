// Actual Chromium lifecycle checks; hidden-state events are explicitly controlled.
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "@playwright/test";
assert.ok(process.env.MIGRATION_MANIFEST);
const manifest = JSON.parse(
  readFileSync(process.env.MIGRATION_MANIFEST, "utf8"),
);
assert.equal(manifest.syntheticOnly, true);
assert.equal(manifest.disposable, true);
const origin = new URL(manifest.origin);
assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(origin.hostname));
const output = resolve(
  process.env.MIGRATION_OUTPUT || `evidence/migration/${manifest.label}-motion`,
);
mkdirSync(output, { recursive: true });
const report = {
  ...manifest,
  browserSandbox: manifest.browserSandbox !== false,
  kind: "actual Chromium with controlled hidden-state events",
  checks: [],
  blocked: [],
  errors: [],
  limitations: [
    "Local synthetic runtime and emulated pointer/motion preferences; no physical-device or background-tab throttling claim.",
    "Document.hidden is controlled to deterministically exercise real registered visibility handlers; this is not proof of browser tab scheduling.",
  ],
};
const save = () =>
  writeFileSync(
    join(output, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
let browser;
try {
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true,
    chromiumSandbox: report.browserSandbox,
    args: [
      "--host-resolver-rules=MAP * ~NOTFOUND,EXCLUDE localhost,EXCLUDE 127.0.0.1",
    ],
    env: {
      PATH: process.env.PATH,
      LANG: "C.UTF-8",
      XDG_CONFIG_HOME: "/tmp/qa-migration-browser-config",
    },
  });
  for (const mode of ["desktop", "reduced", "coarse"]) {
    const context = await browser.newContext({
      viewport:
        mode === "coarse"
          ? { width: 390, height: 844 }
          : { width: 1440, height: 900 },
      reducedMotion: mode === "reduced" ? "reduce" : "no-preference",
      isMobile: mode === "coarse",
      hasTouch: mode === "coarse",
      serviceWorkers: "block",
    });
    const artwork = [];
    await context.route("**/*", (route) => {
      const request = route.request(),
        url = new URL(request.url());
      if (
        url.origin !== origin.origin ||
        !["GET", "HEAD"].includes(request.method())
      ) {
        report.blocked.push({
          mode,
          method: request.method(),
          origin: url.origin,
          path: url.pathname,
        });
        return route.abort("blockedbyclient");
      }
      if (/text-mask-alpha|delhi-fill-overscan|metro-static/.test(url.pathname))
        artwork.push(url.pathname);
      return route.continue();
    });
    const page = await context.newPage();
    page.on("pageerror", (error) =>
      report.errors.push({ mode, message: error.message }),
    );
    const check = (name, evidence = {}) => {
      report.checks.push({ mode, name, passed: true, ...evidence });
      save();
    };
    try {
      await page.goto(origin.origin, { waitUntil: "networkidle" });
      const field = page.locator(".home-hero .hero-dots");
      const transforms = () =>
        field
          .locator(".public-dot")
          .evaluateAll((nodes) => nodes.map((node) => node.style.transform));
      await page.waitForFunction(() =>
        document.querySelector(
          '.home-hero .hero-dots .public-dot[style*="translate3d"]',
        ),
      );
      if (mode !== "desktop") {
        await page.waitForTimeout(300);
        assert.equal(
          await page.locator(".delhi-wordmark").getAttribute("data-motion"),
          "false",
        );
        assert.deepEqual(artwork, []);
        if (mode === "reduced")
          assert.equal(await field.getAttribute("data-running"), "false");
        check(
          "static Delhi fallback never requests moving fill, mask or Metro layers",
          { artworkRequests: artwork },
        );
        continue;
      }
      await page.waitForFunction(
        () =>
          document.querySelector(".home-hero .hero-dots")?.dataset.running ===
          "false",
      );
      const home = await transforms();
      check("entrance reaches rest and releases its scheduled animation work");
      await page
        .getByRole("button", { name: "Pause animations", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Resume animations", exact: true })
        .click();
      await page.waitForTimeout(50);
      assert.ok(
        (await transforms()).every(
          (value) => Number(value.match(/,([^,]+)px,/)[1]) >= 0,
        ),
      );
      await page.waitForFunction(
        () =>
          document.querySelector(".home-hero .hero-dots")?.dataset.running ===
          "false",
      );
      assert.deepEqual(await transforms(), home);
      check("Pause/Resume preserves composition and does not replay entrance");
      await page.setViewportSize({ width: 1366, height: 900 });
      await page.waitForTimeout(50);
      assert.ok(
        (await transforms()).every(
          (value) => Number(value.match(/,([^,]+)px,/)[1]) >= 0,
        ),
      );
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.waitForFunction(
        () =>
          document.querySelector(".home-hero .hero-dots")?.dataset.running ===
          "false",
      );
      assert.deepEqual(await transforms(), home);
      check("resize preserves the settled field without another fall");
      const box = await field.boundingBox();
      await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
      await page.waitForTimeout(500);
      assert.notDeepEqual(await transforms(), home);
      await page.mouse.move(0, 0);
      await page.waitForFunction(
        () =>
          document.querySelector(".home-hero .hero-dots")?.dataset.running ===
          "false",
      );
      const returned = await transforms();
      for (let i = 0; i < home.length; i++) {
        const position = (value) => value.match(/[-\d.]+(?=px)/g).map(Number);
        assert.ok(
          position(returned[i]).every(
            (value, axis) => Math.abs(value - position(home[i])[axis]) < 0.2,
          ),
        );
      }
      check(
        "real pointer repulsion returns home when pointer leaves the field",
      );
      await page.waitForFunction(
        () =>
          document.querySelector(".delhi-wordmark")?.dataset.motion === "true",
      );
      const wordmark = page.locator(".delhi-wordmark"),
        fill = page.locator(".delhi-fill");
      const wordmarkBox = await wordmark.boundingBox();
      const fixed = await page
        .locator(".delhi-mask,.delhi-metro")
        .evaluateAll((nodes) =>
          nodes.map((node) => {
            const r = node.getBoundingClientRect();
            return {
              x: r.x,
              y: r.y,
              width: r.width,
              height: r.height,
              transform: getComputedStyle(node).transform,
            };
          }),
        );
      await page.mouse.move(
        wordmarkBox.x + wordmarkBox.width * 0.9,
        wordmarkBox.y + wordmarkBox.height * 0.7,
      );
      await page.waitForTimeout(200);
      assert.notEqual(
        await fill.evaluate((node) => getComputedStyle(node).transform),
        "matrix(1, 0, 0, 1, 0, 0)",
      );
      assert.deepEqual(
        await page.locator(".delhi-mask,.delhi-metro").evaluateAll((nodes) =>
          nodes.map((node) => {
            const r = node.getBoundingClientRect();
            return {
              x: r.x,
              y: r.y,
              width: r.width,
              height: r.height,
              transform: getComputedStyle(node).transform,
            };
          }),
        ),
        fixed,
      );
      await page.evaluate(() => window.dispatchEvent(new Event("blur")));
      await page.waitForTimeout(200);
      assert.equal(
        await fill.evaluate((node) => getComputedStyle(node).transform),
        "matrix(1, 0, 0, 1, 0, 0)",
      );
      check(
        "only Delhi interior fill moves; mask and Metro stay registered; blur resets fill",
      );
      await page.evaluate(() => {
        Object.defineProperty(document, "hidden", {
          configurable: true,
          value: true,
        });
        document.dispatchEvent(new Event("visibilitychange"));
      });
      await page.waitForFunction(
        () =>
          document.querySelector(".home-hero .hero-dots")?.dataset.visible ===
          "false",
      );
      const hidden = await transforms();
      await page.waitForTimeout(200);
      assert.deepEqual(await transforms(), hidden);
      assert.equal(await field.getAttribute("data-running"), "false");
      assert.equal(await wordmark.getAttribute("data-motion"), "false");
      await page.evaluate(() => {
        Object.defineProperty(document, "hidden", {
          configurable: true,
          value: false,
        });
        document.dispatchEvent(new Event("visibilitychange"));
      });
      await page.waitForFunction(
        () =>
          document.querySelector(".delhi-wordmark")?.dataset.motion === "true",
      );
      check(
        "controlled hidden document stops field work and shows static wordmark before safe resume",
      );
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForFunction(
        () =>
          document.querySelector(".home-hero .hero-dots")?.dataset.visible ===
          "false",
      );
      const offscreen = await transforms();
      await page.mouse.move(100, 100);
      await page.waitForTimeout(200);
      assert.deepEqual(await transforms(), offscreen);
      assert.equal(await field.getAttribute("data-running"), "false");
      assert.equal(await wordmark.getAttribute("data-motion"), "false");
      check(
        "actual offscreen field schedules no pointer work and wordmark uses fallback",
      );
    } finally {
      await context.close();
    }
  }
  assert.deepEqual(report.blocked, []);
  assert.deepEqual(report.errors, []);
} catch (error) {
  report.failure = String(error.stack || error);
  process.exitCode = 1;
} finally {
  await browser?.close();
  report.browserClosed = true;
  save();
}
console.log(
  JSON.stringify(
    {
      report: join(output, "report.json"),
      checks: report.checks.length,
      failure: report.failure,
    },
    null,
    2,
  ),
);
