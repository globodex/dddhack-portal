// First-tap owner navigation regression, using only synthetic local GET/HEAD.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, expect } from "@playwright/test";

const root = "/workspace/dddhack-portal",
  origin = "http://localhost:3000";
const fix = "7cb01dca612a279eee233f671937f546da6a1838";
const output = resolve("evidence/owner-mobile-account-navigation-7cb01dc");
mkdirSync(output, { recursive: true });
const git = (...args) =>
  execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const sha = (source) => createHash("sha256").update(source).digest("hex");
const navPart = (portal) => {
  const menu = portal.match(
    /<MobileNavigation open=\{menu\}[\s\S]*?<\/MobileNavigation>/,
  )?.[0];
  const navigate = portal.match(
    /function navigate\(event: \{ preventDefault\(\): void \}, destination: string\) \{[\s\S]*?\n  \}/,
  )?.[0];
  assert.ok(menu && navigate, "Navigation source boundaries must be present");
  return menu + "\n" + navigate;
};
const files = [
  "app/dialog-history.ts",
  "app/mobile-navigation.tsx",
  "app/[[...path]]/portal-client.tsx",
];
const fingerprints = () =>
  Object.fromEntries([
    ...files.map((file) => [file, sha(readFileSync(resolve(root, file)))]),
    [
      "app/portal.tsx account-menu/navigation slice",
      sha(navPart(readFileSync(resolve(root, "app/portal.tsx"), "utf8"))),
    ],
  ]);
