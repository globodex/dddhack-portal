import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
const out = "evidence/project-320-diagnostic";
mkdirSync(out, { recursive: true });
const report = { syntheticOnly: true, readOnly: true, events: [], errors: [] };
const b = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  headless: true,
  chromiumSandbox: false,
});
const c = await b.newContext({
  viewport: { width: 320, height: 720 },
  hasTouch: true,
  isMobile: true,
  reducedMotion: "reduce",
});
await c.addCookies([
  {
    name: "portal_local_fixture",
    value: "alice",
    url: "http://localhost:3000",
  },
]);
await c.route("**/*", (r) =>
  new URL(r.request().url()).origin === "http://localhost:3000" &&
  ["GET", "HEAD"].includes(r.request().method())
    ? r.continue()
    : r.abort(),
);
const p = await c.newPage();
p.setDefaultTimeout(10000);
p.on("pageerror", (e) => report.errors.push(e.message));
const snapshot = async (label) => {
  report[label] = await p.evaluate(() => ({
    width: innerWidth,
    height: innerHeight,
    scrollX,
    scrollY,
    documentWidth: document.documentElement.scrollWidth,
    steps: [...document.querySelectorAll(".submission-stage")].map((n) => ({
      step: n.getAttribute("data-step"),
      hidden: n.hidden,
      rect: n.getBoundingClientRect().toJSON(),
    })),
    next: [...document.querySelectorAll("button")]
      .filter((n) => n.textContent.trim() === "Next")
      .map((n) => {
        const r = n.getBoundingClientRect(),
          hit = document.elementFromPoint(
            r.x + r.width / 2,
            r.y + r.height / 2,
          );
        return {
          rect: r.toJSON(),
          hitTag: hit?.tagName,
          hitClass: hit?.className,
          hitText: hit?.textContent?.slice(0, 100),
        };
      }),
  }));
  await p.screenshot({
    path: out + "/" + label + ".png",
    fullPage: false,
    style: "nextjs-portal{visibility:hidden!important}",
  });
};
try {
  await p.goto("http://localhost:3000/dashboard#project", {
    waitUntil: "networkidle",
    timeout: 60000,
  });
  await p.getByRole("tab", { name: "Project", exact: true }).tap();
  await p.getByRole("button", { name: "Update project", exact: true }).tap();
  await p.locator(".project-editor:not([inert])").waitFor();
  await p.locator('[name="projectName"]').fill("");
  await p.getByRole("button", { name: "Next", exact: true }).tap();
  await p.locator("#submission-projectName-error").waitFor();
  await p
    .locator('[name="projectName"]')
    .fill("SyntheticAccessibilityReview".repeat(3));
  await snapshot("before-next");
  await p.getByRole("button", { name: "Next", exact: true }).tap();
  await p.locator('.submission-stage[data-step="2"]:not([hidden])').waitFor();
  await snapshot("after-next");
  await p.locator('[name="github"]').fill("not-a-repository");
  await p.getByRole("button", { name: "Next", exact: true }).tap();
  await p.locator("#submission-github-error").waitFor();
  await snapshot("repository-error");
  report.passed = true;
} catch (e) {
  report.failure = String(e.stack || e);
  await snapshot("failure");
  process.exitCode = 1;
} finally {
  await b.close();
  writeFileSync(out + "/report.json", JSON.stringify(report, null, 2));
}
console.log(JSON.stringify(report, null, 2));
