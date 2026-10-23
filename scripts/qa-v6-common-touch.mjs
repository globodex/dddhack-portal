// Artifact-gated control inventory for Common/Home/Profile/Dashboard only.
// Named fake identities and disposable localhost D1; no hosted traffic.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import {
  chromium,
  devices,
} from "/tmp/ddehack-playwright-runner/node_modules/playwright/index.mjs";
assert.ok(
  process.argv.includes("--preview-ready"),
  "Root must release the browser hold",
);
const source = process.env.BUILD_HEAD,
  worker = process.env.WORKER_SHA;
assert.match(source || "", /^[a-f0-9]{40}$/i);
assert.match(worker || "", /^[a-f0-9]{64}$/i);
const artifact = resolve(process.env.ARTIFACT_ROOT || process.cwd());
const hash = () =>
  createHash("sha256")
    .update(readFileSync(join(artifact, "dist/server/index.js")))
    .digest("hex");
assert.equal(
  hash(),
  worker,
  "Compiled Worker must match root-confirmed artifact",
);
const origin = "http://127.0.0.1:4173";
const base = resolve("evidence/v6-common-touch");
mkdirSync(base, { recursive: true });
const output = mkdtempSync(join(base, source.slice(0, 7) + "-"));
const ownerEmail = /OWNER_EMAIL = ["']([^"']+)/.exec(
  readFileSync(join(artifact, "lib/identity.ts"), "utf8"),
)?.[1];
assert.ok(ownerEmail, "Local configured owner simulation unavailable");
const report = {
  source,
  worker,
  runnerSha: createHash("sha256")
    .update(readFileSync(new URL(import.meta.url)))
    .digest("hex"),
  origin,
  output,
  sandbox: true,
  syntheticOnly: true,
  physicalDeviceTest: false,
  inventory: [],
  controls: [],
  screenshots: [],
  failures: [],
  pageErrors: [],
  expectedExternalBoundaries: [],
  unexpectedBlocks: [],
  writes: [],
  controlledFailures: [],
  authBoundaries: [],
  browserClosed: false,
  homeRecheckOnly: process.env.QA_RECHECK_HOME === "1",
  gapPhase: process.env.QA_GAPS === "1",
  managedAuthenticationProof: false,
  actualProfileSaves: 0,
};
const persist = () =>
  writeFileSync(join(output, "report.json"), JSON.stringify(report, null, 2));
const browser = await chromium.launch({
  headless: true,
  chromiumSandbox: true,
});
report.browser = browser.version();
const modes = [
  {
    name: "mobile-touch",
    input: "touch",
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    userAgent: devices["Pixel 7"].userAgent,
  },
  {
    name: "tablet-touch",
    input: "touch",
    viewport: { width: 834, height: 1194 },
    isMobile: true,
    hasTouch: true,
    userAgent: devices["iPad Pro 11"].userAgent,
  },
  {
    name: "desktop-mouse",
    input: "mouse",
    viewport: { width: 1440, height: 900 },
    isMobile: false,
    hasTouch: false,
  },
];
if (report.gapPhase)
  modes.push({ ...modes[2], name: "desktop-keyboard", input: "keyboard" });
