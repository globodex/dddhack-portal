// Real component + real HTTP/service projection, fresh in-memory synthetic DB.
import assert from "node:assert/strict";
import { build } from "esbuild";
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
import { execFileSync } from "node:child_process";
import { chromium } from "@playwright/test";
import { LocalDatabase } from "../lib/local-test/sqlite.ts";
import { seedLocal, fixtures, LOCAL_CREDIT_KEY } from "./fixtures.ts";
import { PortalService } from "../lib/service.ts";
import { handlePortal } from "../lib/http.ts";
import { batch, rows } from "../lib/db.ts";
import { sha256 } from "../lib/security.ts";

const root = process.cwd(),
  temp = "/tmp/ddd-admin-direct-values-build",
  out = "evidence/admin-credit-values",
  origin = "http://localhost:3022";
mkdirSync(temp, { recursive: true });
mkdirSync(out, { recursive: true });
const db = new LocalDatabase(":memory:");
db.migrate();
await seedLocal(db);
await batch(db, [
  [
    "INSERT INTO credit_inventory(id,type_id,ciphertext,fingerprint,created_at) VALUES('fake_bad_legacy','fake_credit','INVALID-SYNTHETIC-CIPHERTEXT',?,'2026-10-22T08:00:00Z')",
    await sha256("FAKE-BAD-LEGACY"),
  ],
]);
for (let n = 0; n < 15; n++) {
  const value = `FAKE-DIRECT-ADMIN-${String(n).padStart(3, "0")}`;
  await batch(db, [
    [
      "INSERT INTO credit_inventory(id,type_id,ciphertext,fingerprint,created_at,voucher_value) VALUES(?,'fake_credit','',?,'2026-10-22T08:00:00Z',?)",
      `fake_plain_${n}`,
      await sha256(value),
      value,
    ],
  ]);
}
for (const email of ["alice@portal.test", "bob@portal.test"])
  await new PortalService(
    db,
    fixtures.admin,
    LOCAL_CREDIT_KEY,
    () => "2026-10-22T08:00:00Z",
  ).command("quick-check-in", { emails: [email] });
const domainState = async () =>
  createHash("sha256")
    .update(
      JSON.stringify(
        await Promise.all(
          [
            "credit_inventory",
            "credit_allocations",
            "credit_code_history",
            "audit_logs",
          ].map((table) => rows(db, `SELECT * FROM ${table}`)),
        ),
      ),
    )
    .digest("hex");
const before = await domainState();
const styles = [
  ...readFileSync("app/layout.tsx", "utf8").matchAll(
    /import "(\.\/[^"\n]+\.css)"/g,
  ),
]
  .map((match) => `import ${JSON.stringify("./app/" + match[1].slice(2))};`)
  .join("\n");
await build({
  stdin: {
    contents: `import React,{useState}from'react';import{createRoot}from'react-dom/client';import Stock from './app/admin-credit-stock';${styles}
function App(){const[s,set]=useState(null);return <div className="app-shell"><main className="main" style={{maxWidth:1300,margin:'auto',padding:20}}><section className="admin-credit-batches"><h1>Fake credit stock</h1><p>Synthetic values only</p>{s&&<p>{s.total} total · {s.assigned} assigned · {s.available} available</p>}<Stock typeId="fake_credit" heading="Fake credits" onSummary={set}/></section></main></div>}createRoot(document.getElementById('root')).render(<App/>);`,
    resolveDir: root,
    loader: "tsx",
  },
  bundle: true,
  format: "iife",
  platform: "browser",
  outfile: join(temp, "bundle.js"),
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  loader: { ".woff2": "file", ".woff": "file" },
  external: ["/art/*", "/fonts/*", "/home/*", "/icons/*", "/brand/*"],
  logLevel: "warning",
});
globalThis.fetch = async () => {
  throw new Error("QA_EXTERNAL_PROVIDER_REQUEST_FORBIDDEN");
};
const report = {
  source: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  syntheticOnly: true,
  freshInMemoryDatabase: true,
  realComponentAndHttpHandler: true,
  before,
  gets: [],
  writesBlocked: 0,
  externalRequests: [],
  checks: [],
  errors: [],
  screenshots: [],
};
const save = () =>
  writeFileSync(out + "/report.json", JSON.stringify(report, null, 2) + "\n");
