import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { writeFileSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
const origin = "http://localhost:3008",
  out = "evidence/viewer-registration/after";
const report = {
  source: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  applicationEquivalentTo: "063cdefb0fb9ae6054425f3e9784a6b09ae44539",
  syntheticOnly: true,
  cases: [],
  startedAt: new Date().toISOString(),
};
const previous = JSON.parse(
  readFileSync(out + "/desktop-menu-assumption-report.json", "utf8"),
);
report.cases.push(...previous.cases);
report.previousCaseSource = previous.source;
report.harnessCorrection =
  "Require hydrated shell rather than visible mobile menu on desktop sidebar routes. Retain already-passed Dashboard case; no app behavior changed for that case by401-copy-only followup.";
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  headless: true,
  chromiumSandbox: false,
});
async function context(viewport, javaScriptEnabled = true) {
  const c = await browser.newContext({
    viewport,
    javaScriptEnabled,
    reducedMotion: "reduce",
    serviceWorkers: "block",
    ...(viewport.width < 500 ? { isMobile: true, hasTouch: true } : {}),
  });
  await c.addCookies([
    {
      name: "portal_local_fixture",
      value: "stranger",
      url: origin,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  await c.route("**/*", (r) =>
    new URL(r.request().url()).origin !== origin ||
    !["GET", "HEAD"].includes(r.request().method())
      ? r.abort("blockedbyclient")
      : r.continue(),
  );
  return c;
}
try {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
    { width: 390, height: 480 },
    { width: 320, height: 480 },
  ]) {
    const c = await context(viewport);
    const page = await c.newPage();
    page.setDefaultNavigationTimeout(120000);
    for (const path of [
      "/dashboard",
      "/profile",
      "/submission",
      "/personal/credits",
    ]) {
      if (viewport.width === 1440 && path === "/dashboard") continue;
      const item = {
        path,
        viewport,
        responses: [],
        requests: [],
        pageErrors: [],
      };
      const onResponse = (r) =>
        item.responses.push({ url: r.url(), status: r.status() });
      const onRequest = (q) =>
        item.requests.push({ url: q.url(), method: q.method() });
      const onError = (e) => item.pageErrors.push(e.message);
      page.on("response", onResponse);
      page.on("request", onRequest);
      page.on("pageerror", onError);
      await page.addInitScript(() => {
        window.__viewerTimeline = [];
        let old = "";
        const snap = () => {
          const main = document.querySelector("main");
          const s = {
            headings: [...document.querySelectorAll("h1")].map(
              (e) => e.textContent,
            ),
            skeletons: document.querySelectorAll(".route-skeleton").length,
            errors: document.querySelectorAll(".page-error-card").length,
            nav: [...document.querySelectorAll(".sidebar nav a")].map((e) => [
              e.textContent,
              e.getAttribute("href"),
            ]),
            account:
              document.querySelector(".account-controls")?.innerText || "",
            shell: document.querySelector(".app-shell")?.className || "",
            main: main?.innerText || "",
          };
          const sig = JSON.stringify(s);
          if (sig !== old) {
            old = sig;
            window.__viewerTimeline.push({ ms: performance.now(), ...s });
          }
        };
        new MutationObserver(snap).observe(document, {
          childList: true,
          subtree: true,
          attributes: true,
        });
      });
      report.inFlightCase = item;
      const response = await page.goto(origin + path, {
        waitUntil: "domcontentloaded",
      });
      await page.locator(".viewer-welcome").waitFor({ state: "visible" });
      await page.waitForFunction(
        () =>
          document
            .querySelector(".app-shell")
            ?.getAttribute("data-hydrated") === "true",
      );
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(350);
      Object.assign(
        item,
        await page.evaluate(() => ({
          text: document.querySelector("main")?.innerText,
          overflow: document.documentElement.scrollWidth > innerWidth,
          viewportWidth: innerWidth,
          documentWidth: document.documentElement.scrollWidth,
          timeline: window.__viewerTimeline,
          registration: [...document.querySelectorAll(".viewer-welcome a")].map(
            (e) => ({ text: e.textContent, href: e.getAttribute("href") }),
          ),
          nav: [...document.querySelectorAll(".sidebar nav a")].map((e) => ({
            text: e.textContent.trim(),
            href: e.getAttribute("href"),
          })),
          account: document.querySelector(".account-controls")?.innerText,
          errors: document.querySelectorAll(".page-error-card").length,
          skeletons: document.querySelectorAll(".route-skeleton").length,
        })),
      );
      assert.equal(response.status(), 200);
      assert.equal(item.overflow, false);
      assert.equal(item.skeletons, 0);
      assert.equal(item.errors, 0);
      assert.equal(
        item.timeline.some((s) => s.skeletons || s.errors),
        false,
        "No skeleton/error at any observed DOM state",
      );
      assert.equal(
        item.timeline.some((s) => /Use your registered email/.test(s.main)),
        false,
      );
      assert.equal(
        item.timeline.some((s) =>
          s.nav.some(([text, href]) =>
            ["/dashboard", "/personal/credits", "/profile"].includes(href),
          ),
        ),
        false,
        "No unauthorized nav flash",
      );
      assert.equal(
        item.registration.find((a) => a.text.includes("Register on Luma"))
          ?.href,
        "https://luma.com/6t5uk4lo",
      );
      assert.equal(
        item.requests.filter((q) => q.url.includes("/api/portal")).length,
        0,
        "SSR projection reused; no duplicate browser fetch",
      );
      assert.equal(item.pageErrors.length, 0);
      assert.deepEqual(
        item.nav.map((n) => n.href),
        ["/discover/teams", "/projects", "/rules"],
      );
      const file = `${out}/viewer-${path.replaceAll("/", "-").slice(1)}-${viewport.width}x${viewport.height}.png`;
      await page.screenshot({
        path: file,
        fullPage: true,
        animations: "disabled",
      });
      item.file = file;
      report.cases.push(item);
      delete report.inFlightCase;
      if (
        path === "/dashboard" &&
        [390, 320].includes(viewport.width) &&
        [844, 480].includes(viewport.height)
      ) {
        await page
          .getByRole("button", { name: "Open menu", exact: true })
          .tap();
        const dialog = page.getByRole("dialog", {
          name: "Navigation",
          exact: true,
        });
        await dialog.waitFor({ state: "visible" });
        const menuLinks = await dialog
          .locator("nav a")
          .evaluateAll((es) =>
            es.map((e) => ({
              text: e.textContent,
              href: e.getAttribute("href"),
            })),
          );
        assert.deepEqual(
          menuLinks.map((a) => a.href),
          ["/discover/teams", "/projects", "/rules"],
        );
        const menuFile = `${out}/viewer-menu-${viewport.width}x${viewport.height}.png`;
        await page.screenshot({ path: menuFile, animations: "disabled" });
        await page.keyboard.press("Escape");
        await dialog.waitFor({ state: "hidden" });
        item.menu = { links: menuLinks, file: menuFile, escapeClosed: true };
      }
      page.off("response", onResponse);
      page.off("request", onRequest);
      page.off("pageerror", onError);
      console.log(
        JSON.stringify({
          case: report.cases.length,
          path,
          viewport,
          result: "PASS",
        }),
      );
    }
    await c.close();
  }
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    const c = await context(viewport, false);
    const p = await c.newPage();
    const r = await p.goto(origin + "/dashboard", {
      waitUntil: "domcontentloaded",
      timeout: 120000,
    });
    await p.locator(".viewer-welcome").waitFor({ state: "visible" });
    assert.equal(r.status(), 200);
    assert.equal(
      await p.locator(".route-skeleton,.page-error-card").count(),
      0,
    );
    const file = `${out}/viewer-dashboard-nojs-${viewport.width}x${viewport.height}.png`;
    await p.screenshot({ path: file, fullPage: true });
    report.cases.push({
      path: "/dashboard",
      viewport,
      noJS: true,
      file,
      result: "PASS_VISIBLE_SSR",
    });
    await c.close();
  }
  report.result = "PASS";
} catch (e) {
  report.result = "FAIL";
  report.failure = { message: e.message, stack: e.stack };
  throw e;
} finally {
  await browser.close();
  report.browserClosed = true;
  writeFileSync(out + "/report.json", JSON.stringify(report, null, 2));
}