const actors = [
  { name: "anonymous" },
  { name: "alice", role: "participant" },
  { name: "stranger", role: "viewer" },
  { name: "bob", role: "participant-pending-locked" },
  { name: "admin", role: "admin" },
  { name: "owner", role: "owner" },
  { name: "judge", role: "assigned-judge" },
  { name: "mentor", role: "mentor" },
  { name: "volunteer", role: "volunteer" },
];
function record(c, control, status, detail = {}, aliases = []) {
  const entry = {
    route: c.route,
    role: c.actor.role || c.actor.name,
    actor: c.actor.name,
    inputMode: c.mode.name,
    control,
    semanticId:
      detail.semanticId ||
      "control:" + control.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    status,
    aliases,
    ...detail,
  };
  report.controls.push(entry);
  for (const item of report.inventory)
    if (
      item.route === c.route &&
      item.actor === c.actor.name &&
      item.inputMode === c.mode.name &&
      item.status === "untested" &&
      [control, ...aliases].includes(item.name)
    ) {
      item.status = status;
      item.evidence = control;
    }
  persist();
}
async function check(c, control, operation, aliases = []) {
  try {
    const detail = await operation();
    record(c, control, "positive", detail || {}, aliases);
  } catch (error) {
    const failure = {
      route: c.route,
      actor: c.actor.name,
      inputMode: c.mode.name,
      control,
      error: error.message,
    };
    report.failures.push(failure);
    record(c, control, "failed", { error: error.message }, aliases);
  }
}
async function inventory(c, state) {
  const rows = await c.page
    .locator("a[href],button,input,select,textarea,summary")
    .evaluateAll((nodes) =>
      nodes
        .filter((el) => {
          const s = getComputedStyle(el),
            r = el.getBoundingClientRect();
          return (
            s.display !== "none" &&
            s.visibility !== "hidden" &&
            r.width &&
            r.height &&
            !el.closest("[hidden]") &&
            (!el.closest(".sidebar") ||
              getComputedStyle(el.closest(".sidebar")).display !== "none")
          );
        })
        .map((el) => {
          const label =
            el.getAttribute("aria-label") ||
            el.getAttribute("title") ||
            (el.labels?.length
              ? [...el.labels].map((x) => x.textContent.trim()).join(" ")
              : el.textContent.trim()) ||
            el.getAttribute("name") ||
            el.tagName.toLowerCase();
          const u = el instanceof HTMLAnchorElement ? new URL(el.href) : null;
          const normalizedLabel = label.replace(/\s+/g, " ").slice(0, 150);
          const semanticId =
            el.matches('input[type="radio"]') &&
            ["avatarExpression", "avatarColor"].includes(el.name)
              ? "profile:" + el.name + ":" + el.value
              : el.matches('input[type="radio"][name="sex"]')
                ? "profile:sex:" + normalizedLabel.toLowerCase()
                : el.matches('select[name="bestDescription"]')
                  ? "profile:description"
                  : el.matches(".profile-platform-select select")
                    ? "profile:social:platform"
                    : u &&
                        el.closest(
                          "#site-navigation,#public-navigation,.account-controls,.mobile-header,.public-header,.sidebar",
                        )
                      ? "shared-nav:" +
                        u.pathname +
                        ":" +
                        normalizedLabel
                          .toLowerCase()
                          .replace(/[^a-z0-9]+/g, "-")
                      : "control:" +
                        normalizedLabel
                          .toLowerCase()
                          .replace(/[^a-z0-9]+/g, "-");
          return {
            semanticId,
            name: normalizedLabel,
            tag: el.tagName.toLowerCase(),
            type: el.getAttribute("type"),
            disabled:
              el.matches(":disabled") ||
              el.getAttribute("aria-disabled") === "true",
            href: u
              ? {
                  origin: u.origin,
                  path: /whatsapp|wa\.me/.test(u.hostname)
                    ? "/[synthetic-contact]"
                    : u.pathname,
                }
              : null,
          };
        }),
    );
  for (const row of rows)
    report.inventory.push({
      route: c.route,
      actor: c.actor.name,
      role: c.actor.role || c.actor.name,
      inputMode: c.mode.name,
      state,
      ...row,
      status: row.disabled ? "disabled" : "untested",
      reason: row.disabled
        ? "Actual rendered disabled state"
        : "No activation recorded yet; forming-team writes and other assigned lanes remain delegated",
    });
  persist();
}
async function session(actor, mode) {
  const context = await browser.newContext({
    viewport: mode.viewport,
    isMobile: mode.isMobile,
    hasTouch: mode.hasTouch,
    ...(mode.userAgent ? { userAgent: mode.userAgent } : {}),
    deviceScaleFactor: 1,
    serviceWorkers: "block",
  });
  const c = {
    actor,
    mode,
    context,
    route: "/",
    failView: false,
    failReveal: false,
    failHistory: false,
    failProfile: false,
    me: null,
    loggedOut: false,
    viewResults: [],
  };
  if (actor.name === "alice")
    await context.grantPermissions(["clipboard-read", "clipboard-write"], {
      origin,
    });
  context.on("page", (page) => {
    page.on("pageerror", (error) =>
      report.pageErrors.push({
        actor: actor.name,
        mode: mode.name,
        error: error.message,
      }),
    );
  });
  await context.route("**/*", async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    if (url.origin !== origin) {
      report.expectedExternalBoundaries.push({
        actor: actor.name,
        mode: mode.name,
        method: request.method(),
        origin: url.origin,
        kind: /whatsapp|wa\.me/.test(url.hostname)
          ? "WhatsApp href boundary"
          : "External href boundary",
      });
      return route.abort("blockedbyclient");
    }
    if (
      request.method() === "GET" &&
      ["/signin-with-chatgpt", "/signout-with-chatgpt"].includes(url.pathname)
    ) {
      if (url.pathname === "/signout-with-chatgpt") c.loggedOut = true;
      report.authBoundaries.push({
        actor: actor.name,
        mode: mode.name,
        path: url.pathname,
        returnTo: url.searchParams.get("return_to"),
      });
      return route.fulfill({
        status: 200,
        contentType: "text/html",
        body:
          "<!doctype html><title>Synthetic auth boundary</title><h1>" +
          (url.pathname === "/signout-with-chatgpt"
            ? "Sign-out boundary"
            : "Sign-in boundary") +
          "</h1>",
      });
    }
    if (
      request.method() === "GET" &&
      url.pathname === "/api/portal" &&
      ((c.failHistory && url.searchParams.get("view") === "/project-history") ||
        (c.failView && url.searchParams.get("view") === "/dashboard"))
    ) {
      const kind = c.failHistory ? "history" : "dashboard";
      c.failHistory = false;
      c.failView = false;
      report.controlledFailures.push({
        actor: actor.name,
        mode: mode.name,
        kind,
      });
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        headers: { "cache-control": "no-store" },
        body: JSON.stringify({
          code: "SYNTHETIC_QA_FAILURE",
          message: "Synthetic QA service unavailable.",
        }),
      });
    }
    if (!["GET", "HEAD"].includes(request.method())) {
      let body;
      try {
        body = JSON.parse(request.postData() || "{}");
      } catch {}
      const fakeActor =
        actor.name === "alice" &&
        request.method() === "POST" &&
        url.pathname === "/api/portal";
      if (report.gapPhase && body?.action === "local-signout") {
        c.loggedOut = true;
        report.authBoundaries.push({
          actor: actor.name,
          mode: mode.name,
          path: "local-signout",
          controlled: true,
          managedAuthenticationProof: false,
        });
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            message: "Synthetic local sign-out boundary",
          }),
        });
      }
      if (
        report.gapPhase &&
        fakeActor &&
        body?.action === "complete-profile" &&
        process.argv.includes("--fresh-write-phase") &&
        process.argv.includes("--save-synthetic-profile") &&
        report.actualProfileSaves === 0
      ) {
        report.actualProfileSaves++;
        report.writes.push({
          actor: "fake_alice",
          mode: mode.name,
          action: "complete-profile",
          freshWritePhase: true,
        });
        return route.continue({
          headers: {
            ...request.headers(),
            "oai-authenticated-user-id": "fake_alice",
            "oai-authenticated-user-email": "alice@portal.test",
          },
        });
      }
      if (fakeActor && body?.action === "complete-profile" && c.failProfile) {
        c.failProfile = false;
        report.controlledFailures.push({
          actor: "alice",
          mode: mode.name,
          kind: "profile-save",
        });
        return route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            message: "Synthetic profile save unavailable.",
          }),
        });
      }
      if (
        report.gapPhase ||
        !fakeActor ||
        body?.action !== "reveal-credit" ||
        body?.data?.typeId !== "fake_credit"
      ) {
        report.unexpectedBlocks.push({
          actor: actor.name,
          mode: mode.name,
          action: body?.action || "unknown",
          method: request.method(),
        });
        return route.abort("blockedbyclient");
      }
      if (c.failReveal) {
        c.failReveal = false;
        report.controlledFailures.push({
          actor: "alice",
          mode: mode.name,
          kind: "credit-reveal",
        });
        return route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            message: "Synthetic allocation reveal unavailable.",
          }),
        });
      }
      report.writes.push({
        actor: "fake_alice",
        mode: mode.name,
        action: "reveal-credit",
        typeId: "fake_credit",
      });
    }
    const headers = { ...request.headers() };
    if (actor.name !== "anonymous" && !c.loggedOut) {
      headers["oai-authenticated-user-id"] = "fake_" + actor.name;
      headers["oai-authenticated-user-email"] =
        actor.name === "owner" ? ownerEmail : actor.name + "@portal.test";
    }
    return route.continue({ headers });
  });
  c.page = await context.newPage();
  c.page.setDefaultTimeout(7000);
  c.page.on("response", async (response) => {
    const u = new URL(response.url());
    if (
      u.origin === origin &&
      u.pathname === "/api/portal" &&
      response.request().method() === "GET"
    ) {
      try {
        const b = await response.json();
        c.me = b.me
          ? {
              id: b.me.id,
              role: b.me.role,
              mode: b.me.mode,
              owner: !!b.me.owner,
            }
          : null;
        c.viewResults.push({
          view: u.searchParams.get("view"),
          status: response.status(),
          code: b.code || null,
          identity: c.me,
        });
      } catch {}
    }
  });
  return c;
}
async function go(c, path) {
  c.route = new URL(path, origin).pathname;
  await c.page.goto(origin + path, {
    waitUntil: "networkidle",
    timeout: 18000,
  });
  await c.page.evaluate(() => document.fonts.ready);
}
async function activate(c, locator) {
  await locator.scrollIntoViewIfNeeded();
  if (c.mode.hasTouch) await locator.tap({ timeout: 7000, noWaitAfter: true });
  else if (c.mode.input === "keyboard") {
    const input = await locator.evaluate((el) =>
      el.matches("input,select,textarea,button,a,summary") ? true : false,
    );
    const target = input
      ? locator
      : (await locator.locator("input").count())
        ? locator.locator("input").first()
        : locator;
    await target.focus();
    const kind = await target.evaluate((el) => ({
      tag: el.tagName,
      type: el.getAttribute("type"),
    }));
    await target.press(
      kind.tag === "INPUT" && ["radio", "checkbox"].includes(kind.type)
        ? "Space"
        : "Enter",
    );
  } else await locator.click({ timeout: 7000, noWaitAfter: true });
}
async function capture(c, label) {
  assert.equal(
    await c.page.locator('code[aria-label="Your private allocation"]').count(),
    0,
    "Every capture requires allocation masking",
  );
  const path = join(output, `${c.mode.name}-${c.actor.name}-${label}.png`);
  await c.page.screenshot({ path, fullPage: false, animations: "disabled" });
  report.screenshots.push({
    path,
    role: c.actor.role || c.actor.name,
    route: c.route,
    inputMode: c.mode.name,
    original: true,
    inspected: false,
  });
  persist();
}
async function closePopups(c) {
  for (const page of c.context.pages()) if (page !== c.page) await page.close();
}
async function tapExternal(c, locator) {
  const href = await locator.getAttribute("href"),
    u = new URL(href, origin);
  assert.equal(u.protocol, "https:");
  assert.equal(u.username, "");
  assert.equal(u.password, "");
  const previous = report.expectedExternalBoundaries.length;
  await activate(c, locator);
  await c.page.waitForTimeout(120);
  await closePopups(c);
  assert.ok(
    report.expectedExternalBoundaries.length > previous,
    "External destination must be blocked before fetch",
  );
  return { safeHref: true, externalFetchBlocked: true };
}
async function commonNav(c) {
  await inventory(c, "navigation-default");
  const toggle = c.page
    .getByRole("button", {
      name: /^(Open menu|Hide navigation|Show navigation)$/,
      exact: true,
    })
    .first();
  if ((await toggle.count()) && (await toggle.isVisible()))
    await check(
      c,
      "Navigation toggle",
      async () => {
        const label = await toggle.getAttribute("aria-expanded");
        await activate(c, toggle);
        const other = c.page
          .getByRole("button", {
            name: /^(Close menu|Hide navigation|Show navigation)$/,
            exact: true,
          })
          .first();
        assert.notEqual(await other.getAttribute("aria-expanded"), label);
        await inventory(c, "navigation-toggled");
        await activate(c, other);
        assert.equal(
          await c.page
            .getByRole("button", {
              name: /^(Open menu|Hide navigation|Show navigation)$/,
              exact: true,
            })
            .first()
            .getAttribute("aria-expanded"),
          label,
        );
      },
      ["Open menu", "Close menu", "Hide navigation", "Show navigation"],
    );
}
async function home(c, full) {
  await go(c, "/");
  await inventory(c, "home-original");
  if (full) await capture(c, "home-original");
  await check(
    c,
    c.actor.name === "anonymous"
      ? "Continue with ChatGPT"
      : "Open your Dashboard",
    async () => {
      const expected =
        c.actor.name === "anonymous"
          ? "Continue with ChatGPT"
          : "Open your Dashboard";
      const cta = c.page.locator(".primary-cta");
      assert.equal((await cta.innerText()).trim(), expected);
      await cta.scrollIntoViewIfNeeded();
      const hit = await cta.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return el.contains(
          document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2),
        );
      });
      assert.ok(hit, "CTA center must hit the actual link");
      await activate(c, cta);
      if (c.actor.name === "anonymous") {
        await c.page
          .getByRole("heading", { name: "Sign-in boundary", exact: true })
          .waitFor();
        assert.equal(new URL(c.page.url()).pathname, "/signin-with-chatgpt");
      } else {
        await c.page.waitForURL(origin + "/dashboard");
        if (["stranger", "mentor", "volunteer"].includes(c.actor.name)) {
          await c.page
            .getByRole("alert")
            .filter({
              hasText: "Please sign in with your Luma-registered email",
            })
            .waitFor();
          assert.equal(
            await c.page
              .locator(".dashboard-member-phone,.dashboard-venue,.profile-flow")
              .count(),
            0,
          );
          return {
            actualTap: true,
            roleAwareDestination: true,
            physicalDevice: false,
            permissionBoundary: "LUMA_EMAIL_MISMATCH",
            fixtureLimit:
              "No rostered staff Dashboard proof from this identity",
          };
        }
        await c.page
          .locator(".dashboard-v6, .profile-flow, .form-actions")
          .first()
          .waitFor();
        assert.ok(
          c.me?.id?.startsWith("fake_"),
          "Named fake actor must survive Dashboard navigation",
        );
        assert.equal(c.me.id, "fake_" + c.actor.name);
      }
      return {
        actualTap: true,
        roleAwareDestination: true,
        physicalDevice: false,
      };
    },
  );
  await go(c, "/");
  const menu = c.page
    .getByRole("button", { name: "Open menu", exact: true })
    .first();
  if ((await menu.count()) && (await menu.isVisible()))
    await check(
      c,
      "Public menu toggle",
      async () => {
        await activate(c, menu);
        await inventory(c, "public-menu-open");
        assert.equal(
          await c.page.locator("#public-navigation").getAttribute("data-open"),
          "true",
        );
        await activate(
          c,
          c.page
            .getByRole("button", { name: "Close menu", exact: true })
            .first(),
        );
        assert.equal(
          await c.page.locator("#public-navigation").getAttribute("data-open"),
          "false",
        );
      },
      ["Open menu", "Close menu"],
    );
  if (!full) return;
  await check(
    c,
    "Pause / Resume animations",
    async () => {
      const button = c.page.getByRole("button", {
        name: /^(Pause|Resume) animations$/,
      });
      const initial = await button.getAttribute("aria-label");
      await activate(c, button);
      assert.notEqual(await button.getAttribute("aria-label"), initial);
      await activate(c, button);
      assert.equal(await button.getAttribute("aria-label"), initial);
    },
    ["Pause animations", "Resume animations"],
  );
  const summaries = c.page.locator(".public-faq summary");
  for (let i = 0; i < (await summaries.count()); i++)
    await check(c, (await summaries.nth(i).innerText()).trim(), async () => {
      const row = summaries.nth(i),
        was = await row.evaluate((el) => el.parentElement.open);
      await activate(c, row);
      assert.equal(await row.evaluate((el) => el.parentElement.open), !was);
      await activate(c, row);
      assert.equal(await row.evaluate((el) => el.parentElement.open), was);
    });
  await check(c, "Scroll to schedule", async () => {
    await c.page.evaluate(() => scrollTo(0, 0));
    const cue = c.page.getByRole("link", {
      name: "Scroll to schedule",
      exact: true,
    });
    await cue.evaluate((el) =>
      el.scrollIntoView({ block: "center", behavior: "instant" }),
    );
    const center = await cue.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return {
        x: r.left + r.width / 2,
        y: r.top + r.height / 2,
        hit: el.contains(
          document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2),
        ),
      };
    });
    assert.ok(center.hit, "Animated cue center must hit the link");
    if (c.mode.hasTouch) await c.page.touchscreen.tap(center.x, center.y);
    else await c.page.mouse.click(center.x, center.y);
    assert.equal(new URL(c.page.url()).hash, "#schedule");
  });
  const register = c.page.getByRole("link", { name: /^Register/ }).first();
  await check(c, "Register", async () => {
    await c.page.evaluate(() => scrollTo(0, 0));
    return tapExternal(c, register);
  });
}
async function tab(c, name) {
  await activate(c, c.page.getByRole("tab", { name, exact: true }));
  await c.page.getByRole("tabpanel", { name, exact: true }).waitFor();
  assert.equal(new URL(c.page.url()).hash, "#" + name.toLowerCase());
}
async function dashboard(c, full) {
  await go(c, "/dashboard");
  await inventory(c, "dashboard-original");
  if (full) await capture(c, "dashboard-original-masked");
  await commonNav(c);
  if (c.actor.name === "anonymous" || c.actor.name === "stranger") {
    await check(c, "Dashboard participation permission boundary", async () => {
      assert.equal(await c.page.getByRole("tab").count(), 0);
      assert.equal(
        await c.page
          .getByRole("button", { name: "Reveal my allocation", exact: true })
          .count(),
        0,
      );
      assert.equal(
        await c.page
          .locator(".dashboard-member-phone,.dashboard-venue,.profile-flow")
          .count(),
        0,
      );
    });
    return;
  }
  if (!(await c.page.getByRole("tab", { name: "Team", exact: true }).count())) {
    record(c, "Dashboard tabs", "untested", {
      reason:
        "Fixture produced no participant Dashboard tabs; inspect role-specific rendered inventory",
    });
    return;
  }
  for (const name of ["Credits", "Project", "Team"])
    await check(c, name, async () => {
      await tab(c, name);
      assert.equal(await c.page.getByRole("tabpanel").count(), 1);
      await inventory(c, "dashboard-" + name.toLowerCase());
    });
  if (c.actor.name === "bob")
    await check(c, "Private venue personal-approval boundary", async () => {
      assert.equal(await c.page.locator(".dashboard-venue").count(), 0);
    });
  if (c.actor.name !== "alice") {
    await tab(c, "Credits");
    await check(c, "Other actor allocation isolation", async () => {
      const reveals = c.page.getByRole("button", {
        name: "Reveal my allocation",
        exact: true,
      });
      for (let i = 0; i < (await reveals.count()); i++)
        assert.equal(await reveals.nth(i).isDisabled(), true);
      assert.equal(
        await c.page
          .locator('code[aria-label="Your private allocation"]')
          .count(),
        0,
      );
    });
    return;
  }
  await tab(c, "Team");
  const whatsapp = c.page.getByRole("link", {
    name: /^Open WhatsApp chat with/,
  });
  for (let i = 0; i < (await whatsapp.count()); i++) {
    const label = await whatsapp.nth(i).getAttribute("aria-label");
    await check(c, label, async () => tapExternal(c, whatsapp.nth(i)));
  }
  for (const link of await c.page
    .locator(".dashboard-member-links a:not(.dashboard-whatsapp)")
    .all())
    await check(c, await link.getAttribute("aria-label"), async () =>
      tapExternal(c, link),
    );
  const maps = c.page.getByRole("link", { name: "Google Maps", exact: true });
  if (await maps.count())
    await check(c, "Google Maps", async () => tapExternal(c, maps));
  await tab(c, "Credits");
  await inventory(c, "credits-masked");
  const reveal = () =>
    c.page
      .getByRole("button", { name: "Reveal my allocation", exact: true })
      .first();
  const copy = () =>
    c.page
      .getByRole("button", { name: "Copy allocation", exact: true })
      .first();
  const hide = () =>
    c.page
      .getByRole("button", { name: "Hide allocation", exact: true })
      .first();
  await check(
    c,
    "Copy allocation disabled until reveal",
    async () => assert.equal(await copy().isDisabled(), true),
    ["Copy allocation"],
  );
  await check(
    c,
    "Reveal my allocation / Copy / Hide",
    async () => {
      const response = c.page.waitForResponse(
        (r) =>
          r.request().method() === "POST" &&
          new URL(r.url()).pathname === "/api/portal",
      );
      await activate(c, reveal());
      assert.equal((await response).status(), 200);
      await c.page
        .locator('code[aria-label="Your private allocation"]')
        .waitFor();
      const value = await c.page
        .locator('code[aria-label="Your private allocation"]')
        .innerText();
      assert.ok(
        value.startsWith("SYNTHETIC-NOT-REDEEMABLE"),
        "Only the named fake allocation may be revealed",
      );
      await c.context.grantPermissions(["clipboard-read", "clipboard-write"], {
        origin,
      });
      await activate(c, copy());
      await c.page
        .getByRole("button", { name: "Copied allocation", exact: true })
        .waitFor();
      assert.ok(
        (await c.page.evaluate(() => navigator.clipboard.readText())) === value,
        "Fake allocation copy must match its visible value",
      );
      await c.page.evaluate(() => navigator.clipboard.writeText(""));
      await activate(c, hide());
      await c.page
        .locator('code[aria-label="Allocation hidden"]')
        .first()
        .waitFor();
      return {
        namedSyntheticOnly: true,
        clipboardCleared: true,
        revealedScreenshots: 0,
      };
    },
    [
      "Reveal my allocation",
      "Hide allocation",
      "Copy allocation",
      "Copied allocation",
    ],
  );
  await check(
    c,
    "Reveal error and recovery",
    async () => {
      c.failReveal = true;
      await activate(c, reveal());
      await c.page
        .getByRole("alert")
        .filter({ hasText: "Synthetic allocation reveal unavailable." })
        .waitFor();
      assert.equal(await copy().isDisabled(), true);
      await activate(c, reveal());
      await hide().waitFor();
      await tab(c, "Team");
      await tab(c, "Credits");
      assert.equal(
        await c.page
          .locator('code[aria-label="Your private allocation"]')
          .count(),
        0,
      );
    },
    ["Reveal my allocation"],
  );
  await check(
    c,
    "Copy error control",
    async () => {
      await activate(c, reveal());
      await hide().waitFor();
      await c.page.evaluate(() => {
        Object.defineProperty(navigator.clipboard, "writeText", {
          configurable: true,
          value: async () => {
            throw new Error("Synthetic clipboard denial");
          },
        });
      });
      await activate(c, copy());
      await c.page
        .getByRole("alert")
        .filter({ hasText: "Copy failed." })
        .waitFor();
      await activate(c, hide());
    },
    ["Copy allocation"],
  );
  await tab(c, "Project");
  await inventory(c, "project-summary");
  await check(c, "Dashboard votes read-only", async () =>
    assert.equal(
      await c.page.getByRole("button", { name: /^Upvote/ }).count(),
      0,
    ),
  );
  const opener = c.page
    .getByRole("button", { name: /^Versions [0-3]\/3$/ })
    .first();
  if (await opener.count()) {
    await check(
      c,
      "Versions history open / close / focus",
      async () => {
        await activate(c, opener);
        const dialog = c.page.locator(".project-history-dialog[open]");
        await dialog.waitFor();
        await dialog.locator(".history-version").first().waitFor();
        assert.ok((await dialog.locator(".history-version").count()) <= 3);
        await inventory(c, "history-open");
        await activate(
          c,
          dialog.getByRole("button", { name: "Close", exact: true }),
        );
        await dialog.waitFor({ state: "hidden" });
        assert.equal(
          await opener.evaluate((el) => el === document.activeElement),
          true,
        );
        await activate(c, opener);
        await c.page.keyboard.press("Escape");
        await dialog.waitFor({ state: "hidden" });
      },
      [await opener.innerText(), "Close"],
    );
    await check(c, "History error / close recovery", async () => {
      c.failHistory = true;
      await activate(c, opener);
      const dialog = c.page.locator(".project-history-dialog[open]");
      await dialog.getByRole("alert").waitFor();
      await activate(
        c,
        dialog.getByRole("button", { name: "Close", exact: true }),
      );
      await dialog.waitFor({ state: "hidden" });
    });
  }
  const edit = c.page.getByRole("button", {
    name: "Update project",
    exact: true,
  });
  if (await edit.count())
    record(c, "Update project", "delegated", {
      reason:
        "ProjectWizard lane owns editor and immutable submission attempts",
    });
  if (c.mode.input === "mouse")
    await check(c, "Dashboard tabs keyboard", async () => {
      const team = c.page.getByRole("tab", { name: "Team", exact: true });
      await team.focus();
      await c.page.keyboard.press("ArrowRight");
      assert.equal(
        await c.page
          .getByRole("tab", { name: "Credits", exact: true })
          .getAttribute("aria-selected"),
        "true",
      );
      await c.page.keyboard.press("End");
      assert.equal(
        await c.page
          .getByRole("tab", { name: "Project", exact: true })
          .getAttribute("aria-selected"),
        "true",
      );
      await c.page.keyboard.press("Home");
      assert.equal(await team.getAttribute("aria-selected"), "true");
    });
  await check(
    c,
    "Dashboard load error / Try again",
    async () => {
      c.failView = true;
      await go(c, "/dashboard");
      await c.page
        .getByRole("button", { name: "Try again", exact: true })
        .waitFor();
      await inventory(c, "dashboard-controlled-error");
      await activate(
        c,
        c.page.getByRole("button", { name: "Try again", exact: true }),
      );
      await c.page.getByRole("tab", { name: "Team", exact: true }).waitFor();
    },
    ["Try again"],
  );
}
async function profile(c) {
  await go(c, "/profile");
  await inventory(c, "profile-original");
  await capture(c, "profile-original");
  for (const name of ["avatarExpression", "avatarColor"]) {
    for (const input of await c.page.locator(`input[name="${name}"]`).all()) {
      const label = input.locator("..");
      const title = await label.getAttribute("title");
      await check(c, title, async () => {
        await activate(c, label);
        assert.equal(await input.isChecked(), true);
      });
    }
  }
  await check(c, "Read-only email", async () =>
    assert.equal(
      await c.page.locator('input[name="email"]').getAttribute("readonly"),
      "",
    ),
  );
  await check(
    c,
    "Next native required validation",
    async () => {
      const name = c.page.getByRole("textbox", {
        name: "Full name",
        exact: true,
      });
      const old = await name.inputValue();
      await name.fill("");
      await activate(
        c,
        c.page.getByRole("button", { name: "Next", exact: true }),
      );
      assert.equal(
        await c.page.locator(".profile-flow").getAttribute("data-step"),
        "1",
      );
      await name.fill(old);
    },
    ["Full name", "Next"],
  );
  await c.page
    .getByRole("textbox", { name: /^Bio/ })
    .fill("Synthetic touch audit profile");
  await activate(
    c,
    c.page
      .getByRole("radio", { name: "Non-binary", exact: true })
      .locator(".."),
  );
  await activate(c, c.page.getByRole("button", { name: "Next", exact: true }));
  await c.page.locator('.profile-flow[data-step="2"]').waitFor();
  await inventory(c, "profile-contact");
  const original = await c.page
    .locator(".profile-social-url input")
    .evaluateAll((nodes) => nodes.map((el) => el.value));
  await check(
    c,
    "Add another / platform select / social URL / remove",
    async () => {
      await activate(
        c,
        c.page.getByRole("button", { name: "Add another", exact: true }),
      );
      const last = c.page.locator(".profile-social-row").last(),
        select = last.locator("select");
      await activate(c, select);
      await c.page.keyboard.press("Escape");
      await select.selectOption("X");
      await last
        .locator('input[type="url"]')
        .fill("https://x.com/synthetic-touch-audit");
      await activate(c, last.getByRole("button", { name: /^Remove X link/ }));
      assert.deepEqual(
        await c.page
          .locator(".profile-social-url input")
          .evaluateAll((nodes) => nodes.map((el) => el.value)),
        original,
      );
      return {
        nativeSelect:
          "touch/mouse trigger plus Playwright native selectOption; no physical OS picker claim",
      };
    },
    ["Add another"],
  );
  await check(
    c,
    "Phone validation",
    async () => {
      const phone = c.page.getByRole("textbox", { name: /^Phone/ });
      const old = await phone.inputValue();
      await phone.fill("bad");
      await activate(
        c,
        c.page.getByRole("button", { name: "Next", exact: true }),
      );
      assert.equal(
        await c.page.locator(".profile-flow").getAttribute("data-step"),
        "2",
      );
      await phone.fill(old);
    },
    ["Phone", "Next"],
  );
  await activate(c, c.page.getByRole("button", { name: "Next", exact: true }));
  await c.page.locator('.profile-flow[data-step="3"]').waitFor();
  await inventory(c, "profile-about");
  await check(
    c,
    "About select / Organization / OpenAI org ID",
    async () => {
      const select = c.page.locator('select[name="bestDescription"]');
      await activate(c, select);
      await c.page.keyboard.press("Escape");
      await select.selectOption("College Student");
      await c.page
        .getByRole("textbox", { name: "Organization", exact: true })
        .fill("Synthetic touch audit");
      await c.page
        .getByRole("textbox", { name: "OpenAI org ID", exact: true })
        .fill("");
      assert.equal(await select.inputValue(), "College Student");
    },
    ["What best describes you?", "Organization", "OpenAI org ID"],
  );
  await check(c, "Find organization ID", async () =>
    tapExternal(
      c,
      c.page.getByRole("link", { name: "Find organization ID", exact: true }),
    ),
  );
  await check(
    c,
    "Back / Next retention",
    async () => {
      await activate(
        c,
        c.page.getByRole("button", {
          name: "Previous profile step",
          exact: true,
        }),
      );
      await c.page.locator('.profile-flow[data-step="2"]').waitFor();
      assert.deepEqual(
        await c.page
          .locator(".profile-social-url input")
          .evaluateAll((nodes) => nodes.map((el) => el.value)),
        original,
      );
      await activate(
        c,
        c.page.getByRole("button", { name: "Next", exact: true }),
      );
      await c.page.locator('.profile-flow[data-step="3"]').waitFor();
      assert.equal(
        await c.page
          .getByRole("textbox", { name: "Organization", exact: true })
          .inputValue(),
        "Synthetic touch audit",
      );
    },
    ["Previous profile step", "Next"],
  );
  await check(
    c,
    "Save controlled error / retained values",
    async () => {
      c.failProfile = true;
      await activate(
        c,
        c.page.getByRole("button", { name: "Save", exact: true }),
      );
      await c.page
        .getByRole("alert")
        .filter({ hasText: "Synthetic profile save unavailable." })
        .waitFor();
      assert.equal(
        await c.page
          .getByRole("button", { name: "Save", exact: true })
          .isEnabled(),
        true,
      );
      assert.equal(
        await c.page
          .getByRole("textbox", { name: "Organization", exact: true })
          .inputValue(),
        "Synthetic touch audit",
      );
      return {
        actualBackendWrite: false,
        successSave:
          "Deferred to explicit fresh write phase; prior semantic proof separately recorded",
      };
    },
    ["Save"],
  );
}
async function openNavigation(c) {
  const toggle = c.page
    .getByRole("button", { name: /^(Open menu|Show navigation)$/, exact: true })
    .first();
  if ((await toggle.count()) && (await toggle.isVisible()))
    await activate(c, toggle);
}
async function chooseNative(c, select, value) {
  const options = await select
    .locator("option")
    .evaluateAll((nodes) => nodes.map((el) => el.value));
  assert.ok(options.includes(value));
  if (c.mode.input === "keyboard") {
    await select.focus();
    await select.press("Home");
    for (let i = 0; i < options.indexOf(value); i++)
      await select.press("ArrowDown");
    await select.press("Escape");
  } else {
    await activate(c, select);
    await c.page.keyboard.press("Escape");
    await select.selectOption(value);
  }
  assert.equal(await select.inputValue(), value);
}
async function navigationGaps(c) {
  const descriptors = [],
    seen = new Set();
  const collect = async (path) => {
    await go(c, path);
    await openNavigation(c);
    await inventory(c, "shared-navigation-gap");
    const links = c.page.locator(
      "#site-navigation a:visible,.account-controls a:visible,.mobile-header a:visible,.sidebar>.brand:visible,#public-navigation a:visible,.public-header>.brand:visible",
    );
    for (let i = 0; i < (await links.count()); i++) {
      const item = await links.nth(i).evaluate((el) => ({
        href: el.getAttribute("href"),
        label: el.getAttribute("aria-label") || el.textContent.trim(),
        sourceArea: el.closest(".mobile-header")
          ? "workspace-header"
          : el.closest(".public-header")
            ? "public-header"
            : "sidebar",
      }));
      const key =
        path + "|" + item.sourceArea + "|" + item.href + "|" + item.label;
      if (!seen.has(key)) {
        seen.add(key);
        descriptors.push({ ...item, from: path });
      }
    }
  };
  await collect("/dashboard");
  await check(c, "Dashboard role boundary", async () => {
    const result = c.viewResults.findLast((row) => row.view === "/dashboard");
    if (c.actor.name === "anonymous") {
      if (result) {
        assert.equal(result.status, 401);
        assert.equal(result.code, "SIGN_IN_REQUIRED");
      } else {
        await c.page
          .getByRole("link", { name: "Sign in with ChatGPT", exact: true })
          .waitFor();
        assert.equal(
          await c.page
            .locator(
              ".dashboard-v6,.dashboard-member-phone,.dashboard-venue,.profile-flow",
            )
            .count(),
          0,
        );
      }
      return {
        semanticId: "auth:anonymous-dashboard-boundary",
        responseStatus: result?.status || null,
        boundary: result
          ? "API denial"
          : "Rendered sign-in recovery; redirected auth document intercepted",
        privateDataAllowed: false,
      };
    }
    assert.ok(result, "Dashboard response must be observed");
    if (c.actor.name === "stranger") {
      assert.equal(result.status, 403);
      assert.equal(result.code, "LUMA_EMAIL_MISMATCH");
      return {
        semanticId: "auth:unrostered-recovery",
        responseStatus: 403,
        privateDataAllowed: false,
      };
    }
    assert.equal(result.status, 200);
    if (c.actor.name !== "anonymous")
      assert.equal(result.identity?.id, "fake_" + c.actor.name);
    if (c.actor.name === "owner") assert.equal(result.identity?.owner, true);
    return {
      semanticId: "auth:dashboard-role",
      actualRole: result.identity?.role || "anonymous",
      injectedIdentitySession: true,
    };
  });
  await collect("/");
  if (c.actor.name !== "anonymous" && c.actor.name !== "stranger")
    await collect("/profile");
  const administration = descriptors.find(
    (x) => x.href === "/admin/participants",
  );
  if (administration) await collect("/admin/participants");
  const completed = new Set();
  for (const item of descriptors) {
    const destination = new URL(item.href, origin);
    assert.equal(destination.origin, origin);
    const semanticId =
      "shared-nav:" +
      destination.pathname +
      ":" +
      item.label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    // Every different rendered source surface is exercised; stable ID links equivalents.
    const executionId = item.from + "|" + item.sourceArea + "|" + semanticId;
    if (completed.has(executionId)) continue;
    completed.add(executionId);
    await go(c, item.from);
    await openNavigation(c);
    await check(
      c,
      "Navigate " + item.label + " from " + item.from,
      async () => {
        const link = c.page
          .locator(
            "#site-navigation a:visible,.account-controls a:visible,.mobile-header a:visible,.sidebar>.brand:visible,#public-navigation a:visible,.public-header>.brand:visible",
          )
          .filter({ hasText: item.label });
        const scope = c.page.locator(
          item.sourceArea === "workspace-header"
            ? ".mobile-header"
            : item.sourceArea === "public-header"
              ? ".public-header"
              : ".sidebar",
        );
        const exact = scope
          .getByRole("link", { name: item.label, exact: true })
          .filter({ visible: true });
        const target = (await exact.count()) ? exact.first() : link.first();
        assert.equal(await target.getAttribute("href"), item.href);
        await activate(c, target);
        await c.page.waitForURL((url) => url.pathname === destination.pathname);
        await c.page.waitForLoadState("networkidle");
        if (destination.pathname === "/signin-with-chatgpt")
          await c.page
            .getByRole("heading", { name: "Sign-in boundary", exact: true })
            .waitFor();
        else await c.page.locator("#main").waitFor();
        const result = c.viewResults.findLast(
          (row) => row.view === destination.pathname,
        );
        if (result && !["anonymous", "stranger"].includes(c.actor.name)) {
          assert.ok(
            result.status < 400,
            "Exposed navigation must not return an authorization or server error",
          );
          assert.equal(result.identity?.id, "fake_" + c.actor.name);
        }
        return {
          semanticId,
          from: item.from,
          destination: destination.pathname,
          actualInput: c.mode.input,
          sourceArea: item.sourceArea,
          authenticationProof: false,
          responseStatus: result?.status || null,
        };
      },
    );
  }
  for (const path of ["/", "/dashboard", "/profile"]) {
    await go(c, path);
    await check(c, "Skip to content from " + path, async () => {
      const skip = c.page.getByRole("link", {
        name: "Skip to content",
        exact: true,
      });
      await skip.focus();
      await activate(c, skip);
      assert.equal(new URL(c.page.url()).hash, "#main");
      assert.equal(
        await c.page
          .locator("#main")
          .evaluate((el) => el === document.activeElement),
        true,
      );
      return {
        semanticId: "shared-nav:skip-main",
        from: path,
        focusBeforeTouch: true,
      };
    });
  }
  if (c.actor.name === "bob") {
    await go(c, "/dashboard");
    const links = c.page.getByRole("link", {
      name: /^Open WhatsApp chat with/,
    });
    for (let i = 0; i < (await links.count()); i++)
      await check(c, "Bob member WhatsApp " + i, async () => ({
        ...(await tapExternal(c, links.nth(i))),
        semanticId: "dashboard:member-whatsapp:" + i,
      }));
  }
}
async function profileGaps(c) {
  await go(c, "/profile");
  await c.page.locator('.profile-flow[data-step="1"]').waitFor();
  await capture(c, "profile-gap-original");
  const initial = {};
  for (const field of ["avatarExpression", "avatarColor"])
    initial[field] = await c.page
      .locator(`input[name="${field}"]:checked`)
      .inputValue();
  initial.sex = (await c.page.locator('input[name="sex"]:checked').count())
    ? await c.page.locator('input[name="sex"]:checked').inputValue()
    : null;
  for (const field of ["avatarExpression", "avatarColor"]) {
    const values = await c.page
      .locator(`input[name="${field}"]`)
      .evaluateAll((nodes) => nodes.map((el) => el.value));
    for (const value of values)
      await check(c, field + " option " + value, async () => {
        const input = c.page.locator(
          `input[name="${field}"][value="${value}"]`,
        );
        await activate(c, input.locator(".."));
        assert.equal(await input.isChecked(), true);
        return { semanticId: "profile:" + field + ":" + value };
      });
    await activate(
      c,
      c.page
        .locator(`input[name="${field}"][value="${initial[field]}"]`)
        .locator(".."),
    );
  }
  for (const label of ["Male", "Female", "Non-binary"])
    await check(c, "Sex option " + label, async () => {
      const radio = c.page.getByRole("radio", { name: label, exact: true });
      await activate(c, radio.locator(".."));
      assert.equal(await radio.isChecked(), true);
      return { semanticId: "profile:sex:" + label.toLowerCase() };
    });
  const bio = c.page.getByRole("textbox", { name: /^Bio/ });
  if (!(await bio.inputValue()).trim())
    await bio.fill("Synthetic local profile control audit");
  await activate(c, c.page.getByRole("button", { name: "Next", exact: true }));
  await c.page.locator('.profile-flow[data-step="2"]').waitFor();
  await inventory(c, "profile-contact-before-local-edits");
  const originals = await c.page
    .locator(".profile-social-row")
    .evaluateAll((nodes) =>
      nodes.map((el) => ({
        type: el.querySelector("select").value,
        url: el.querySelector('input[type="url"]').value,
      })),
    );
  for (let i = 0; i < originals.length; i++)
    await check(c, "Remove original social row " + i, async () => {
      const rows = c.page.locator(".profile-social-row"),
        count = await rows.count();
      await activate(c, rows.first().getByRole("button", { name: /^Remove/ }));
      assert.equal(await rows.count(), count - 1);
      return {
        semanticId: "profile:social:original-remove:" + i,
        localStateOnly: true,
      };
    });
  const add = c.page.getByRole("button", { name: "Add another", exact: true });
  for (let i = 0; i < 8; i++)
    await check(c, "Add social row " + i, async () => {
      await activate(c, add);
      assert.equal(await c.page.locator(".profile-social-row").count(), i + 1);
      return { semanticId: "profile:social:add:" + i };
    });
  await inventory(c, "profile-social-max-eight");
  await check(c, "Social eight-row maximum", async () => {
    assert.equal(await add.isDisabled(), true);
    return { semanticId: "profile:social:max-eight", actualDisabled: true };
  });
  const first = c.page.locator(".profile-social-row").first();
  const options = await first
    .locator("select option")
    .evaluateAll((nodes) => nodes.map((el) => el.value));
  for (const value of options)
    await check(c, "Social platform option " + value, async () => {
      await chooseNative(c, first.locator("select"), value);
      await first
        .locator('input[type="url"]')
        .fill("https://example.test/synthetic-" + value.toLowerCase());
      assert.equal(
        await first.locator('input[type="url"]').inputValue(),
        "https://example.test/synthetic-" + value.toLowerCase(),
      );
      return {
        semanticId: "profile:social:platform:" + value,
        nativeOSPickerProof: false,
      };
    });
  for (let i = 7; i >= 0; i--)
    await check(c, "Remove added social row " + i, async () => {
      const rows = c.page.locator(".profile-social-row");
      await activate(c, rows.last().getByRole("button", { name: /^Remove/ }));
      assert.equal(await rows.count(), i);
      return { semanticId: "profile:social:added-remove:" + i };
    });
  for (const row of originals) {
    await activate(c, add);
    const last = c.page.locator(".profile-social-row").last();
    await chooseNative(c, last.locator("select"), row.type);
    await last.locator('input[type="url"]').fill(row.url);
  }
  await activate(c, c.page.getByRole("button", { name: "Next", exact: true }));
  await c.page.locator('.profile-flow[data-step="3"]').waitFor();
  await inventory(c, "profile-description-options");
  const description = c.page.locator('select[name="bestDescription"]'),
    originalDescription = await description.inputValue();
  const descriptions = await description
    .locator("option")
    .evaluateAll((nodes) => nodes.map((el) => el.value));
  for (const value of descriptions)
    await check(c, "Description option " + (value || "Choose"), async () => {
      await chooseNative(c, description, value);
      return {
        semanticId: "profile:description:" + (value || "empty"),
        nativeOSPickerProof: false,
      };
    });
  await chooseNative(c, description, originalDescription);
  if (
    process.argv.includes("--fresh-write-phase") &&
    process.argv.includes("--save-synthetic-profile") &&
    report.actualProfileSaves === 0 &&
    c.mode.name === modes.at(-1).name
  )
    await check(c, "One fresh synthetic profile Save", async () => {
      await activate(
        c,
        c.page.getByRole("button", { name: "Save", exact: true }),
      );
      await c.page.waitForURL((url) =>
        ["/teams", "/dashboard"].includes(url.pathname),
      );
      assert.equal(report.actualProfileSaves, 1);
      return {
        semanticId: "profile:save:synthetic-once",
        managedAuthenticationProof: false,
      };
    });
  else
    record(c, "Successful profile Save", "delegated", {
      semanticId: "profile:save:synthetic-once",
      reason:
        "Explicit fresh-write phase flags absent or single save already used",
    });
}
async function logoutGap(c) {
  if (c.actor.name === "anonymous") return;
  await go(c, "/dashboard");
  await openNavigation(c);
  const logout = c.page
    .getByRole("button", {
      name: /^(Log out|Sign out \/ switch account)$/,
      exact: true,
    })
    .filter({ visible: true })
    .first();
  if (!(await logout.count())) {
    record(c, "Log out boundary", "untested", {
      semanticId: "auth:logout:local-boundary",
      reason: "No account logout control rendered",
    });
    return;
  }
  if (!(await logout.evaluate((el) => !!el.closest(".sidebar")))) {
    const close = c.page
      .getByRole("button", { name: "Close menu", exact: true })
      .first();
    if ((await close.count()) && (await close.isVisible()))
      await activate(c, close);
  }
  await check(c, "Log out cancel / confirm boundary", async () => {
    await activate(c, logout);
    const dialog = c.page.locator(".confirmation-dialog[open]");
    await dialog.waitFor();
    await activate(
      c,
      dialog.getByRole("button", { name: "Cancel", exact: true }),
    );
    await dialog.waitFor({ state: "hidden" });
    assert.equal(c.loggedOut, false);
    await activate(c, logout);
    await dialog.waitFor();
    await activate(
      c,
      dialog.getByRole("button", { name: "Log out", exact: true }),
    );
    await c.page.waitForURL(
      (url) =>
        url.pathname === "/signout-with-chatgpt" ||
        (c.loggedOut && url.pathname === "/"),
    );
    assert.equal(c.loggedOut, true);
    if (new URL(c.page.url()).pathname === "/signout-with-chatgpt")
      await c.page
        .getByRole("heading", { name: "Sign-out boundary", exact: true })
        .waitFor();
    return {
      semanticId: "auth:logout:local-boundary",
      cancelledBeforeConfirm: true,
      managedAuthenticationProof: false,
      injectedIdentitySession: true,
      actualBackendMutation: false,
    };
  });
}
try {
  for (const mode of modes) {
    for (const actor of actors) {
      if (
        report.homeRecheckOnly &&
        !["anonymous", "stranger", "mentor", "volunteer"].includes(actor.name)
      )
        continue;
      const c = await session(actor, mode);
      try {
        if (report.gapPhase) {
          await navigationGaps(c);
          if (actor.name === "alice") await profileGaps(c);
          await logoutGap(c);
        } else await home(c, actor.name === "anonymous");
        if (!report.homeRecheckOnly && !report.gapPhase) {
          await dashboard(c, actor.name === "alice");
          if (actor.name === "alice") await profile(c);
        }
      } catch (error) {
        report.failures.push({
          route: c.route,
          actor: actor.name,
          inputMode: mode.name,
          error: error.message,
        });
        persist();
      } finally {
        await c.context.close();
      }
    }
  }
  assert.equal(
    report.unexpectedBlocks.length,
    0,
    "Unexpected mutation attempts must be inspected",
  );
  assert.equal(
    report.pageErrors.length,
    0,
    "Page exceptions must be inspected",
  );
  if (report.failures.length) process.exitCode = 1;
} finally {
  await browser.close();
  report.browserClosed = true;
  report.workerAfter = hash();
  if (report.workerAfter !== worker) {
    report.failures.push({
      error: "Worker changed during QA; evidence invalid",
    });
    process.exitCode = 1;
  }
  report.semanticControls = Object.values(
    report.controls.reduce((all, row) => {
      const key = [row.role, row.inputMode, row.semanticId].join("|");
      const item =
        all[key] ||
        (all[key] = {
          semanticId: row.semanticId,
          role: row.role,
          inputMode: row.inputMode,
          routes: [],
          executions: [],
        });
      if (!item.routes.includes(row.route)) item.routes.push(row.route);
      item.executions.push({
        control: row.control,
        status: row.status,
        route: row.route,
      });
      return all;
    }, {}),
  );
  report.remainingUntested = report.inventory.filter(
    (row) => row.status === "untested",
  );
  persist();
}
console.log(
  JSON.stringify(
    {
      report: join(output, "report.json"),
      controls: report.controls.length,
      inventory: report.inventory.length,
      failures: report.failures.length,
      pageErrors: report.pageErrors.length,
      actualWrites: report.writes.length,
      browserClosed: report.browserClosed,
    },
    null,
    2,
  ),
);
