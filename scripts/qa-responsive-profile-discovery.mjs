// Read-only responsive audit against the coordinator's synthetic local runtime.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  writeFileSync,
  mkdtempSync,
  rmSync,
  readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";

const origin = "http://localhost:3000";
const root = "/workspace/dddhack-portal";
const output = resolve(
  process.env.QA_OUTPUT || "evidence/responsive-profile-discovery-d092147",
);
mkdirSync(output, { recursive: true });
const git = (...args) =>
  execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
let report = {
  source: git("rev-parse", "HEAD"),
  origin,
  syntheticOnly: true,
  readOnly: true,
  startedAt: new Date().toISOString(),
  screenshots: [],
  checks: [],
  errors: [],
  mutationsBlocked: [],
  network: [],
  limitations: [
    "Local synthetic fixture, not production or real sign-in.",
    "Long text stress changes only browser DOM or unsaved form state, never persisted data.",
    "Chromium touch emulation is not a physical-device test.",
  ],
};
if (process.env.QA_RESUME) {
  report = JSON.parse(readFileSync(resolve(output, "report.json"), "utf8"));
  report.priorAttemptErrors = [
    ...(report.priorAttemptErrors || []),
    ...report.errors,
  ];
  report.errors = [];
  delete report.finishedAt;
}
if (process.env.QA_EXPECTED_SOURCE)
  assert.equal(report.source, process.env.QA_EXPECTED_SOURCE);
const save = () =>
  writeFileSync(
    resolve(output, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  headless: true,
  chromiumSandbox: false,
});
const activeContexts = new Set(),
  temporaryProfiles = new Set();
report.browser = browser.version();
const geometry = (page, expectedWidth) =>
  page.evaluate((expectedWidth) => {
    const viewport = expectedWidth;
    const visible = (element) => {
      const r = element.getBoundingClientRect(),
        style = getComputedStyle(element);
      return (
        r.width > 0 &&
        r.height > 0 &&
        style.visibility !== "hidden" &&
        style.display !== "none"
      );
    };
    return {
      width: viewport,
      innerWidth,
      clientWidth: document.documentElement.clientWidth,
      visualWidth: visualViewport.width,
      scale: visualViewport.scale,
      height: innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      heading: [...document.querySelectorAll("h1")].map((e) =>
        e.textContent.trim(),
      ),
      overflow: [...document.querySelectorAll("main *, dialog[open] *")]
        .filter(visible)
        .flatMap((element) => {
          const rect = element.getBoundingClientRect();
          if (rect.left < -1 || rect.right > viewport + 1)
            return [
              {
                tag: element.tagName,
                className: element.className?.baseVal ?? element.className,
                text: element.textContent?.trim().slice(0, 100),
                left: rect.left,
                right: rect.right,
              },
            ];
          return [];
        })
        .slice(0, 15),
    };
  }, expectedWidth);
