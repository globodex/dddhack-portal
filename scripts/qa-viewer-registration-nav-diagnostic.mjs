import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";
const origin = "http://localhost:3008",
  out = "evidence/viewer-registration/after";
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  headless: true,
  chromiumSandbox: false,
});
let data = {
  source: "8a88fec5e354ad12fbf4b53b0f5e0aa0d5a8af16",
  result: "CONFIRMED_UNWANTED_DASHBOARD_NAV",
  cases: [],
};
try {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    const c = await browser.newContext({
      viewport,
      reducedMotion: "reduce",
      ...(viewport.width === 390 ? { isMobile: true, hasTouch: true } : {}),
    });
    await c.addCookies([
      { name: "portal_local_fixture", value: "stranger", url: origin },
    ]);
    const p = await c.newPage();
    await p.goto(origin + "/dashboard", {
      waitUntil: "domcontentloaded",
      timeout: 120000,
    });
    await p.locator(".viewer-welcome").waitFor();
    await p.waitForFunction(
      () =>
        document.querySelector(".app-shell")?.getAttribute("data-hydrated") ===
        "true",
    );
    await p.evaluate(() => document.fonts.ready);
    await p.screenshot({
      path: `${out}/initial-nav-failure-page-${viewport.width}.png`,
      fullPage: true,
    });
    await p.getByRole("button", { name: "Open menu", exact: true }).click();
    await p
      .getByRole("dialog", { name: "Navigation", exact: true })
      .waitFor({ state: "visible" });
    const links = await p
      .getByRole("dialog", { name: "Navigation", exact: true })
      .locator("a")
      .evaluateAll((es) =>
        es.map((e) => ({ text: e.textContent, href: e.getAttribute("href") })),
      );
    await p.screenshot({
      path: `${out}/initial-nav-failure-menu-${viewport.width}.png`,
    });
    data.cases.push({ viewport, links });
    await c.close();
  }
} finally {
  await browser.close();
  data.browserClosed = true;
  writeFileSync(
    out + "/initial-nav-diagnostic.json",
    JSON.stringify(data, null, 2),
  );
}
