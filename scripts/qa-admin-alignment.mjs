import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
const origin = process.env.ADMIN_QA_ORIGIN || "http://localhost:3000";
assert.equal(new URL(origin).hostname, "localhost");
const root = process.env.ADMIN_QA_SOURCE_ROOT || "/workspace/dddhack-portal";
const mode = process.env.ADMIN_QA_MODE || "320-short";
const width = Number(process.env.ADMIN_QA_WIDTH || 320),
  height = Number(process.env.ADMIN_QA_HEIGHT || 480);
const output =
  process.env.ADMIN_QA_OUTPUT || "evidence/admin-alignment-" + mode;
mkdirSync(output, { recursive: true });
const fp = () => ({
  commit: execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim(),
  files: Object.fromEntries(
    [
      "app/portal.tsx",
      "app/admin-experience.css",
      "app/admin-controls.css",
      "app/redesign.css",
      "app/layout.tsx",
    ].map((f) => [
      f,
      createHash("sha256")
        .update(readFileSync(root + "/" + f))
        .digest("hex"),
    ]),
  ),
});
const report = {
  mode,
  viewport: { width, height },
  zoom: process.env.ADMIN_QA_ZOOM || "100% native, no CSS zoom",
  source: fp(),
  syntheticOnly: true,
  readOnly: true,
  touchEmulation: true,
  physicalDevice: false,
  checks: [],
  screenshots: [],
  findings: [],
  errors: [],
  blockedWrites: [],
};
const save = () =>
  writeFileSync(
    output + "/report.json",
    JSON.stringify(report, null, 2) + "\n",
  );
