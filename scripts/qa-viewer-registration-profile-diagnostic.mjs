import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";
const b = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  headless: true,
  chromiumSandbox: false,
});
let r = { source: "86e89812937a68e609fd9af521c85b5eb1a19dae" };
try {
  const c = await b.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: "reduce",
  });
  await c.addCookies([
    {
      name: "portal_local_fixture",
      value: "stranger",
      url: "http://localhost:3008",
    },
  ]);
  const p = await c.newPage();
  await p.goto("http://localhost:3008/profile", {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });
  await p.locator(".viewer-welcome").waitFor();
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({
    path: "evidence/viewer-registration/after/profile-desktop-sidebar-diagnostic.png",
    fullPage: true,
  });
  r.observation = await p.evaluate(() => ({
    shell: document.querySelector(".app-shell")?.className,
    mobileHeaderDisplay: getComputedStyle(
      document.querySelector(".mobile-header"),
    ).display,
    sidebarDisplay: getComputedStyle(document.querySelector(".sidebar"))
      .display,
    nav: [...document.querySelectorAll(".sidebar nav a")].map((e) => ({
      text: e.textContent,
      href: e.getAttribute("href"),
    })),
  }));
  await c.close();
} finally {
  await b.close();
  r.browserClosed = true;
  writeFileSync(
    "evidence/viewer-registration/after/profile-desktop-sidebar-diagnostic.json",
    JSON.stringify(r, null, 2),
  );
}
