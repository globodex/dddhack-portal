// One input mode per fresh disposable compiled preview. No hosted writes.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "@playwright/test";

const manifestPath = resolve(process.env.CONTROL_MANIFEST || "");
assert.ok(process.env.CONTROL_MANIFEST, "CONTROL_MANIFEST is required");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const mode = process.env.PROFILE_INPUT_MODE || "keyboard";
assert.ok(["keyboard", "desktop", "touch"].includes(mode));
assert.equal(manifest.disposable, true);
assert.equal(manifest.syntheticOnly, true);
assert.equal(manifest.rootConfirmedReset, true);
assert.match(manifest.resetToken || "", /^[a-z0-9-]{20,}$/i);
const previewPort = Number(process.env.PROFILE_PREVIEW_PORT || 4177);
assert.ok(Number.isInteger(previewPort) && previewPort >= 4173 && previewPort <= 4180);
assert.equal(manifest.origin, `http://127.0.0.1:${previewPort}`);
assert.deepEqual(manifest.actors.leader, {
  id: "fake_alice", email: "alice@portal.test",
});
assert.match(manifest.source || "", /^[a-f0-9]{40}$/);
assert.match(manifest.worker || "", /^[a-f0-9]{64}$/);
const artifact = resolve(manifest.artifactRoot);
assert.equal(execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: artifact, encoding: "utf8",
}).trim(), manifest.source);
const workerPath = join(artifact, "dist/server/index.js");
const workerSha = () => createHash("sha256").update(readFileSync(workerPath)).digest("hex");
assert.equal(workerSha(), manifest.worker);
// Exclusion is shared across modes: each positive-write run needs a new reset.
writeFileSync(`${manifestPath}.profile-claimed`, `${mode}\n`, { flag: "wx", mode: 0o600 });
const viewport = mode === "touch" ? { width: 390, height: 844 } : { width: 1440, height: 900 };
const base = resolve("evidence/v7-profile-controls");
mkdirSync(base, { recursive: true });
const output = mkdtempSync(join(base, `${mode}-${manifest.source.slice(0, 7)}-`));
const report = {
  source: manifest.source, workerSha: manifest.worker, mode, viewport,
  resetToken: manifest.resetToken, syntheticOnly: true, input: mode,
  browserEmulation: true, physicalDevice: false,
  browserSandbox: true,
  checks: [], writes: [], blocked: [], errors: [], screenshots: [], browserClosed: false,
};
const persist = () => writeFileSync(join(output, "report.json"), JSON.stringify(report, null, 2));
const check = (name) => { report.checks.push({ name, passed: true }); persist(); };
const expected = {
  displayName: `Alice ${mode} QA`, gender: "non-binary",
  bio: "Synthetic profile control verification", phone: "+12025550100",
  bestDescription: "Independent Developer", organization: "Synthetic QA organization",
  openaiOrgId: "", socialLinks: [
    { type: "Website", url: "https://example.test/profile-controls" },
  ], avatarColor: "purple", avatarExpression: "mixed-plus",
};
const browser = await chromium.launch({ headless: true,
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  chromiumSandbox: true,
  args: ["--disable-setuid-sandbox"],
}).catch((error) => {
  report.browserLaunchBlocked = true;
  report.failure = error.message;
  persist();
  console.error(JSON.stringify({ report: join(output, "report.json"), browserLaunchBlocked: true }));
  process.exit(1);
});
report.browser = browser.version();
let writes = 0;
const context = await browser.newContext({ viewport, hasTouch: mode === "touch",
  isMobile: mode === "touch", reducedMotion: "reduce", serviceWorkers: "block" });
await context.route("**/*", async (route) => {
  const request = route.request(), url = new URL(request.url());
  if (url.origin !== manifest.origin) {
    report.blocked.push({ kind: "external", method: request.method(), path: url.pathname });
    return route.abort("blockedbyclient");
  }
  if (!["GET", "HEAD"].includes(request.method())) {
    let body;
    try { body = request.postDataJSON(); } catch {}
    if (writes !== 0 || request.method() !== "POST" || url.pathname !== "/api/portal" || body?.action !== "complete-profile") {
      report.blocked.push({ kind: "mutation", action: body?.action, method: request.method() });
      return route.abort("blockedbyclient");
    }
    const { public: visible, ...payload } = body.data || {};
    assert.equal(typeof visible, "boolean");
    assert.deepEqual(payload, expected);
    writes++;
    report.writes.push({ action: "complete-profile", actor: "fake_alice", requestCount: writes });
    persist();
  }
  return route.continue({ headers: { ...request.headers(),
    "oai-authenticated-user-id": "fake_alice",
    "oai-authenticated-user-email": "alice@portal.test",
  } });
});
const page = await context.newPage();
page.setDefaultTimeout(10000);
page.on("pageerror", (error) => report.errors.push(error.message));