const nativeZoom = process.env.ADMIN_QA_NATIVE_ZOOM === "2";
let b, c;
if (nativeZoom) {
  c = await chromium.launchPersistentContext(
    mkdtempSync("/tmp/ddd-admin-native-zoom-"),
    {
      executablePath: "/usr/bin/chromium",
      headless: true,
      chromiumSandbox: false,
      viewport: null,
      args: ["--window-size=1440,900"],
      reducedMotion: "reduce",
      hasTouch: true,
      serviceWorkers: "block",
    },
  );
  b = { close: () => c.close() };
  const settings = await c.newPage();
  await settings.goto("chrome://settings/appearance");
  await settings.evaluate(() => {
    chrome.settingsPrivate.setDefaultZoom(2, () => {});
    return true;
  });
  await settings.close();
  report.zoom =
    "Native Chromium default browser zoom200%, disposable persistent profile; no CSS/pinch zoom";
} else {
  b = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    headless: true,
    chromiumSandbox: false,
  });
  c = await b.newContext({
    viewport: { width, height },
    isMobile: width < 500,
    hasTouch: true,
    reducedMotion: "reduce",
    serviceWorkers: "block",
  });
}
await c.addCookies([
  { name: "portal_local_fixture", value: "owner", url: origin },
]);
await c.route("**/*", (route) => {
  const r = route.request(),
    u = new URL(r.url());
  if (u.origin !== origin) return route.abort("blockedbyclient");
  if (
    !["GET", "HEAD"].includes(r.method()) &&
    !u.pathname.startsWith("/__nextjs_")
  ) {
    report.blockedWrites.push({ method: r.method(), path: u.pathname });
    save();
    return route.abort("blockedbyclient");
  }
  return route.continue();
});
const p = await c.newPage();
p.setDefaultTimeout(12000);
p.on("pageerror", (e) => {
  report.errors.push(e.message);
  save();
});
async function go(path) {
  try {
    await p.goto(origin + path, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
  } catch (error) {
    if (!String(error).includes("ERR_ABORTED")) throw error;
    report.checks.push({
      name: "Retried read-only navigation after pending dialog-history cleanup",
      path,
      passed: true,
      harnessRecovery: true,
    });
    await p.waitForTimeout(200);
    await p.goto(origin + path, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
  }
  await p.locator(".admin-workspace").waitFor();
  if (nativeZoom)
    await p.waitForFunction(
      () =>
        innerWidth === 720 &&
        devicePixelRatio === 2 &&
        visualViewport.scale === 1,
    );
  await p.waitForLoadState("networkidle");
  await p.waitForFunction(() =>
    [...document.querySelectorAll("form[data-hydrated]")].every(
      (f) => f.dataset.hydrated === "true",
    ),
  );
}
async function shot(name, { fixture = false } = {}) {
  await p.evaluate(() => document.fonts.ready);
  const modal = (await p.locator("dialog[open]").count()) > 0;
  if (!modal) await p.evaluate(() => scrollTo(0, 0));
  const geometry = await p.evaluate(() => {
    const visible = (e) => {
      const s = getComputedStyle(e);
      return (
        e.getClientRects().length &&
        s.visibility !== "hidden" &&
        s.display !== "none"
      );
    };
    const nodes = [
      ...document.querySelectorAll(
        "main h1,main h2,main h3,main h4,main .admin-person-identity strong,main .admin-team-identity strong,main .admin-team-disclosure > summary strong,main .project-description,main summary,main button,main input,main select,main textarea,dialog[open] button,dialog[open] input,dialog[open] select,dialog[open] textarea",
      ),
    ].filter(visible);
    const outside = nodes
      .filter((e) => {
        const r = e.getBoundingClientRect();
        return r.left < -1 || r.right > innerWidth + 1;
      })
      .map((e) => ({
        tag: e.tagName,
        text: (e.getAttribute("aria-label") || e.textContent || e.name || "")
          .trim()
          .slice(0, 100),
        left: Math.round(e.getBoundingClientRect().left),
        right: Math.round(e.getBoundingClientRect().right),
      }));
    const clipped = nodes
      .filter((e) => {
        let a = e.parentElement;
        const r = e.getBoundingClientRect();
        while (a && a !== document.body) {
          const s = getComputedStyle(a),
            q = a.getBoundingClientRect();
          if (
            ["hidden", "clip"].includes(s.overflowX) &&
            (r.left < q.left - 1 || r.right > q.right + 1)
          )
            return true;
          a = a.parentElement;
        }
        return false;
      })
      .map((e) => ({
        tag: e.tagName,
        text: (e.getAttribute("aria-label") || e.textContent || "")
          .trim()
          .slice(0, 90),
      }));
    return {
      innerWidth,
      innerHeight,
      outerWidth,
      outerHeight,
      visualViewportScale: visualViewport.scale,
      dpr: devicePixelRatio,
      scrollWidth: document.documentElement.scrollWidth,
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      outside,
      clipped,
      dialogs: [...document.querySelectorAll("dialog[open]")].map((d) => {
        const r = d.getBoundingClientRect();
        return {
          width: r.width,
          height: r.height,
          left: r.left,
          top: r.top,
          right: r.right,
          bottom: r.bottom,
          scrollHeight: d.scrollHeight,
          clientHeight: d.clientHeight,
        };
      }),
    };
  });
  const path = output + "/" + name + ".png";
  let bottomPath = null;
  if (nativeZoom) {
    await p
      .locator("nextjs-portal")
      .evaluateAll((ns) => ns.forEach((n) => (n.style.visibility = "hidden")));
    const cdp = await c.newCDPSession(p);
    const capture = async (file) => {
      const image = await cdp.send("Page.captureScreenshot", {
        format: "png",
        fromSurface: true,
        captureBeyondViewport: false,
      });
      writeFileSync(file, Buffer.from(image.data, "base64"));
    };
    await capture(path);
    if (!modal) {
      await p.evaluate(() =>
        scrollTo(0, document.documentElement.scrollHeight),
      );
      bottomPath = output + "/" + name + "-bottom.png";
      await capture(bottomPath);
      await p.evaluate(() => scrollTo(0, 0));
    }
    await cdp.detach();
  } else
    await p.screenshot({
      path,
      fullPage: !modal,
      animations: "disabled",
      caret: "initial",
      style: "nextjs-portal{visibility:hidden!important}",
    });
  const viewportPath =
    !nativeZoom && !modal ? output + "/" + name + "-viewport.png" : null;
  if (viewportPath)
    await p.screenshot({
      path: viewportPath,
      fullPage: false,
      animations: "disabled",
      caret: "initial",
      style: "nextjs-portal{visibility:hidden!important}",
    });
  report.screenshots.push({
    name,
    path,
    viewportPath,
    bottomPath,
    captureMethod: nativeZoom
      ? "CDP native viewport, no clip"
      : "Playwright full page plus viewport",
    fixtureDOMTextInjection: fixture,
    source: fp(),
    geometry,
    inspected: false,
  });
  if (
    geometry.horizontalOverflow ||
    geometry.outside.length ||
    geometry.clipped.length
  )
    report.findings.push({ state: name, ...geometry });
  save();
}
async function group(name, run) {
  if (
    process.env.ADMIN_QA_ONLY &&
    !new RegExp(process.env.ADMIN_QA_ONLY, "i").test(name)
  )
    return;
  try {
    await run();
    report.checks.push({ name, passed: true });
  } catch (e) {
    report.checks.push({ name, passed: false, error: String(e.stack || e) });
  }
  save();
}
const longName = "SyntheticExtremelyLongUnbrokenParticipantOrTeamName".repeat(
  3,
);
try {
  await group(
    "Participants search, filters, import, status keyboard and Back",
    async () => {
      await go("/admin/participants");
      await shot("participants");
      const filter = p.getByRole("button", { name: /filter/i }).first();
      if (await filter.count()) {
        await filter.tap();
        await shot("participant-filters");
      }
      const add = p.getByRole("button", {
        name: "Add participants",
        exact: true,
      });
      await add.tap();
      await shot("participant-import");
      await p.keyboard.press("Escape");
      await expect(p.locator(".admin-import-dialog[open]")).toHaveCount(0);
      const status = p
        .getByRole("button", { name: /Change .* status/ })
        .first();
      await status.tap();
      await shot("participant-status");
      await p.keyboard.press("Tab");
      await expect(p.locator(".admin-status-popover[open]")).toHaveCount(1);
      await p.keyboard.press("Escape");
      await expect(status).toBeFocused();
      await status.tap();
      await p.goBack();
      await expect(p.locator(".admin-status-popover[open]")).toHaveCount(0);
      await expect(status).toBeFocused();
      await p
        .locator(".admin-person-identity strong")
        .first()
        .evaluate((e, text) => (e.textContent = text), longName);
      await shot("participant-DOM-long-name", { fixture: true });
    },
  );
  await group(
    "Teams actual long synthetic record, expanded members and private idea",
    async () => {
      await go("/admin/teams");
      await p.getByRole("searchbox").fill("Control Project 00");
      const t = p.locator(".admin-team-disclosure").first();
      await t.locator(":scope > summary").tap();
      const idea = t.locator(".admin-team-idea > summary");
      if (await idea.count()) await idea.tap();
      await shot("team-expanded-long");
      await t
        .locator(":scope > summary strong")
        .evaluate((e, text) => (e.textContent = text), longName);
      await shot("team-DOM-unbroken-name", { fixture: true });
    },
  );
  await group(
    "Submission management target, native select keyboard and long name",
    async () => {
      await go("/admin/submissions");
      await p.getByRole("searchbox").fill("Control Project 00");
      const d = p.locator(".admin-submission-management").first();
      await d.locator(":scope > summary").tap();
      await d
        .getByRole("combobox", { name: "Target", exact: true })
        .selectOption("submission");
      const version = d.getByRole("combobox", { name: "Version", exact: true });
      if (await version.count()) {
        await version.focus();
        await p.keyboard.press("ArrowDown");
        await p.keyboard.press("Tab");
      }
      await shot("submission-management");
      await p
        .locator(".admin-submission-records h2")
        .first()
        .evaluate((e, text) => (e.textContent = text), longName);
      await shot("submission-DOM-long-name", { fixture: true });
    },
  );
  await group(
    "Review details, eligibility, rubric, score, version and review history",
    async () => {
      await go("/admin/submissions/synthetic-control-00");
      const detailTab = p.getByRole("tab", {
        name: "Project details",
        exact: true,
      });
      if (await detailTab.count()) await detailTab.tap();
      await shot("review-details");
      const eligibility = p
        .locator("form")
        .filter({ hasText: "Eligibility check" });
      await eligibility
        .locator('select[name="status"]')
        .selectOption("ineligible");
      await shot("review-ineligible");
      const rubric = p
        .locator("details")
        .filter({
          has: p.locator("summary", { hasText: "Final judging rubric" }),
        })
        .first();
      if (await rubric.count()) {
        await rubric.locator(":scope > summary").tap();
        await shot("review-rubric");
      }
      const body = p.locator(".project-description");
      if (await body.count()) {
        await body.evaluate(
          (e) =>
            (e.textContent =
              "https://example.test/" +
              "unbroken-synthetic-url-segment".repeat(14)),
        );
        await shot("review-DOM-long-URL", { fixture: true });
      }
      const tab = p.getByRole("tab", { name: "Review", exact: true });
      if (await tab.count()) await tab.tap();
      await shot("review-score");
      const history = p.locator(".admin-review-versions > summary");
      if (await history.count()) await history.tap();
      await shot("review-history");
    },
  );
  await group(
    "Credits published, upload editor and safe deletion dialog cancellation",
    async () => {
      await go("/admin/credits");
      await shot("credits");
      const upload = p.locator(".credit-batch-new-upload");
      if (await upload.count()) {
        if ((await upload.getAttribute("open")) === null)
          await upload.locator(":scope > summary").tap();
        await shot("credits-upload");
      }
      const del = p
        .getByRole("button", { name: "Delete batch", exact: true })
        .first();
      if (await del.count()) {
        await del.tap();
        await shot("credits-delete-dialog");
        await p.keyboard.press("Escape");
        await expect(p.locator(".confirmation-dialog[open]")).toHaveCount(0);
      }
    },
  );
  await group(
    "Settings all tabs, content entry panels, scoring and keyboard navigation",
    async () => {
      await go("/admin/settings");
      const nav = p.getByRole("tablist", { name: "Settings sections" });
      for (const name of ["Event", "Results", "Access", "Content"]) {
        await nav.getByRole("tab", { name, exact: true }).tap();
        await shot("settings-" + name.toLowerCase());
      }
      const content = p.getByRole("tablist", { name: /content/i }).last();
      for (const name of ["FAQ", "Rules", "Agenda"]) {
        const tab = content.getByRole("tab", { name, exact: true });
        await tab.tap();
        const entry = p
          .locator(".admin-content-entry > summary:visible")
          .first();
        if (await entry.count()) await entry.tap();
        await shot("settings-content-" + name.toLowerCase());
      }
      const scoring = p.locator(".admin-settings-extra > summary");
      if (await scoring.count()) {
        await scoring.tap();
        await shot("settings-scoring");
      }
      const event = nav.getByRole("tab", { name: "Event", exact: true });
      await event.focus();
      await p.keyboard.press("ArrowRight");
      await expect(
        nav.getByRole("tab", { name: "Results", exact: true }),
      ).toBeFocused();
    },
  );
  await group("Owner Logs populated detail, search and filter", async () => {
    await go("/admin/logs");
    const first = p.locator(".admin-log-list > li summary").first();
    if (await first.count()) await first.tap();
    await shot("owner-logs-expanded");
    const filter = p.getByRole("button", { name: /filter/i }).first();
    if (await filter.count()) {
      await filter.tap();
      await shot("owner-logs-filter");
    }
  });
} finally {
  report.endSource = fp();
  save();
  await b.close();
}
console.log(
  JSON.stringify({
    checks: report.checks.length,
    passed: report.checks.filter((x) => x.passed).length,
    screenshots: report.screenshots.length,
    findings: report.findings.length,
    errors: report.errors.length,
    blockedWrites: report.blockedWrites.length,
  }),
);
