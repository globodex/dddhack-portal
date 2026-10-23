// Local read-only UI checks. The native browser sandbox must remain enabled.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";

const origin = process.env.MOBILE_NAV_ORIGIN || "http://127.0.0.1:5178";
const url = new URL(origin);
assert.equal(url.hostname, "127.0.0.1");
assert.equal(url.protocol, "http:");
const out = resolve("evidence/v7-mobile-navigation");
mkdirSync(out, { recursive: true });
const report = {
  readOnly: true,
  syntheticOnly: true,
  sandbox: true,
  checks: [],
  captures: [],
  limitations: [
    "Local rendered UI with synthetic actor API projections; no managed sign-in or physical-device claim.",
  ],
};
let browser;
try {
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true,
    chromiumSandbox: true,
  });
  for (const width of [320, 360, 390, 430, 701, 740]) {
    for (const role of ["anonymous", "participant", "admin"]) {
      const context = await browser.newContext({
        viewport: { width, height: 844 },
        reducedMotion: "reduce",
        serviceWorkers: "block",
        isMobile: true,
        hasTouch: true,
      });
      await context.route("**/*", (route) => {
        const request = route.request();
        const target = new URL(request.url());
        if (
          target.origin !== url.origin ||
          !["GET", "HEAD"].includes(request.method())
        )
          return route.abort();
        if (target.pathname === "/api/portal")
          return route.fulfill({
            json:
              role === "anonymous"
                ? {}
                : {
                    me: {
                      id: "fake_mobile_navigation",
                      email: "mobile-navigation@portal.test",
                      name: "Synthetic navigation",
                      role,
                      owner: false,
                    },
                  },
          });
        return route.continue();
      });
      const page = await context.newPage();
      await page.goto(origin);
      await page.evaluate(() => document.fonts.ready);
      const trigger = page.locator(".public-menu");
      await trigger.tap();
      const dialog = page.locator("#mobile-navigation");
      await dialog.waitFor({ state: "visible" });
      const state = await dialog.evaluate((node) => {
        const rect = node.getBoundingClientRect();
        const links = [...node.querySelectorAll("nav > a,nav > button")].map(
          (element) => {
            const r = element.getBoundingClientRect();
            return {
              text: element.textContent,
              x: r.x,
              right: r.right,
              top: r.top,
              bottom: r.bottom,
              height: r.height,
            };
          },
        );
        return {
          open: node.open,
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          links,
          locked: document.body.style.overflow === "hidden",
          animation: getComputedStyle(node).animationName,
        };
      });
      assert.equal(state.open, true);
      assert.equal(state.x, 0);
      assert.equal(state.y, 0);
      assert.equal(state.width, width);
      assert.equal(state.height, 844);
      assert.equal(state.locked, true);
      assert.equal(state.animation, "none");
      assert.ok(
        state.links.every(
          (link, i) =>
            link.height >= 44 &&
            link.x >= 0 &&
            link.right <= width &&
            (!i || link.top >= state.links[i - 1].bottom),
        ),
      );
      assert.ok(!state.links.some((link) => link.text === "Menu"));
      if (role === "anonymous")
        assert.ok(state.links.some((link) => link.text === "Sign in"));
      else assert.ok(state.links.some((link) => link.text === "Log out"));
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "hidden" });
      assert.equal(
        await trigger.evaluate((node) => node === document.activeElement),
        true,
      );
      assert.notEqual(
        await page.evaluate(() => document.body.style.overflow),
        "hidden",
      );
      const gutter = await page.evaluate(() =>
        [...document.querySelectorAll(".chapter-content")].map((node) => {
          const body = node
            .querySelector(".chapter-body,.public-rules")
            .getBoundingClientRect();
          return {
            left: body.left,
            right: innerWidth - body.right,
            overflow: document.documentElement.scrollWidth > innerWidth,
          };
        }),
      );
      assert.ok(
        gutter.every(
          (value) =>
            Math.abs(value.left - 20) <= 1 &&
            Math.abs(value.right - 20) <= 1 &&
            !value.overflow,
        ),
      );
      report.checks.push({
        width,
        role,
        fullscreen: true,
        keyboardEscapeAndFocus: true,
        touchOpen: true,
        gutters: gutter,
      });
      if (width === 390 && role === "anonymous") {
        for (const section of ["venue", "rules", "faq"]) {
          await page.locator("#" + section).scrollIntoViewIfNeeded();
          const path = resolve(out, `${section}-390x844.png`);
          await page.screenshot({ path, animations: "disabled" });
          report.captures.push(path);
        }
      }
      await context.close();
    }
  }
} catch (error) {
  report.failure = String(error);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  writeFileSync(
    resolve(out, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    JSON.stringify(
      {
        checks: report.checks.length,
        captures: report.captures.length,
        failure: report.failure,
      },
      null,
      2,
    ),
  );
}