async function capture(page, name, viewport, state = "baseline") {
  // Step transitions can introduce uncached social-logo assets.
  await page
    .locator("img:visible")
    .evaluateAll((images) =>
      Promise.all(images.map((image) => image.decode())),
    );
  const dimensions = await geometry(page, viewport.width);
  if (
    !["baseline", "step2", "step3"].includes(state) &&
    !["320x640", "390x480", "native-200pct"].includes(viewport.label)
  )
    return dimensions;
  const file = `${name}-${viewport.label}-${state}.png`;
  let pixelDimensions;
  if (viewport.zoom) {
    // CDP captures the complete physical viewport under native browser zoom.
    await page.addStyleTag({
      content: "nextjs-portal { visibility: hidden !important; }",
    });
    const client = await page.context().newCDPSession(page);
    const { data } = await client.send("Page.captureScreenshot", {
      format: "png",
      fromSurface: true,
      captureBeyondViewport: false,
    });
    const pixels = Buffer.from(data, "base64");
    pixelDimensions = {
      width: pixels.readUInt32BE(16),
      height: pixels.readUInt32BE(20),
    };
    assert.equal(
      pixelDimensions.width,
      1440,
      "Native screenshot must include the whole physical viewport",
    );
    writeFileSync(resolve(output, file), pixels);
    await client.detach();
  } else
    await page.screenshot({
      path: resolve(output, file),
      animations: "disabled",
      fullPage: false,
      style: "nextjs-portal { visibility: hidden !important; }",
    });
  report.screenshots.push({
    file,
    name,
    viewport,
    state,
    source: git("rev-parse", "HEAD"),
    dimensions,
    pixelDimensions,
    inspected: false,
  });
  save();
  return dimensions;
}
function check(name, passed, detail = {}) {
  report.checks.push({ name, passed, ...detail });
  save();
}
async function layout(page, name, viewport, state) {
  const dimensions = await capture(page, name, viewport, state);
  check(
    `${name}: ${state} reflow`,
    dimensions.scrollWidth <= dimensions.width &&
      dimensions.overflow.length === 0,
    { viewport: viewport.label, dimensions },
  );
}
async function activate(page, locator, viewport) {
  if (viewport.width < 500) return locator.tap();
  await locator.focus();
  await locator.press("Enter");
}
async function focusedError(page, viewport, state) {
  const focused = await page.evaluate(() => {
    const field = document.activeElement,
      r = field.getBoundingClientRect();
    const header = document.querySelector(
      ".mobile-header, .app-mobile-header, .topbar",
    );
    return {
      name: field.getAttribute("name"),
      invalid: field.getAttribute("aria-invalid"),
      top: r.top,
      bottom: r.bottom,
      width: r.width,
      headerBottom: header?.getBoundingClientRect().bottom || 64,
      viewport: innerHeight,
    };
  });
  check(
    `Profile ${state}: first invalid field visible and focused`,
    focused.invalid === "true" &&
      focused.top >= Math.max(0, focused.headerBottom) &&
      focused.bottom <= focused.viewport,
    { viewport: viewport.label, focused },
  );
}
const longName = "Alexandria".repeat(10);
const longBio = "Synthetic browser-only unbroken biography "
  .repeat(6)
  .slice(0, 240);
