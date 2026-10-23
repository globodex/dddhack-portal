// Synthetic mocked browser interactions only. No POST or remote request is allowed.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright-core";
const artifactRoot = resolve(process.env.DISCOVER_QA_ARTIFACT_ROOT || ".");
const origin = process.env.DISCOVER_QA_ORIGIN || "http://127.0.0.1:4173";
assert.equal(new URL(origin).hostname, "127.0.0.1");
if (!process.argv.includes("--preview-ready")) throw new Error("Requires --preview-ready and the integration owner's built preview.");
const workerFile = resolve(artifactRoot, "dist/server/index.js");
const fingerprint = () => createHash("sha256").update(readFileSync(workerFile)).digest("hex");
const before = fingerprint();
const source = process.env.DISCOVER_QA_SOURCE || execFileSync("git", ["-C", artifactRoot, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const output = resolve("evidence/v7-discover-cards", source.slice(0, 8) + "-" + new Date().toISOString().replaceAll(":", "-"));
mkdirSync(output, { recursive: true });
const report = { source, worker: before, runnerSha256: createHash("sha256").update(readFileSync(new URL(import.meta.url))).digest("hex"), chromiumSandbox: true, role: "synthetic viewer", origin, syntheticOnly: true, mockedApi: true, checked: [], errors: [], screenshots: [], limits: ["Browser API fixtures isolate client behavior; integration owner separately tests real pagination/privacy.", "Touch is Chromium emulation, not a physical device.", "No public Site, external links, real identities or durable writes exercised."] };
const people = Array.from({ length: 53 }, (_, index) => ({
  id: `fake_card_${index}`, name: `Synthetic Person ${String(index).padStart(2, "0")}`,
  bio: `Synthetic public bio ${index}`, socials: ["https://github.com/synthetic-example"],
  avatarColor: "blue", avatarExpression: "squeezed", teamName: index % 2 === 0 ? "Synthetic Team" : null,
  teamPalette: "forest", teamStatus: index % 2 === 0 ? "In a team" : "Not in a team",
}));
const me = { id: "fake_viewer", name: "Synthetic Viewer", email: "viewer@portal.test", role: "viewer", owner: false, mode: "viewer", canParticipate: false, canEngage: false };
let browser;
const save = () => writeFileSync(`${output}/report.json`, JSON.stringify(report, null, 2) + "\n");
try {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium", headless: true, chromiumSandbox: true, args: [] });
  for (const mode of (process.env.DISCOVER_QA_MODES || "desktop,keyboard,touch").split(",")) {
    assert.ok(["desktop", "keyboard", "touch"].includes(mode));
    const context = await browser.newContext({ extraHTTPHeaders: { "oai-authenticated-user-id": "fake_stranger", "oai-authenticated-user-email": "stranger@portal.test", "oai-authenticated-user-full-name": "Synthetic Viewer" }, viewport: mode === "touch" ? { width: 390, height: 844 } : { width: 1440, height: 900 }, ...(mode === "touch" ? { isMobile: true, hasTouch: true } : {}) });
    if (mode === "keyboard") await context.addInitScript(() => { window.IntersectionObserver = undefined; });
    const requests = [];
    let retryFailed = false;
    await context.route("**/*", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin !== origin || !["GET", "HEAD"].includes(request.method())) return route.abort();
      if (url.pathname !== "/api/portal") return route.continue();
      requests.push(Object.fromEntries(url.searchParams));
      const search = url.searchParams.get("q") || "";
      const membership = url.searchParams.get("membership") || "all";
      if (search === "Retry" && !retryFailed) {
        retryFailed = true;
        return route.fulfill({ status: 503, json: { message: "Synthetic directory unavailable." } });
      }
      if (search === "Slow") await new Promise((resolveDelay) => setTimeout(resolveDelay, 800));
      const found = search === "Retry" ? people.slice(0, 1) : people.filter((person) => person.name.toLowerCase().includes(search.toLowerCase()) && (membership === "all" || (membership === "in" ? !!person.teamName : !person.teamName)));
      const offset = Number(url.searchParams.get("cursor") || 0);
      const slice = found.slice(offset, offset + 24);
      // Deliberately overlap one row to prove client deduplication.
      const items = offset === 24 && !search && membership === "all" ? [found[23], ...slice] : slice;
      const hasMore = offset + 24 < found.length;
      try {
        return await route.fulfill({ json: { me, discovery: "participants", items, hasMore, nextCursor: hasMore ? String(offset + 24) : null, ...(url.searchParams.has("person") ? { focusedPerson: people.find((person) => person.id === url.searchParams.get("person")) || null } : {}) } });
      } catch (error) {
        if (!/closed|canceled|cancelled|Invalid InterceptionId/.test(String(error))) throw error;
      }
    });
    const page = await context.newPage();
    const cards = page.locator(".discover-people-cards > li");
    const check = async (name, fn) => { await fn(); report.checked.push({ mode, name }); save(); };
    const activate = async (locator) => {
      if (mode === "touch") await locator.tap();
      else if (mode === "keyboard") { await locator.focus(); await locator.press("Enter"); }
      else await locator.click();
    };
    const scrollBottom = async () => {
      if (mode !== "touch") return page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight - window.innerHeight - 400));
      const cdp = await context.newCDPSession(page);
      const beforeScroll = await page.evaluate(() => ({ y: window.scrollY, height: document.body.scrollHeight, viewport: window.innerHeight }));
      try {
        await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 195, y: 650 }] });
        for (const y of [600, 500, 400, 300, 200, 100]) {
          await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 195, y }] });
          await page.waitForTimeout(30);
        }
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        await page.waitForTimeout(150);
      } finally { await cdp.detach(); }
      report.touchScrolls ||= [];
      report.touchScrolls.push({ before: beforeScroll, after: await page.evaluate(() => ({ y: window.scrollY, count: document.querySelectorAll(".discover-people-cards > li").length })) });
      save();
    };
    const waitCount = (count) => page.waitForFunction((expected) => document.querySelectorAll(".discover-people-cards > li").length === expected, count);
    await page.goto(`${origin}/discover/participants`);
    await waitCount(24);
    await check("initial bounded 24 cards", async () => assert.equal(await cards.count(), 24));
    await check("no horizontal overflow", async () => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true));
    await check("card opens labelled dialog and Escape returns focus", async () => {
      const trigger = cards.first().getByRole("button", { name: "View Synthetic Person 00's profile" });
      if (mode === "touch") await trigger.tap(); else { await trigger.focus(); await trigger.press("Enter"); }
      await page.getByRole("dialog", { name: "Synthetic Person 00" }).waitFor();
      await page.keyboard.press("Escape");
      await page.getByRole("dialog").waitFor({ state: "detached" });
      assert.equal(await trigger.evaluate((node) => node === document.activeElement), true);
    });
    await check(mode === "keyboard" ? "keyboard Load more appends and deduplicates" : "scroll loads next page and deduplicates", async () => {
      if (mode === "keyboard") { const more = page.getByRole("button", { name: "Load more", exact: true }); await more.focus(); await more.press("Enter"); }
      else await scrollBottom();
      await waitCount(48);
      assert.equal(requests.filter((request) => request.cursor === "24").length, 1);
      assert.equal(await cards.locator("[id]").count(), 0);
      assert.equal(await page.locator("#person-fake_card_23").count(), 1);
    });
    await check("last page and accessible end state", async () => {
      if (mode === "keyboard") await page.getByRole("button", { name: "Load more", exact: true }).press("Enter");
      else await scrollBottom();
      await waitCount(53);
      await page.getByRole("status").filter({ hasText: "All people loaded" }).waitFor();
      assert.equal(await page.getByRole("button", { name: "Load more", exact: true }).count(), 0);
    });
    const search = page.getByRole("searchbox", { name: "Search people" });
    await check("search finds participant beyond first page", async () => {
      await search.fill("Synthetic Person 52");
      await waitCount(1);
      assert.match(await cards.innerText(), /Synthetic Person 52/);
      assert.ok(requests.some((request) => request.q === "Synthetic Person 52"));
    });
    await check(`failed query supports ${mode} Retry`, async () => {
      await search.fill("Retry");
      await page.getByRole("alert").filter({ hasText: "Synthetic directory unavailable." }).waitFor();
      const retry = page.getByRole("button", { name: "Retry", exact: true });
      await activate(retry);
      await waitCount(1);
      assert.match(await cards.innerText(), /Synthetic Person 00/);
    });
    await check("stale response cannot replace newer search", async () => {
      await search.fill("Slow");
      await page.waitForRequest((request) => new URL(request.url()).searchParams.get("q") === "Slow");
      await search.fill("Synthetic Person 51");
      await waitCount(1);
      await page.waitForTimeout(900);
      assert.match(await cards.innerText(), /Synthetic Person 51/);
    });
    await check("rapid search debounces intermediate queries", async () => {
      await search.fill("Inter"); await search.fill("Intermediate"); await search.fill("Synthetic Person 50");
      await waitCount(1);
      await page.getByRole("heading", { name: "Synthetic Person 50", exact: true }).waitFor();
      assert.equal(requests.filter((request) => ["Inter", "Intermediate"].includes(request.q)).length, 0);
    });
    await check("membership is a server query across directory", async () => {
      await activate(page.getByRole("button", { name: "Not in a team", exact: true }));
      await page.getByText("No matches", { exact: true }).waitFor();
      assert.ok(requests.some((request) => request.q === "Synthetic Person 50" && request.membership === "out"));
      await search.fill("Synthetic Person 51"); await waitCount(1);
      assert.match(await cards.innerText(), /Not in a team/);
    });
    await check("safe hash loads off-page profile without appending unrelated page", async () => {
      await page.evaluate(() => { window.location.hash = "person-fake_card_52"; });
      await page.getByRole("dialog", { name: "Synthetic Person 52" }).waitFor();
      assert.equal(await cards.count(), 1);
      assert.match(await cards.innerText(), /Synthetic Person 51/);
      await activate(page.getByRole("button", { name: "Close profile" }));
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      await page.waitForTimeout(350);
      assert.equal(await page.getByRole("dialog").count(), 0);
    });
    await search.fill("");
    await activate(page.getByRole("button", { name: "All", exact: true }));
    await waitCount(24);
    await page.evaluate(() => window.scrollTo(0, 0));
    const screenshot = `${output}/${mode}-people.png`;
    await page.screenshot({ path: screenshot, fullPage: false });
    report.screenshots.push({ mode, path: screenshot, source, worker: before, api: "synthetic mocked" });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await context.close();
  }
  assert.equal(fingerprint(), before, "Artifact changed during QA");
} catch (error) {
  report.errors.push(String(error?.stack || error));
  process.exitCode = 1;
} finally {
  await browser?.close();
  report.finishedAt = new Date().toISOString();
  report.browserClosed = true;
  save();
  console.log(JSON.stringify({ report: `${output}/report.json`, checked: report.checked.length, errors: report.errors }, null, 2));
}
