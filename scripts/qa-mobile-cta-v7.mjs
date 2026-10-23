// Touch activation evidence; destinations are fulfilled locally before any real navigation.
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
const origin = process.env.MOBILE_CTA_ORIGIN || "http://127.0.0.1:4191";
assert.equal(new URL(origin).hostname, "127.0.0.1");
const out = resolve("evidence/v7-mobile-cta");
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
  checks: [],
  captures: [],
  blocked: [],
  errors: [],
  limitations: [
    "Local browser touch and CSS zoom emulation only, not physical devices or browser-toolbar automation.",
    "Registration, sign-in and dashboard destinations intercepted; no external action completed.",
  ],
};
const save = () =>
  writeFileSync(
    resolve(out, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
let browser;
try {
  browser = await chromium.launch({
    headless: true,
    chromiumSandbox: true,
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  });
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 360, height: 640 },
    { width: 390, height: 844 },
    { width: 430, height: 932 },
    { width: 390, height: 480 },
    { width: 320, height: 480 },
  ])
    for (const signedIn of [false, true]) {
      const destinations = [];
      const context = await browser.newContext({
        viewport,
        hasTouch: true,
        isMobile: true,
        reducedMotion: "reduce",
        serviceWorkers: "block",
      });
      await context.route("**/*", (route) => {
        const request = route.request(),
          url = new URL(request.url());
        if (
          url.href === "https://luma.com/6t5uk4lo" ||
          (url.origin === origin &&
            ["/signin-with-chatgpt", "/dashboard"].includes(url.pathname))
        ) {
          destinations.push(url.href);
          return route.fulfill({
            contentType: "text/html",
            body: "<!doctype html><title>Intercepted local test destination</title>",
          });
        }
        if (
          url.origin !== origin ||
          !["GET", "HEAD"].includes(request.method())
        ) {
          report.blocked.push({ url: url.href, method: request.method() });
          return route.abort();
        }
        const headers = { ...request.headers() };
        if (signedIn)
          Object.assign(headers, {
            "oai-authenticated-user-id": "fake_alice",
            "oai-authenticated-user-email": "alice@portal.test",
          });
        return route.continue({ headers });
      });
      const page = await context.newPage();
      page.on("pageerror", (error) => report.errors.push(String(error)));
      const loaded = page.waitForResponse(
        (r) => new URL(r.url()).pathname === "/api/portal",
      );
      await page.goto(origin);
      await loaded;
      await page.evaluate(() => document.fonts.ready);
      async function checkLayout(label) {
        const state = await page.evaluate(() => {
          const rect = (selector) => {
            const r = document.querySelector(selector).getBoundingClientRect();
            return {
              x: r.x,
              y: r.y,
              right: r.right,
              bottom: r.bottom,
              width: r.width,
              height: r.height,
            };
          };
          return {
            overflow: document.documentElement.scrollWidth > innerWidth + 1,
            heading: rect("#home-title"),
            date: rect(".hero-date"),
            register: rect(".hero-register"),
            primary: rect(".primary-cta"),
            scroll: rect(".scroll-cue"),
            hero: rect(".home-hero"),
            artPointer: getComputedStyle(document.querySelector(".hero-art"))
              .pointerEvents,
          };
        });
        assert.equal(state.overflow, false, label + " overflow");
        assert.equal(state.artPointer, "none");
        assert.ok(
          state.heading.bottom <= state.date.y + 1 &&
            state.date.bottom <= state.register.y + 1 &&
            state.register.bottom <= state.primary.y + 1 &&
            state.primary.bottom <= state.scroll.y + 1,
          label + " ordered stack",
        );
        assert.ok(
          state.hero.bottom >= state.scroll.bottom,
          label + " hero contains scroll cue",
        );
        assert.ok(
          Math.abs(state.register.width - state.primary.width) <= 1 &&
            state.primary.height >= 44 &&
            state.register.height >= 44,
          label + " full width touch actions",
        );
        for (const selector of [
          ".hero-register",
          ".primary-cta",
          ".scroll-cue",
        ]) {
          await page.locator(selector).scrollIntoViewIfNeeded();
          assert.equal(
            await page.locator(selector).evaluate((node) => {
              const r = node.getBoundingClientRect();
              return node.contains(
                document.elementFromPoint(
                  r.x + r.width / 2,
                  r.y + r.height / 2,
                ),
              );
            }),
            true,
            label + " hit target " + selector,
          );
        }
        report.checks.push({ viewport, signedIn, label, ...state });
        save();
      }
      await checkLayout("normal");
      await page.setViewportSize({ width: viewport.width, height: 400 });
      await checkLayout("short viewport resize");
      await page.setViewportSize(viewport);
      await page.evaluate(() => (document.body.style.zoom = "1.5"));
      await checkLayout("CSS zoom 150%");
      await page.evaluate(() => {
        document.body.style.zoom = "";
        window.scrollTo(0, 0);
      });
      if (viewport.width === 390) {
        const path = resolve(
          out,
          `hero-${signedIn ? "signed-in" : "anonymous"}-${viewport.width}x${viewport.height}.png`,
        );
        await page.screenshot({ path, animations: "disabled" });
        report.captures.push(path);
      }
      const popupPromise = context.waitForEvent("page");
      await page.locator(".hero-register").tap();
      const popup = await popupPromise;
      await popup.waitForLoadState("domcontentloaded");
      assert.ok(destinations.includes("https://luma.com/6t5uk4lo"));
      await popup.close();
      const expected = signedIn
        ? origin + "/dashboard"
        : origin + "/signin-with-chatgpt?return_to=%2Fdashboard";
      await page.locator(".primary-cta").tap();
      await page.waitForURL(expected);
      assert.ok(destinations.includes(expected));
      report.checks.push({
        viewport,
        signedIn,
        touchRegister: true,
        touchPrimary: true,
        destinations,
      });
      console.log(
        `PASS ${viewport.width}x${viewport.height} ${signedIn ? "signed-in" : "anonymous"}`,
      );
      save();
      await context.close();
    }
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.blocked, []);
} catch (error) {
  report.failure = error.stack || String(error);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  save();
  console.log(
    JSON.stringify({
      checks: report.checks.length,
      captures: report.captures.length,
      failure: report.failure,
    }),
  );
}