const longUrl = "https://example.test/" + "a".repeat(1900);
async function profile(page, viewport) {
  const next = () => page.getByRole("button", { name: "Next", exact: true });
  const name = page.locator('input[name="fullName"]');
  const bio = page.locator('input[name="bio"]');
  await name.fill("");
  await bio.fill("");
  await activate(page, next(), viewport);
  await page.locator('[aria-invalid="true"]').first().waitFor();
  await page.waitForFunction(
    () => document.activeElement?.getAttribute("aria-invalid") === "true",
  );
  await focusedError(page, viewport, "step1-validation");
  await layout(page, "profile", viewport, "step1-validation");
  await name.fill(longName);
  await bio.fill(longBio);
  await page
    .getByRole("radio", { name: "Non-binary", exact: true })
    .check({ force: true });
  await layout(page, "profile", viewport, "step1-long-unsaved");
  await activate(page, next(), viewport);
  await page.locator('.profile-flow[data-step="2"]').waitFor();
  await layout(page, "profile", viewport, "step2");
  await page.locator('input[name="phone"]').fill("123");
  await page
    .locator(".profile-social-url input")
    .first()
    .fill("http://invalid.example");
  await activate(page, next(), viewport);
  await page.waitForFunction(
    () => document.activeElement?.getAttribute("aria-invalid") === "true",
  );
  await focusedError(page, viewport, "step2-validation");
  await layout(page, "profile", viewport, "step2-validation");
  await page.locator('input[name="phone"]').fill("+12025550100");
  const rows = page.locator(".profile-social-url input");
  for (let index = 0; index < (await rows.count()); index++)
    await rows.nth(index).fill(longUrl + index);
  while ((await rows.count()) < 8)
    await activate(
      page,
      page.getByRole("button", { name: "Add", exact: true }),
      viewport,
    );
  for (let index = 0; index < (await rows.count()); index++)
    await rows.nth(index).fill(longUrl + index);
  await layout(page, "profile", viewport, "step2-eight-long-unsaved-socials");
  await activate(page, next(), viewport);
  await page.locator('.profile-flow[data-step="3"]').waitFor();
  await layout(page, "profile", viewport, "step3");
  await page
    .locator('select[name="bestDescription"]')
    .selectOption("Independent Developer");
  await page
    .getByRole("textbox", { name: "Organization", exact: true })
    .fill(longName);
  await page
    .getByRole("textbox", { name: "OpenAI org ID", exact: true })
    .fill("org-" + "a".repeat(100));
  const saveButton = page.getByRole("button", { name: "Save", exact: true });
  await saveButton.scrollIntoViewIfNeeded();
  await layout(page, "profile", viewport, "step3-long-unsaved-save-visible");
  check(
    "Profile retains exactly three steps with Save available; Save was not submitted",
    await saveButton.isVisible(),
    { viewport: viewport.label },
  );
}
async function dialogCheck(page, viewport, name, dialog, close) {
  await dialog.waitFor({ state: "visible" });
  const bounds = await dialog.evaluate((element) => {
    const r = element.getBoundingClientRect();
    return {
      left: r.left,
      right: r.right,
      top: r.top,
      bottom: r.bottom,
      width: innerWidth,
      height: innerHeight,
      scroll: element.scrollWidth,
      client: element.clientWidth,
    };
  });
  check(
    `${name}: dialog fits viewport and scrolls internally`,
    bounds.left >= 0 &&
      bounds.top >= 0 &&
      bounds.right <= bounds.width &&
      bounds.bottom <= bounds.height &&
      bounds.scroll <= bounds.client + 1,
    { viewport: viewport.label, bounds },
  );
  await layout(page, name, viewport, "dialog");
  await dialog
    .locator("h2")
    .evaluate((element) => (element.textContent = "Alexandria".repeat(10)));
  const paragraphs = dialog.locator("p");
  if (await paragraphs.count())
    await paragraphs
      .first()
      .evaluate(
        (element) => (element.textContent = "SyntheticBrowserOnly".repeat(16)),
      );
  await layout(page, name, viewport, "dialog-long-DOM-fixture");
  await close.scrollIntoViewIfNeeded();
  const closeBox = await close.boundingBox();
  check(
    `${name}: close control reachable after long text`,
    closeBox.x >= 0 &&
      closeBox.y >= 0 &&
      closeBox.x + closeBox.width <= viewport.width &&
      closeBox.y + closeBox.height <= viewport.height,
    { viewport: viewport.label, closeBox },
  );
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
}
async function discovery(page, viewport, people) {
  const name = people ? "participants" : "teams";
  const first = page.locator(".discover-directory > li").first();
  await first
    .locator(".discover-identity h2")
    .evaluate((element) => (element.textContent = "Alexandria".repeat(10)));
  const bio = first.locator(
    people ? ".discover-identity p" : ".discover-team-summary",
  );
  if (await bio.count())
    await bio.evaluate(
      (element) => (element.textContent = "SyntheticBrowserOnly".repeat(16)),
    );
  // DOM-only text does not alter component state or persisted fixture records.
  await layout(page, name, viewport, "long-DOM-fixture");
  await page.reload({ waitUntil: "networkidle", timeout: 60000 });
  await page.locator('.app-shell[data-hydrated="true"]').waitFor();
  const trigger = people
    ? page.locator(".discover-profile-open").first()
    : page.locator(".discover-identity h2 button").first();
  await activate(page, trigger, viewport);
  const dialog = page.locator(
    people ? "dialog.discovery-profile" : "dialog.discover-team-dialog-v6",
  );
  const close = page.getByRole("button", {
    name: people ? "Close profile" : "Close team",
    exact: true,
  });
  await dialogCheck(page, viewport, name, dialog, close);
  check(
    `${name}: Escape restores opening-control focus`,
    await trigger.evaluate((element) => element === document.activeElement),
    { viewport: viewport.label },
  );
  await activate(page, trigger, viewport);
  await dialog.waitFor({ state: "visible" });
  await close.focus();
  for (let count = 0; count < 8; count++) await page.keyboard.press("Tab");
  check(
    `${name}: keyboard focus remains inside dialog`,
    await dialog.evaluate((element) =>
      element.contains(document.activeElement),
    ),
    { viewport: viewport.label },
  );
  if (viewport.width < 500) await close.tap();
  else await close.press("Enter");
  await dialog.waitFor({ state: "hidden" });
  check(
    `${name}: touch/keyboard close restores focus`,
    await trigger.evaluate((element) => element === document.activeElement),
    { viewport: viewport.label },
  );
}
async function dashboard(page, viewport) {
  const titleRects = await page
    .locator(".dashboard-heading h1")
    .evaluate((element) => {
      const text = [...element.childNodes].find(
        (node) =>
          node.nodeType === Node.TEXT_NODE &&
          node.textContent.includes("Dashboard"),
      );
      const range = document.createRange();
      range.selectNodeContents(text);
      return [...range.getClientRects()].map((rect) => ({
        width: rect.width,
        y: rect.y,
      }));
    });
  check("Dashboard title stays on one line", titleRects.length === 1, {
    viewport: viewport.label,
    titleRects,
  });
  const members = page.locator(".dashboard-members");
  await members.scrollIntoViewIfNeeded();
  await layout(page, "dashboard-team", viewport, "members");
  await page
    .locator(".dashboard-team-title h3")
    .evaluate((element) => (element.textContent = "Alexandria".repeat(10)));
  await page
    .locator(".dashboard-member-name strong")
    .evaluateAll((elements) =>
      elements.forEach(
        (element) =>
          (element.textContent = "SyntheticLongMemberName".repeat(5)),
      ),
    );
  await layout(page, "dashboard-team", viewport, "members-long-DOM-fixture");
  const idea = page.locator(".dashboard-locked-idea");
  if (await idea.count()) {
    await idea
      .locator("h4")
      .evaluate(
        (element) => (element.textContent = "SyntheticLongIdeaTitle".repeat(5)),
      );
    await idea
      .locator("p")
      .evaluate(
        (element) =>
          (element.textContent = "SyntheticLongPrivateDescription"
            .repeat(16)
            .slice(0, 500)),
      );
    await idea.scrollIntoViewIfNeeded();
    await layout(page, "dashboard-team", viewport, "idea-long-DOM-fixture");
  }
}
async function menu(page, viewport) {
  const opener = page
    .locator(
      '.mobile-nav-toggle, .mobile-menu-toggle, .nav-toggle, .mobile-menu-trigger, button[aria-controls="mobile-navigation"]',
    )
    .first();
  if (!(await opener.count()) || !(await opener.isVisible())) return;
  await activate(page, opener, viewport);
  const dialog = page.getByRole("dialog", { name: "Navigation", exact: true });
  await dialog.waitFor({ state: "visible" });
  await layout(page, "navigation", viewport, "open");
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  check(
    "Navigation Escape restores focus",
    await opener.evaluate((element) => element === document.activeElement),
    { viewport: viewport.label },
  );
  await activate(page, opener, viewport);
  await page.goBack();
  await dialog.waitFor({ state: "hidden" });
  check(
    "Navigation browser Back restores focus",
    await opener.evaluate((element) => element === document.activeElement),
    { viewport: viewport.label },
  );
  await activate(page, opener, viewport);
  await dialog.waitFor({ state: "visible" });
  const logout = dialog.getByRole("button", { name: "Log out", exact: true });
  if (await logout.count()) {
    await logout.scrollIntoViewIfNeeded();
    await logout.focus();
    const bounds = await logout.boundingBox();
    check(
      "Navigation last action remains reachable",
      bounds.y >= 0 && bounds.y + bounds.height <= viewport.height,
      { viewport: viewport.label, bounds },
    );
  }
  const close = dialog.getByRole("button", {
    name: "Close navigation",
    exact: true,
  });
  if (viewport.width < 500) await close.tap();
  else await close.press("Enter");
  await dialog.waitFor({ state: "hidden" });
  check(
    "Navigation touch/keyboard close restores focus",
    await opener.evaluate((element) => element === document.activeElement),
    { viewport: viewport.label },
  );
}
async function session(viewport) {
  let context, zoomProfile;
  if (viewport.zoom) {
    zoomProfile = mkdtempSync(resolve(tmpdir(), "ddd-responsive-zoom-"));
    temporaryProfiles.add(zoomProfile);
    context = await chromium.launchPersistentContext(zoomProfile, {
      executablePath: "/usr/bin/chromium",
      headless: true,
      chromiumSandbox: false,
      viewport: null,
      args: ["--window-size=1440,900"],
      reducedMotion: "reduce",
      serviceWorkers: "block",
    });
    const settings = context.pages()[0];
    await settings.goto("chrome://settings/appearance");
    await settings.evaluate(() => {
      chrome.settingsPrivate.setDefaultZoom(2, () => {});
      return true;
    });
    await settings.close();
  } else
    context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      hasTouch: viewport.width < 500,
      isMobile: viewport.width < 500,
      reducedMotion: "reduce",
      serviceWorkers: "block",
    });
  activeContexts.add(context);
  await context.addCookies([
    {
      name: "portal_local_fixture",
      value: "alice",
      url: origin,
      httpOnly: true,
      sameSite: "Strict",
    },
  ]);
  await context.route("**/*", (route) => {
    const req = route.request(),
      url = new URL(req.url());
    if (
      url.origin !== origin ||
      (!["GET", "HEAD"].includes(req.method()) &&
        !url.pathname.startsWith("/__nextjs_"))
    ) {
      report.mutationsBlocked.push({
        method: req.method(),
        path: url.pathname,
      });
      save();
      return route.abort("blockedbyclient");
    }
    report.network.push({ method: req.method(), path: url.pathname });
    return route.continue();
  });
  const page = await context.newPage();
  if (viewport.zoom) {
    await page.goto(origin + "/profile", { waitUntil: "networkidle" });
    await page.waitForFunction(
      () => devicePixelRatio === 2 && innerWidth === 720,
    );
    const metrics = await page.evaluate(() => ({
      outerWidth,
      outerHeight,
      innerWidth,
      innerHeight,
      devicePixelRatio,
      visualViewportScale: visualViewport.scale,
    }));
    report.nativeZoom = metrics;
    assert.equal(metrics.outerWidth, 1440);
    assert.equal(metrics.innerWidth, 720);
    assert.equal(metrics.devicePixelRatio, 2);
    assert.equal(metrics.visualViewportScale, 1);
    viewport.width = metrics.innerWidth;
    viewport.height = metrics.innerHeight;
    check("Native browser zoom is 200% with reflow, not pinch zoom", true, {
      metrics,
    });
  }
  page.setDefaultTimeout(15000);
  page.on("pageerror", (error) => {
    report.errors.push({ error: error.message });
    save();
  });
  return { page, context, zoomProfile };
}

