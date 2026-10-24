import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
const origin = "http://localhost:3008";
const out = "evidence/viewer-registration/before";
const source = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
const report = {
  source,
  origin,
  syntheticDatabase: "/tmp/ddd-viewer-20261024-unique01.sqlite",
  syntheticOnly: true,
  captures: [],
  cases: [],
  startedAt: new Date().toISOString(),
};
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  headless: true,
  chromiumSandbox: false,
});
try {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
    { width: 390, height: 480 },
  ])
    for (const path of ["/dashboard", "/profile"]) {
      const context = await browser.newContext({
        viewport,
        reducedMotion: "reduce",
        serviceWorkers: "block",
        ...(viewport.width < 500 ? { isMobile: true, hasTouch: true } : {}),
      });
      await context.addCookies([
        {
          name: "portal_local_fixture",
          value: "stranger",
          url: origin,
          httpOnly: true,
          sameSite: "Lax",
        },
      ]);
      const item = {
        path,
        viewport,
        requests: [],
        responses: [],
        pageErrors: [],
        states: [],
      };
      const page = await context.newPage();
      page.setDefaultNavigationTimeout(120000);
      await page.addInitScript(() => {
        window.__viewerStates = [];
        let previous = "";
        const observe = () => {
          const v = {
            heading: [...document.querySelectorAll("h1")].map(
              (e) => e.textContent,
            ),
            nav: [...document.querySelectorAll("nav a,header a")].map(
              (e) => e.textContent,
            ),
            body: document.querySelector("main")?.innerText || "",
            skeletons: document.querySelectorAll(
              "[aria-busy=true],.route-skeleton",
            ).length,
          };
          const signature = JSON.stringify(v);
          if (signature !== previous) {
            previous = signature;
            window.__viewerStates.push({ ms: performance.now(), ...v });
          }
        };
        new MutationObserver(observe).observe(document, {
          childList: true,
          subtree: true,
          attributes: true,
        });
      });
      let release;
      const gate = new Promise((r) => (release = r));
      let apiStarted;
      const started = new Promise((r) => (apiStarted = r));
      await context.route("**/*", async (route) => {
        const q = route.request();
        if (
          new URL(q.url()).origin !== origin ||
          !["GET", "HEAD"].includes(q.method())
        )
          return route.abort("blockedbyclient");
        if (new URL(q.url()).pathname === "/api/portal") {
          apiStarted();
          await gate;
        }
        return route.continue();
      });
      page.on("request", (q) =>
        item.requests.push({
          ms: Date.now(),
          method: q.method(),
          url: q.url(),
        }),
      );
      page.on("response", (r) =>
        item.responses.push({
          ms: Date.now(),
          status: r.status(),
          url: r.url(),
        }),
      );
      page.on("pageerror", (e) => item.pageErrors.push(e.message));
      await page.goto(origin + path, { waitUntil: "domcontentloaded" });
      await Promise.race([started, new Promise((r) => setTimeout(r, 2000))]);
      const prefix = `${out}/${path.slice(1)}-${viewport.width}x${viewport.height}`;
      await page.screenshot({
        path: prefix + "-client-api-held.png",
        animations: "disabled",
      });
      report.captures.push(prefix + "-client-api-held.png");
      release();
      await page.waitForTimeout(1000);
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({
        path: prefix + "-settled.png",
        animations: "disabled",
        fullPage: true,
      });
      report.captures.push(prefix + "-settled.png");
      Object.assign(
        item,
        await page.evaluate(() => ({
          url: location.href,
          text: document.body.innerText,
          overflow: document.documentElement.scrollWidth > innerWidth,
          states: window.__viewerStates,
          links: [...document.querySelectorAll("a")].map((e) => ({
            text: e.textContent,
            href: e.getAttribute("href"),
          })),
        })),
      );
      report.cases.push(item);
      await context.close();
      console.log(
        JSON.stringify({
          path,
          viewport,
          apis: item.responses.filter((r) => r.url.includes("/api/portal")),
          body: item.text.slice(-1800),
        }),
      );
    }
} finally {
  await browser.close();
  report.browserClosed = true;
  writeFileSync(out + "/report.json", JSON.stringify(report, null, 2));
}
