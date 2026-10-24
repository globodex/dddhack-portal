import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";
const b = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  headless: true,
  chromiumSandbox: false,
});
let r = { source: "c205b40" };
try {
  const c = await b.newContext({
    viewport: { width: 320, height: 480 },
    isMobile: true,
    hasTouch: true,
    reducedMotion: "reduce",
  });
  await c.addCookies([
    {
      name: "portal_local_fixture",
      value: "owner",
      url: "http://localhost:3008",
    },
  ]);
  const p = await c.newPage();
  await p.goto("http://localhost:3008/admin/participants", {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });
  await p.waitForFunction(
    () =>
      document.querySelector(".app-shell")?.getAttribute("data-hydrated") ===
      "true",
  );
  await p
    .getByRole("button", { name: "Participant filters", exact: true })
    .tap();
  await p
    .getByRole("combobox", { name: "Personal status", exact: true })
    .selectOption("not registered");
  await p.getByText("28 viewers", { exact: true }).waitFor();
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({
    path: "evidence/viewer-registration/after/admin-viewer-overlap-320-viewport.png",
  });
  r.geometry = await p
    .locator("tbody tr")
    .first()
    .evaluate((row) => ({
      row: row.getBoundingClientRect().toJSON(),
      cells: [...row.children].map((e) => ({
        text: e.innerText,
        box: e.getBoundingClientRect().toJSON(),
      })),
      texts: [...row.querySelectorAll("strong,small,.muted")].map((e) => ({
        text: e.innerText,
        box: e.getBoundingClientRect().toJSON(),
      })),
    }));
  await c.close();
} finally {
  await b.close();
  r.browserClosed = true;
  writeFileSync(
    "evidence/viewer-registration/after/admin-viewer-overlap-diagnostic.json",
    JSON.stringify(r, null, 2),
  );
}