try {
  const viewports = process.env.QA_BASELINE_ONLY
    ? [{ label: "320x640", width: 320, height: 640 }]
    : [
        { label: "320x640", width: 320, height: 640 },
        { label: "390x480", width: 390, height: 480 },
        { label: "390x844", width: 390, height: 844 },
        { label: "768x1024", width: 768, height: 1024 },
        { label: "1440x900", width: 1440, height: 900 },
        { label: "native-200pct", width: 720, height: 450, zoom: true },
      ];
  for (const viewport of viewports) {
    const { page, context, zoomProfile } = await session(viewport);
    for (const [name, path] of [
      ["profile", "/profile"],
      ["dashboard-team", "/dashboard"],
      ["participants", "/discover/participants"],
      ["teams", "/discover/teams"],
    ]) {
      const completion = `${viewport.label}:${name}`;
      if (report.completedSurfaces?.includes(completion)) continue;
      await page.goto(origin + path, {
        waitUntil: "networkidle",
        timeout: 60000,
      });
      await page
        .locator(
          name === "profile"
            ? '.profile-flow[data-hydrated="true"]'
            : '.app-shell[data-hydrated="true"]',
        )
        .waitFor();
      await page.evaluate(() => document.fonts.ready);
      const baseline = await capture(page, name, viewport);
      report.checks.push({
        name,
        viewport: viewport.label,
        state: "baseline",
        passed: baseline.scrollWidth <= viewport.width,
        dimensions: baseline,
      });
      save();
      if (!process.env.QA_BASELINE_ONLY) {
        if (name === "profile") await profile(page, viewport);
        if (name === "dashboard-team") await dashboard(page, viewport);
        if (name === "participants" || name === "teams")
          await discovery(page, viewport, name === "participants");
        if (name === "participants") await menu(page, viewport);
      }
      (report.completedSurfaces ||= []).push(completion);
      save();
    }
    await context.close();
    activeContexts.delete(context);
    if (zoomProfile) rmSync(zoomProfile, { recursive: true, force: true });
  }
} catch (error) {
  report.errors.push({ error: String(error.stack || error) });
  process.exitCode = 1;
} finally {
  await browser.close();
  for (const context of activeContexts) await context.close();
  for (const profile of temporaryProfiles)
    rmSync(profile, { recursive: true, force: true });
  report.finishedAt = new Date().toISOString();
  save();
}
console.log(
  JSON.stringify(
    {
      screenshots: report.screenshots.length,
      errors: report.errors,
      overflows: report.checks.filter((c) => !c.passed),
    },
    null,
    2,
  ),
);