async function activate(target) {
  if (mode === "touch") return target.tap();
  if (mode === "keyboard") {
    await target.focus();
    return target.press("Enter");
  }
  return target.click();
}
async function edit(target, text) {
  if (mode === "touch") await target.tap();
  if (mode === "keyboard") {
    await target.focus();
    await target.press("ControlOrMeta+A");
    await target.press("Backspace");
    if (text) await target.pressSequentially(text);
  } else await target.fill(text);
}
async function selected(target, value) {
  if (mode !== "keyboard") return target.selectOption(value);
  await target.focus();
  const options = await target.locator("option").evaluateAll((nodes) => nodes.map((node) => node.value));
  const current = options.indexOf(await target.inputValue()), wanted = options.indexOf(value);
  assert.ok(wanted >= 0);
  for (let i = 0; i < Math.abs(current - wanted); i++)
    await target.press(wanted > current ? "ArrowDown" : "ArrowUp");
  assert.equal(await target.inputValue(), value);
}
async function radio(target) {
  if (mode === "keyboard") { await target.focus(); await target.press("Space"); }
  else if (mode === "touch") await target.locator("..").tap();
  else await target.check();
  assert.equal(await target.isChecked(), true);
}
async function step(number) {
  await page.locator(`.profile-flow[data-step="${number}"]`).waitFor();
  assert.equal(await page.locator(".profile-flow h1").evaluate((node) => node === document.activeElement), true);
  const dimensions = await page.evaluate(() => ({ width: innerWidth, content: document.documentElement.scrollWidth }));
  assert.ok(dimensions.content <= dimensions.width, "No horizontal overflow");
  check(`Step ${number}: heading focus and no horizontal overflow`);
}
async function shot(name) {
  const path = join(output, `${name}-${viewport.width}x${viewport.height}.png`);
  await page.screenshot({ path, fullPage: true, animations: "disabled" });
  report.screenshots.push({ path, route: new URL(page.url()).pathname, mode, viewport,
    source: manifest.source, workerSha: manifest.worker, inspected: false });
}
async function profileRead() {
  return page.evaluate(async () => {
    const response = await fetch("/api/portal?view=/profile", { cache: "no-store" });
    return { status: response.status, cache: response.headers.get("cache-control"), data: await response.json() };
  });
}
try {
  await page.goto(manifest.origin + "/profile");
  await page.locator('.profile-flow[data-step="1"]').waitFor();
  const before = await profileRead();
  assert.equal(before.status, 200);
  assert.match(before.cache, /no-store/);
  const publicBefore = before.data.profile.public;
  assert.equal(await page.getByRole("textbox", { name: "Email", exact: true }).getAttribute("readonly"), "");
  assert.equal(await page.getByRole("textbox", { name: "Email", exact: true }).inputValue(), "alice@portal.test");
  check("Authenticated email is read-only; own profile response is no-store");
  await radio(page.getByRole("radio", { name: "Purple", exact: true }));
  await radio(page.getByRole("radio", { name: "Mixed plus", exact: true }));
  if (mode === "keyboard") {
    const avatar = page.getByRole("radio", { name: "Purple", exact: true });
    await avatar.focus(); await page.keyboard.press("ArrowRight");
    assert.equal(await page.getByRole("radio", { name: "Orange", exact: true }).isChecked(), true);
    await page.keyboard.press("ArrowLeft");
    assert.equal(await avatar.isChecked(), true);
    check("Native radio arrow navigation preserves one color selection");
  }
  await edit(page.getByRole("textbox", { name: "Full name", exact: true }), expected.displayName);
  await edit(page.getByRole("textbox", { name: /^Bio/ }), expected.bio);
  await radio(page.getByRole("radio", { name: "Non-binary", exact: true }));
  await activate(page.getByRole("button", { name: "Next", exact: true }));
  await step(2);
  await edit(page.getByRole("textbox", { name: /Phone/ }), "123");
  await activate(page.getByRole("button", { name: "Next", exact: true }));
  assert.equal(await page.locator(".profile-flow").getAttribute("data-step"), "2");
  assert.equal(writes, 0);
  check("Invalid phone prevents navigation and any write");
  await edit(page.getByRole("textbox", { name: /Phone/ }), expected.phone);
  // Exercise add/remove and retain one exact reserved synthetic URL.
  const rows = page.locator(".profile-social-row");
  while (await rows.count()) await activate(rows.last().getByRole("button"));
  await activate(page.getByRole("button", { name: "Add another", exact: true }));
  await selected(rows.first().locator("select"), "Website");
  await edit(rows.first().locator('input[type="url"]'), expected.socialLinks[0].url);
  await activate(page.getByRole("button", { name: "Add another", exact: true }));
  await edit(rows.last().locator('input[type="url"]'), "https://example.test/remove-me");
  await activate(rows.last().getByRole("button"));
  assert.equal(await rows.count(), 1);
  assert.equal(await rows.first().locator('input[type="url"]').inputValue(), expected.socialLinks[0].url);
  check("Social add/platform/edit/remove affects only the selected row");
  await activate(page.getByRole("button", { name: "Previous profile step", exact: true }));
  await step(1);
  assert.equal(await page.getByRole("textbox", { name: "Full name", exact: true }).inputValue(), expected.displayName);
  assert.equal(await page.getByRole("radio", { name: "Purple", exact: true }).isChecked(), true);
  assert.equal(await page.getByRole("radio", { name: "Mixed plus", exact: true }).isChecked(), true);
  await activate(page.getByRole("button", { name: "Next", exact: true }));
  await step(2);
  assert.equal(await page.getByRole("textbox", { name: /Phone/ }).inputValue(), expected.phone);
  assert.equal(await rows.first().locator('input[type="url"]').inputValue(), expected.socialLinks[0].url);
  check("Back/Next retains basics, avatar, phone and social link");
  await activate(page.getByRole("button", { name: "Next", exact: true }));
  await step(3);
  await selected(page.locator('select[name="bestDescription"]'), expected.bestDescription);
  await edit(page.getByRole("textbox", { name: "Organization", exact: true }), expected.organization);
  await edit(page.getByRole("textbox", { name: "OpenAI org ID", exact: true }), "");
  await shot("before-save");
  const responsePromise = page.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname === "/api/portal");
  await activate(page.getByRole("button", { name: "Save", exact: true }));
  const response = await responsePromise;
  assert.equal(response.status(), 200, await response.text());
  await page.waitForURL(manifest.origin + "/teams");
  assert.equal(writes, 1);
  assert.equal(await page.locator("dialog[open]").count(), 0);
  check("Save commits one positive synthetic request and navigates to Teams");
  const after = await profileRead(), p = after.data.profile;
  assert.equal(after.status, 200);
  assert.match(after.cache, /no-store/);
  assert.equal(p.complete, true);
  assert.equal(p.display_name, expected.displayName);
  assert.equal(p.bio, expected.bio);
  assert.equal(p.gender, expected.gender);
  assert.equal(p.phone, expected.phone);
  assert.equal(p.best_description, expected.bestDescription);
  assert.equal(p.organization, expected.organization);
  assert.equal(p.openai_org_id, "");
  assert.equal(p.avatar_color, expected.avatarColor);
  assert.equal(p.avatar_expression, expected.avatarExpression);
  assert.equal(p.public, publicBefore);
  assert.deepEqual(p.socials, expected.socialLinks.map((link) => link.url));
  check("Fresh server read verifies every saved field and unchanged public visibility");
  await page.goto(manifest.origin + "/profile");
  await page.locator('.profile-flow[data-step="1"]').waitFor();
  assert.equal(await page.getByRole("textbox", { name: "Full name", exact: true }).inputValue(), expected.displayName);
  check("Full page reload retains the committed profile");
  await shot("persisted-profile");
  assert.equal(report.errors.length, 0, JSON.stringify(report.errors));
  assert.equal(report.blocked.length, 0, JSON.stringify(report.blocked));
} catch (error) {
  report.failure = error.stack;
  process.exitCode = 1;
  await shot("failure").catch(() => {});
} finally {
  await context.close();
  await browser.close();
  report.browserClosed = true;
  assert.equal(workerSha(), manifest.worker, "Compiled Worker changed during QA");
  persist();
}
console.log(JSON.stringify({ report: join(output, "report.json"), checks: report.checks.length,
  writes: report.writes.length, failure: report.failure, screenshots: report.screenshots.length,
  browserClosed: report.browserClosed }, null, 2));
