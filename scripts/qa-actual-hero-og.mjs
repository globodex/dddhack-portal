import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

const output = new URL("../evidence/actual-hero-og/", import.meta.url);
await mkdir(output, { recursive: true });
const report = {
  source: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  fixture: "/tmp/ddd-actual-hero-og-20261024-unique01.sqlite",
  browser: "Chromium, native page screenshot, no DOM or CSS replacement",
  frontendLocalTest: false,
  requests: [],
  errors: [],
};
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  headless: true,
  chromiumSandbox: false,
  proxy: { server: "http://127.0.0.1:8899" },
});
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 756 },
    deviceScaleFactor: 1,
    ignoreHTTPSErrors: true,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => report.errors.push(error.message));
  page.on("response", (response) => {
    report.requests.push({
      url: response.url(),
      status: response.status(),
      method: response.request().method(),
    });
  });
  const response = await page.goto("https://portal-perf.test:3443/", {
    waitUntil: "networkidle",
    timeout: 120000,
  });
  await page.locator(".home-hero").waitFor();
  await page.evaluate(async () => {
    await document.fonts.ready;
    const visible = [...document.images].filter((i) => {
      const box = i.getBoundingClientRect();
      return (
        box.bottom > 0 &&
        box.top < innerHeight &&
        box.right > 0 &&
        box.left < innerWidth
      );
    });
    await Promise.all(
      visible.map((i) =>
        i.complete ? Promise.resolve() : i.decode().catch(() => {}),
      ),
    );
  });
  await page.waitForTimeout(300);
  report.status = response.status();
  report.observed = await page.evaluate(() => ({
    title: document.querySelector("h1")?.textContent,
    rehearsal: /Local rehearsal|Switch fixture/.test(document.body.innerText),
    savedAvatar: !!document.querySelector(".navigation-account .dot-avatar"),
    signIn: !!document.querySelector('a[aria-label="Sign in"]'),
    horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
    hero: document
      .querySelector(".home-hero")
      ?.getBoundingClientRect()
      .toJSON(),
    cookies: document.cookie,
  }));
  if (
    report.status !== 200 ||
    report.observed.rehearsal ||
    report.observed.horizontalOverflow ||
    report.errors.length
  )
    throw new Error("CLEAN_ANONYMOUS_HERO_GATE_FAILED");
  await page.screenshot({
    path: new URL("hero-native-1440x756.png", output).pathname,
    fullPage: false,
  });
  report.result = "PASS";
  await context.close();
} catch (error) {
  report.result = "FAIL";
  report.failure = String(error);
  throw error;
} finally {
  await browser.close();
  report.browserClosed = true;
  await writeFile(
    new URL("capture-report.json", output),
    JSON.stringify(report, null, 2) + "\n",
  );
}
