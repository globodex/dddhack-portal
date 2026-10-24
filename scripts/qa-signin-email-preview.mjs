// Synthetic local rendering only. Does not import SMTP, create a transport or send mail.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { chromium } from "@playwright/test";

const html = readFileSync("previews/signin-email/signin.html", "utf8");
assert.ok(html.includes("token=SYNTHETIC_PREVIEW_ONLY"));
const output = "evidence/signin-email";
mkdirSync(output, { recursive: true });
const server = createServer((request, response) => {
  if (request.method !== "GET" || request.url !== "/signin-preview") {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, {
    "content-type": "text/html;charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(html);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const report = {
  syntheticOnly: true,
  noEmailSent: true,
  externalAssets: false,
  browserSandbox: process.env.EMAIL_PREVIEW_BROWSER_SANDBOX !== "false",
  previewMode: "read-only loopback HTTP",
  htmlSha256: createHash("sha256").update(html).digest("hex"),
  screenshots: [],
  blocked: [],
  errors: [],
  limitations: [
    "Browser rendering only. Hosted Gmail, Outlook, Apple Mail and real delivery were not tested.",
    "The executor blocks file URL navigation; this preview uses the normal loopback HTTP workflow without changing file-access policy.",
  ],
};
let browser;
try {
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true,
    chromiumSandbox: report.browserSandbox,
  });
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    const context = await browser.newContext({ viewport });
    await context.route("**/*", (route) => {
      const request = route.request();
      if (
        new URL(request.url()).origin === origin &&
        request.method() === "GET"
      )
        return route.continue();
      report.blocked.push({
        origin: new URL(request.url()).origin,
        method: request.method(),
      });
      return route.abort();
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => report.errors.push(error.message));
    await page.goto(`${origin}/signin-preview`);
    const links = await page.locator("a").evaluateAll((elements) =>
      elements.map((element) => ({
        label: element.textContent,
        href: element.getAttribute("href"),
        box: element.getBoundingClientRect().toJSON(),
      })),
    );
    assert.equal(links.length, 2);
    assert.ok(
      links.every((link) => link.href.endsWith("token=SYNTHETIC_PREVIEW_ONLY")),
    );
    assert.equal(links[0].href, links[1].href);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    );
    assert.equal(overflow, false);
    const file = `${output}/signin-email-${viewport.width}x${viewport.height}.png`;
    await page.screenshot({ path: file, fullPage: true });
    report.screenshots.push({
      file,
      viewport,
      links,
      overflow,
      inspected: false,
    });
    await context.close();
  }
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
  writeFileSync(
    `${output}/report.json`,
    JSON.stringify(report, null, 2) + "\n",
  );
}
console.log(
  JSON.stringify({
    screenshots: report.screenshots.length,
    errors: report.errors,
    blocked: report.blocked,
  }),
);
