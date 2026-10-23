import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { resolve } from "node:path";
const origin = "http://127.0.0.1:" + (process.env.DELHI_PREVIEW_PORT || 4192),
  out = resolve("evidence/v7-delhi-previews");
mkdirSync(out, { recursive: true });
const report = {
  source: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  previewOnly: true,
  productionReplacement: false,
  landmarkScale: 0.76,
  outlineSourceRadius: 2,
  sandbox: true,
  captures: [],
};
const browser = await chromium.launch({
  headless: true,
  chromiumSandbox: true,
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
});
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 500 },
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
    serviceWorkers: "block",
  });
  await context.route("**/*", (route) =>
    new URL(route.request().url()).origin === origin
      ? route.continue()
      : route.abort(),
  );
  const page = await context.newPage();
  for (const number of [1, 2]) {
    await page.goto(origin + "/?variant=" + number);
    await page.waitForLoadState("networkidle");
    assert.equal(
      await page.locator("body").getAttribute("data-variant"),
      String(number),
    );
    const path = resolve(
      out,
      `${number}-new-delhi-${number === 1 ? "smaller-landmarks" : "smaller-landmarks-outline"}-1440x500.png`,
    );
    await page.screenshot({ path, animations: "disabled" });
    report.captures.push({
      number,
      path,
      sha256: createHash("sha256").update(readFileSync(path)).digest("hex"),
      size: { width: 1440, height: 500 },
      metro: await page
        .locator("#unchanged-metro")
        .evaluate((node) => ({
          href: node.getAttribute("href"),
          width: node.getAttribute("width"),
          height: node.getAttribute("height"),
        })),
    });
  }
  await context.close();
} finally {
  await browser.close();
  writeFileSync(
    resolve(out, "receipt.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report));
}