const html =
  '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/bundle.css"></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>';
const server = createServer(async (request, response) => {
  if (request.method !== "GET") {
    report.writesBlocked++;
    response.writeHead(405);
    response.end();
    return;
  }
  const url = new URL(request.url, origin);
  if (url.pathname === "/api/portal") {
    const actor =
      request.headers.cookie?.match(/(?:^|;\s*)qa_actor=([a-z]+)/)?.[1] ||
      "admin";
    report.gets.push({
      view: url.searchParams.get("view"),
      q: url.searchParams.get("q"),
      page: url.searchParams.get("page"),
      actor,
    });
    const result = await handlePortal(
      new Request(url, { headers: request.headers }),
      {
        db,
        identity: fixtures[actor] || null,
        key: LOCAL_CREDIT_KEY,
        localTest: true,
      },
    );
    response.writeHead(result.status, Object.fromEntries(result.headers));
    response.end(Buffer.from(await result.arrayBuffer()));
    return;
  }
  let file = join(temp, url.pathname.slice(1));
  if (!existsSync(file)) file = join(root, "public", url.pathname.slice(1));
  if (existsSync(file) && extname(file)) {
    response.setHeader(
      "content-type",
      {
        ".js": "text/javascript",
        ".css": "text/css",
        ".svg": "image/svg+xml",
        ".woff2": "font/woff2",
      }[extname(file)] || "application/octet-stream",
    );
    response.end(readFileSync(file));
  } else {
    response.setHeader("content-type", "text/html");
    response.end(html);
  }
});
await new Promise((resolve) => server.listen(3022, "127.0.0.1", resolve));
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  headless: true,
  chromiumSandbox: false,
});
const contexts = [];
const shot = async (page, name) => {
  const path = `${out}/${name}.png`;
  await page.screenshot({ path, animations: "disabled" });
  report.screenshots.push(path);
  save();
};
try {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
    { width: 320, height: 480 },
  ]) {
    const context = await browser.newContext({
      viewport,
      hasTouch: viewport.width < 768,
      isMobile: viewport.width < 768,
      reducedMotion: "reduce",
      permissions: ["clipboard-read", "clipboard-write"],
    });
    contexts.push(context);
    await context.route("**/*", (route) => {
      if (new URL(route.request().url()).origin !== origin) {
        report.externalRequests.push(route.request().url());
        return route.abort();
      }
      return route.continue();
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => report.errors.push(error.message));
    const response = page.waitForResponse((result) =>
      result.url().includes("/api/portal?"),
    );
    const start = report.gets.length;
    await page.goto(origin);
    const first = await response;
    assert.match(first.headers()["cache-control"], /private, no-store/);
    assert.match(first.headers().vary, /Cookie/);
    await page.locator(".credit-stock-table tbody tr").nth(24).waitFor();
    await page.waitForFunction(
      () => document.querySelectorAll(".credit-stock-table code").length === 24,
    );
    assert.equal(
      report.gets.length - start,
      1,
      "Only the displayed page is fetched",
    );
    assert.equal(
      await page.getByRole("button", { name: /Reveal|Hide/ }).count(),
      0,
    );
    assert.equal(
      await page.locator(".credit-stock-table code").first().innerText(),
      "FAKE-NOT-REDEEMABLE-000",
    );
    assert.equal(
      await page.locator(".credit-stock-table tbody tr").count(),
      25,
    );
    const name = `${viewport.width}x${viewport.height}`;
    await shot(page, `visible-page1-${name}`);
    await page
      .getByRole("button", { name: /^Copy code/ })
      .first()
      .click();
    await page.getByRole("button", { name: /^Copied code/ }).waitFor();
    assert.equal(
      await page.evaluate(() => navigator.clipboard.readText()),
      "FAKE-NOT-REDEEMABLE-000",
    );
    await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    assert.equal(
      await page.locator(".credit-stock-table code").count(),
      24,
      "Current authorized page stays directly visible",
    );
    assert.equal(
      report.gets.length - start,
      1,
      "Copy/blur causes no reveal command or exposure polling",
    );
    await shot(page, `visible-values-${name}`);
    await page.evaluate(() =>
      Object.defineProperty(navigator.clipboard, "writeText", {
        configurable: true,
        value: async () => {
          throw Error("Synthetic clipboard denial");
        },
      }),
    );
    await page
      .getByRole("button", { name: /^Copy code/ })
      .first()
      .click();
    await page.getByRole("alert").filter({ hasText: "Copy failed." }).waitFor();
    await shot(page, `copy-error-${name}`);
    const unavailable = page
      .locator(".credit-stock-table tbody tr")
      .filter({ hasText: "Legacy code unavailable." });
    await unavailable.scrollIntoViewIfNeeded();
    assert.equal(await unavailable.getByRole("button").isDisabled(), true);
    await shot(page, `legacy-unavailable-${name}`);
    await page
      .getByRole("button", { name: "Next stock page", exact: true })
      .click();
    await page.waitForFunction(
      () => document.querySelectorAll(".credit-stock-table code").length === 11,
    );
    assert.equal(report.gets.length - start, 2);
    assert.equal(report.gets.at(-1).page, "1");
    await shot(page, `visible-page2-${name}`);
    await page.getByRole("searchbox").fill("alice@portal.test");
    await page
      .getByRole("button", { name: "Search stock", exact: true })
      .click();
    await page.waitForFunction(
      () => document.querySelectorAll(".credit-stock-table code").length === 1,
    );
    assert.match(
      await page.locator(".credit-stock-table").innerText(),
      /alice@portal.test/,
    );
    assert.equal(report.gets.at(-1).page, "0");
    assert.equal(report.gets.at(-1).q, "alice@portal.test");
    await page
      .getByRole("combobox", { name: "Allocation status" })
      .selectOption("available");
    await page.getByText("No matching codes.", { exact: true }).waitFor();
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    report.checks.push({
      name: `${name}: direct page25 values, Copy and honest failure, legacy unavailable/disabledCopy, next page11, search/status, no Reveal/POST/all-pages/polling/overflow`,
      passed: true,
      pageGets: report.gets.length - start,
    });
    save();
    await context.close();
  }
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  contexts.push(context);
  await context.addCookies([{ name: "qa_actor", value: "alice", url: origin }]);
  const page = await context.newPage();
  await page.goto(origin);
  await page
    .getByRole("alert")
    .filter({ hasText: "available to event administrators" })
    .waitFor();
  assert.equal(await page.locator(".credit-stock-table code").count(), 0);
  await shot(page, "participant-denied-390x844");
  report.checks.push({
    name: "Actual HTTP denies checked-in assigned participant; no inventory codes render",
    passed: true,
  });
  report.after = await domainState();
  assert.equal(
    report.after,
    report.before,
    "Read and Copy preserve inventory, allocations, hash history/exposure and audit",
  );
  assert.equal(report.writesBlocked, 0);
  assert.equal(report.externalRequests.length, 0);
  assert.equal(report.errors.length, 0);
} catch (error) {
  report.failure = String(error.stack || error);
  process.exitCode = 1;
} finally {
  for (const context of contexts) await context.close();
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
  db.close();
  save();
}
console.log(
  JSON.stringify({
    checks: report.checks.length,
    screenshots: report.screenshots.length,
    unchangedDomainState: report.before === report.after,
    failure: report.failure,
  }),
);