const expected = Object.fromEntries([
  ...files.map((file) => [
    file,
    sha(execFileSync("git", ["show", `${fix}:${file}`], { cwd: root })),
  ]),
  [
    "app/portal.tsx account-menu/navigation slice",
    sha(
      navPart(
        execFileSync("git", ["show", `${fix}:app/portal.tsx`], {
          cwd: root,
          encoding: "utf8",
        }),
      ),
    ),
  ],
]);
assert.deepEqual(
  fingerprints(),
  expected,
  "Account navigation must match the supplied fix",
);
const report = {
  source: git("rev-parse", "HEAD"),
  navigationFix: fix,
  origin,
  viewport: { width: 390, height: 844 },
  syntheticOnly: true,
  readOnly: true,
  startedAt: new Date().toISOString(),
  fingerprints: expected,
  dirtyAtStart: git("status", "--porcelain"),
  checks: [],
  screenshots: [],
  traces: [],
  requests: [],
  errors: [],
  blocked: [],
  limitations: [
    "Emulated390px touch in container Chromium; not real managed sign-in or a physical device.",
    "No reveal, save, logout or other application mutation is activated.",
    "Full source HEAD and navigation-only fingerprints are recorded because unrelated publish-warning work may share portal.tsx.",
  ],
};
const save = () =>
  writeFileSync(
    resolve(output, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
const check = (name, passed, details = {}) => {
  report.checks.push({ name, passed, ...details });
  save();
  assert.ok(passed, name);
};
let browser, currentPage, currentLabel;
const contexts = new Set();
async function context(label) {
  const context = await browser.newContext({
    viewport: report.viewport,
    isMobile: true,
    hasTouch: true,
    reducedMotion: "reduce",
    serviceWorkers: "block",
  });
  contexts.add(context);
  await context.addCookies([
    {
      name: "portal_local_fixture",
      value: "owner",
      url: origin,
      httpOnly: true,
      sameSite: "Strict",
    },
  ]);
  await context.addInitScript(() => {
    window.__navTrace = [];
    const mark = (type, detail = {}) =>
      window.__navTrace.push({
        type,
        t: performance.now(),
        path: location.pathname,
        search: location.search,
        scrollY,
        dialog: history.state?.portalDialog || null,
        focus:
          document.activeElement?.getAttribute("aria-label") ||
          document.activeElement?.textContent?.trim().slice(0, 60),
        ...detail,
      });
    for (const method of [
      "pushState",
      "replaceState",
      "back",
      "forward",
      "go",
    ]) {
      const original = history[method].bind(history);
      history[method] = function (...args) {
        mark(`history.${method}:before`, {
          destination: typeof args[2] === "string" ? args[2] : null,
        });
        const result = original(...args);
        mark(`history.${method}:after`);
        return result;
      };
    }
    addEventListener("popstate", (event) =>
      mark("popstate", { nextDialog: event.state?.portalDialog || null }),
    );
    addEventListener("pageshow", () => mark("pageshow"));
    addEventListener("pagehide", () => mark("pagehide"));
    document.addEventListener(
      "click",
      (event) => {
        const target = event.target.closest("a,button");
        if (target)
          mark("click", {
            text: target.textContent?.trim(),
            href: target.getAttribute("href"),
            insideMenu: !!target.closest("#mobile-navigation"),
          });
      },
      true,
    );
    window.__markNav = mark;
  });
  await context.route("**/*", (route) => {
    const req = route.request(),
      url = new URL(req.url());
    if (
      url.origin !== origin ||
      (!["GET", "HEAD"].includes(req.method()) &&
        !url.pathname.startsWith("/__nextjs_"))
    ) {
      report.blocked.push({ label, method: req.method(), path: url.pathname });
      save();
      return route.abort("blockedbyclient");
    }
    report.requests.push({
      label,
      method: req.method(),
      path: url.pathname,
      search: url.search,
      type: req.resourceType(),
    });
    return route.continue();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  currentPage = page;
  currentLabel = label;
  page.on("pageerror", (error) => {
    report.errors.push({ label, error: error.message });
    save();
  });
  return { context, page };
}
async function ready(page, path) {
  await expect(page).toHaveURL(
    new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?:\\?.*)?$"),
    { timeout: 20000 },
  );
  await page.locator('.app-shell[data-hydrated="true"]').waitFor();
  await page.evaluate(() => document.fonts.ready);
}
async function shot(page, name) {
  const file = name + ".png";
  await page
    .locator("img:visible")
    .evaluateAll((images) =>
      Promise.all(images.map((image) => image.decode())),
    );
  await page.screenshot({
    path: resolve(output, file),
    animations: "disabled",
    style: "nextjs-portal{visibility:hidden!important}",
  });
  report.screenshots.push({
    file,
    path: new URL(page.url()).pathname,
    source: report.source,
    navigationFix: fix,
    inspected: false,
  });
  save();
}
async function trace(page, label) {
  report.traces.push({
    label,
    url: page.url(),
    events: await page.evaluate(() => window.__navTrace),
  });
  save();
}
const opener = (page) =>
  page.locator('.mobile-header button[aria-controls="mobile-navigation"]');
const dialog = (page) =>
  page.getByRole("dialog", { name: "Navigation", exact: true });
async function open(page) {
  await opener(page).tap();
  await expect(dialog(page)).toBeVisible();
  await page.waitForFunction(() => !!history.state?.portalDialog);
}

try {
  browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    headless: true,
    chromiumSandbox: false,
  });
  report.browser = browser.version();
  for (const [label, name, destination] of [
    ["workspace", "Workspace", "/dashboard"],
    ["profile", "Your profile", "/profile"],
  ]) {
    const { context: ctx, page } = await context(label);
    await page.goto(origin + "/admin/participants", {
      waitUntil: "networkidle",
      timeout: 60000,
    });
    await ready(page, "/admin/participants");
    await page.goto(origin + "/admin/credits", {
      waitUntil: "networkidle",
      timeout: 60000,
    });
    await ready(page, "/admin/credits");
    if (label === "workspace") await shot(page, "01-owner-credits-before");
    await open(page);
    const target = dialog(page).getByRole("link", { name, exact: true });
    await expect(target).toHaveAttribute("href", destination);
    await target.scrollIntoViewIfNeeded();
    if (label === "workspace") await shot(page, "02-owner-menu-workspace");
    await page.evaluate(
      (label) => window.__markNav("FIRST_TAP_START", { label }),
      label,
    );
    // Exactly one touch activation. A lost first tap must fail, not be retried.
    await target.tap();
    try {
      await ready(page, destination);
      await page
        .locator(
          destination === "/dashboard" ? ".dashboard-v6" : ".profile-flow",
        )
        .waitFor();
      await page.waitForLoadState("networkidle");
      assert.equal(new URL(page.url()).pathname, destination);
    } catch (error) {
      await shot(page, `${label}-FIRST-TAP-FAIL`);
      await trace(page, `${label}-first-tap-failure`);
      throw error;
    }
    await expect(dialog(page)).not.toBeVisible();
    const clicks = await page.evaluate(
      (href) =>
        window.__navTrace.filter(
          (event) =>
            event.type === "click" && event.href === href && event.insideMenu,
        ).length,
      destination,
    );
    check(`${name}: first tap reaches${destination} once`, clicks === 1, {
      destination,
      clicks,
      url: page.url(),
    });
    await shot(
      page,
      label === "workspace"
        ? "03-workspace-first-tap-dashboard"
        : "07-profile-first-tap-profile",
    );
    await trace(page, `${label}-first-tap-success`);
    await page.goBack();
    await ready(page, "/admin/credits");
    await expect(dialog(page)).not.toBeVisible();
    check(
      `${name}: one browser Back returns to Credits with closed menu`,
      new URL(page.url()).pathname === "/admin/credits",
    );
    await trace(page, `${label}-back-to-credits`);
    if (label === "workspace") {
      await page.evaluate(() =>
        scrollTo(
          0,
          Math.min(200, document.documentElement.scrollHeight - innerHeight),
        ),
      );
      const initial = await page.evaluate(() => ({
        scrollY,
        body: getComputedStyle(document.body).overflow,
        html: getComputedStyle(document.documentElement).overflow,
      }));
      await open(page);
      await page.mouse.move(200, 300);
      await page.mouse.wheel(0, 400);
      const whileOpen = await page.evaluate(() => ({
        scrollY,
        body: getComputedStyle(document.body).overflow,
        html: getComputedStyle(document.documentElement).overflow,
      }));
      check(
        "Menu prevents background scrolling",
        whileOpen.scrollY === initial.scrollY &&
          whileOpen.body === "hidden" &&
          whileOpen.html === "hidden",
        { initial, whileOpen },
      );
      await page.keyboard.press("Escape");
      await expect(dialog(page)).not.toBeVisible();
      await page.waitForFunction(() => !history.state?.portalDialog);
      await expect(opener(page)).toBeFocused();
      const escaped = await page.evaluate(() => ({
        scrollY,
        body: getComputedStyle(document.body).overflow,
        html: getComputedStyle(document.documentElement).overflow,
      }));
      check(
        "Escape retains Credits route/scroll and restores opener focus/overflow",
        new URL(page.url()).pathname === "/admin/credits" &&
          escaped.scrollY === initial.scrollY &&
          escaped.body === initial.body &&
          escaped.html === initial.html,
        { escaped },
      );
      await shot(page, "04-escape-restores-credits-focus");
      await trace(page, "escape-restoration");
      await open(page);
      await page.goBack();
      await expect(dialog(page)).not.toBeVisible();
      await ready(page, "/admin/credits");
      await expect(opener(page)).toBeFocused();
      check(
        "Back dismisses open menu without leaving Credits",
        new URL(page.url()).pathname === "/admin/credits",
      );
      await shot(page, "05-back-dismisses-menu-focus");
      await trace(page, "menu-back-restoration");
      await open(page);
      await dialog(page)
        .getByRole("button", { name: "Close navigation", exact: true })
        .tap();
      await expect(dialog(page)).not.toBeVisible();
      await page.waitForFunction(() => !history.state?.portalDialog);
      await expect(opener(page)).toBeFocused();
      check(
        "Touch close retains route and restores opener focus",
        new URL(page.url()).pathname === "/admin/credits",
      );
      await trace(page, "touch-close-restoration");
    }
    await ctx.close();
    contexts.delete(ctx);
  }
  assert.deepEqual(
    fingerprints(),
    expected,
    "Navigation source changed during capture",
  );
  report.revisionAtEnd = git("rev-parse", "HEAD");
  report.dirtyAtEnd = git("status", "--porcelain");
  check(
    "No page error or blocked application mutation occurred",
    report.errors.length === 0 && report.blocked.length === 0,
  );
  report.result = "passed";
} catch (error) {
  report.result = "failed";
  report.failure = String(error.stack || error);
  if (currentPage && !currentPage.isClosed()) {
    await trace(currentPage, `${currentLabel}-final-failure`);
    try {
      await shot(currentPage, `${currentLabel}-FINAL-FAIL`);
    } catch {}
  }
  process.exitCode = 1;
} finally {
  for (const ctx of contexts) await ctx.close();
  await browser?.close();
  report.browserClosed = true;
  report.finishedAt = new Date().toISOString();
  save();
}
console.log(
  JSON.stringify(
    {
      result: report.result,
      checks: report.checks.length,
      screenshots: report.screenshots.length,
      failure: report.failure,
    },
    null,
    2,
  ),
);
