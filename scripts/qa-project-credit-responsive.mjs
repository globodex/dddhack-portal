import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const root = "/workspace/dddhack-portal",
  origin = "http://localhost:3000";
assert.ok(process.env.QA_ROOT_SOURCE, "root source hold required");
assert.equal(
  execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim(),
  process.env.QA_ROOT_SOURCE,
);
const out = process.env.QA_OUTPUT || "evidence/project-credit-responsive";
mkdirSync(out, { recursive: true });
const hash = (file) =>
  createHash("sha256")
    .update(readFileSync(root + "/" + file))
    .digest("hex");
const fingerprint = () =>
  Object.fromEntries(
    [
      "app/portal.tsx",
      "app/projects-rules-experience.css",
      "app/dashboard-v6.css",
      "app/team-discovery-experience.css",
      "app/redesign.css",
    ].map((file) => [file, hash(file)]),
  );
const report = {
  source: process.env.QA_ROOT_SOURCE,
  fixtureBackend: 8821,
  syntheticOnly: true,
  origin,
  fingerprint: fingerprint(),
  screenshots: [],
  checks: [],
  errors: [],
  writes: [],
  findings: [],
  nativeBrowserZoom: {
    verified: false,
    method:
      "Disposable persistent Chromium profile; chrome.settingsPrivate.setDefaultZoom(2) on chrome://settings/appearance; new application tab, viewport:null. Layout, DPR and visualViewport scale asserted.",
  },
};
const save = () =>
  writeFileSync(out + "/report.json", JSON.stringify(report, null, 2));
const check = (name, extra = {}) => {
  report.checks.push({ name, passed: true, ...extra });
  save();
};
const b = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  chromiumSandbox: false,
  headless: true,
});
const liveContexts = new Set();
const longName = "SyntheticAccessibilityReview".repeat(3);
const longRepo =
  "https://github.com/synthetic-fixture/" + "long-repository-name-".repeat(9);
const cases = [
  { name: "320x720", width: 320, height: 720, touch: true },
  { name: "390x480", width: 390, height: 480, touch: true },
  { name: "768x1024", width: 768, height: 1024, touch: true },
  { name: "1440x900", width: 1440, height: 900, touch: false },
  {
    name: "native-200-percent-outer1440x900",
    width: 720,
    height: 378,
    touch: false,
    zoom: true,
  },
];
try {
  const health = await fetch("http://127.0.0.1:8821/api/health").then((r) =>
    r.json(),
  );
  assert.equal(health.runtime, "synthetic-local");
  for (const mode of cases) {
    const c = mode.zoom
      ? await chromium.launchPersistentContext(
          mkdtempSync("/tmp/ddd-project-native200-"),
          {
            executablePath: "/usr/bin/chromium",
            headless: true,
            chromiumSandbox: false,
            viewport: null,
            args: ["--window-size=1440,900"],
            reducedMotion: "reduce",
          },
        )
      : await b.newContext({
          viewport: { width: mode.width, height: mode.height },
          reducedMotion: "reduce",
          hasTouch: mode.touch,
          isMobile: mode.touch,
          serviceWorkers: "block",
        });
    liveContexts.add(c);
    if (mode.zoom) {
      const settings = await c.newPage();
      await settings.goto("chrome://settings/appearance");
      await settings.evaluate(() => {
        chrome.settingsPrivate.setDefaultZoom(2, () => {});
        return true;
      });
      await settings.close();
    }
    await c.addCookies([
      {
        name: "portal_local_fixture",
        value: "alice",
        url: origin,
        httpOnly: true,
        sameSite: "Strict",
      },
    ]);
    await c.route("**/*", (route) => {
      const req = route.request(),
        url = new URL(req.url());
      if (url.origin !== origin || !["GET", "HEAD"].includes(req.method()))
        return route.abort();
      return route.continue();
    });
    const p = await c.newPage();
    p.setDefaultTimeout(15000);
    p.on("pageerror", (error) => {
      report.errors.push({ mode: mode.name, message: error.message });
      save();
    });
    const activate = async (locator) =>
      mode.touch
        ? locator.tap()
        : (await locator.focus(), await locator.press("Enter"));
    const shot = async (name, fullPage = true) => {
      await p.evaluate(() => document.fonts.ready);
      if (fullPage && !mode.zoom) await p.evaluate(() => window.scrollTo(0, 0));
      const width = await p.evaluate(() => ({
        viewport: innerWidth,
        clientWidth: document.documentElement.clientWidth,
        page: document.documentElement.scrollWidth,
        visualViewportScale: visualViewport.scale,
      }));
      assert.ok(
        width.page <= width.clientWidth + 1 && width.viewport === mode.width,
        `${mode.name}/${name} horizontal overflow ${JSON.stringify(width)}`,
      );
      const path = `${out}/${name}-${mode.name}.png`;
      if (mode.zoom) {
        await p.addStyleTag({
          content: "nextjs-portal{visibility:hidden!important}",
        });
        const devtools = await c.newCDPSession(p);
        const capture = await devtools.send("Page.captureScreenshot", {
          format: "png",
          fromSurface: true,
          captureBeyondViewport: false,
        });
        writeFileSync(path, Buffer.from(capture.data, "base64"));
        await devtools.detach();
      } else
        await p.screenshot({
          path,
          fullPage,
          animations: "disabled",
          style: "nextjs-portal{visibility:hidden!important}",
        });
      report.screenshots.push({
        path,
        mode: mode.name,
        fullPage: fullPage && !mode.zoom,
        sha256: createHash("sha256").update(readFileSync(path)).digest("hex"),
        viewport: width,
      });
      save();
    };
    for (const [name, path] of [
      ["rules", "/rules"],
      ["projects", "/projects"],
      ["project-detail", "/projects/synthetic-alice"],
      ["leaderboard", "/leaderboard"],
    ]) {
      await p.goto(origin + path, { waitUntil: "networkidle", timeout: 60000 });
      if (name !== "rules")
        await p.locator('.projects-v6[data-hydrated="true"]').waitFor();
      if (mode.zoom && name === "rules") {
        const metrics = await p.evaluate(() => ({
          innerWidth,
          innerHeight,
          outerWidth,
          outerHeight,
          devicePixelRatio,
          visualViewportScale: visualViewport.scale,
        }));
        assert.equal(metrics.outerWidth, 1440);
        assert.equal(metrics.innerWidth, 720);
        assert.equal(metrics.devicePixelRatio, 2);
        assert.equal(metrics.visualViewportScale, 1);
        report.nativeBrowserZoom = {
          ...report.nativeBrowserZoom,
          verified: true,
          metrics,
        };
        save();
      }
      await shot(name);
    }
    await p.goto(origin + "/dashboard#project", { waitUntil: "networkidle" });
    await activate(p.getByRole("tab", { name: "Project", exact: true }));
    const versions = p.getByRole("button", {
      name: "Versions 2/3",
      exact: true,
    });
    await activate(versions);
    await p.locator(".history-version").first().waitFor();
    await shot("history", false);
    await p.keyboard.press("Escape");
    await p.locator(".project-history-dialog").waitFor({ state: "detached" });
    await p.waitForTimeout(150);
    assert.equal(
      await versions.evaluate((el) => el === document.activeElement),
      true,
    );
    await activate(versions);
    await p.locator(".history-version").first().waitFor();
    await p.goBack();
    await p.locator(".project-history-dialog").waitFor({ state: "detached" });
    await p.waitForTimeout(150);
    check(
      mode.name + ": history Escape/Back/opener focus and responsive bounds",
    );
    await activate(
      p.getByRole("button", { name: "Update project", exact: true }),
    );
    await p.locator(".project-editor:not([inert])").waitFor();
    const headingBox = await p.locator(".submission-heading h1").boundingBox(),
      dotBox = await p
        .locator(".submission-heading .expressive-heading-dot")
        .boundingBox();
    assert.ok(
      Math.abs(
        headingBox.y + headingBox.height / 2 - dotBox.y - dotBox.height / 2,
      ) <= 2,
      "heading and expression share a center baseline",
    );
    if (mode.width === 320)
      assert.ok(headingBox.height <= 36, "320 title stays on one line");
    const name = p.locator('[name="projectName"]');
    await name.fill("");
    await activate(p.getByRole("button", { name: "Next", exact: true }));
    await p.locator("#submission-projectName-error").waitFor();
    assert.equal(await name.getAttribute("aria-invalid"), "true");
    assert.equal(
      await name.evaluate((el) => el === document.activeElement),
      true,
    );
    await shot("submission-required-error");
    await name.fill(longName);
    await shot("submission-step1-long-name");
    await activate(p.getByRole("button", { name: "Next", exact: true }));
    const repo = p.locator('[name="github"]');
    await repo.fill("not-a-repository");
    await activate(p.getByRole("button", { name: "Next", exact: true }));
    await p.locator("#submission-github-error").waitFor();
    assert.equal(await repo.getAttribute("aria-invalid"), "true");
    assert.equal(
      await repo.evaluate((el) => el === document.activeElement),
      true,
    );
    await shot("submission-repository-error");
    await repo.fill(longRepo);
    await p
      .locator('[name="demo"]')
      .fill("https://synthetic.example.test/" + "long-path-".repeat(15));
    await shot("submission-step2-long-urls");
    await activate(p.getByRole("button", { name: "Next", exact: true }));
    await shot("submission-step3");
    for (const label of ["Save draft", "Submit"]) {
      const button = p.getByRole("button", { name: label, exact: true });
      await button.scrollIntoViewIfNeeded();
      const box = await button.boundingBox();
      assert.ok(
        box.x >= -1 &&
          box.x + box.width <= mode.width + 1 &&
          box.height >= 44 &&
          box.y >= -1 &&
          box.y + box.height <= (await p.evaluate(() => innerHeight)) + 1,
        label + " remains in bounds and touch-sized",
      );
    }
    await p
      .getByRole("checkbox", {
        name: "I confirm this submission is accurate.",
        exact: true,
      })
      .uncheck();
    await activate(p.getByRole("button", { name: "Submit", exact: true }));
    await p
      .getByRole("alert")
      .filter({ hasText: "Confirm this submission is accurate." })
      .waitFor();
    await shot("submission-attestation-error");
    await p
      .getByRole("checkbox", {
        name: "I confirm this submission is accurate.",
        exact: true,
      })
      .check();
    await activate(p.getByRole("button", { name: "Submit", exact: true }));
    await p.locator(".confirmation-dialog[open]").waitFor();
    await shot("submission-confirmation", false);
    await p.keyboard.press("Escape");
    await p.locator(".confirmation-dialog").waitFor({ state: "detached" });
    check(
      mode.name +
        ": three steps, long names/URLs, field focus/errors, visible44px CTAs, attestation error and commit cancellation",
    );
    await p.waitForTimeout(150);
    await activate(
      p.getByRole("button", { name: "Previous submission step", exact: true }),
    );
    await activate(
      p.getByRole("button", { name: "Previous submission step", exact: true }),
    );
    await activate(
      p.getByRole("button", { name: "Back to your project", exact: true }),
    );
    await activate(p.getByRole("tab", { name: "Credits", exact: true }));
    await p.locator(".dashboard-credit").first().waitFor();
    assert.equal(
      await p
        .getByRole("button", { name: "Copy allocation", exact: true })
        .isDisabled(),
      true,
    );
    await shot("credits-masked");
    const menu = p.getByRole("button", { name: "Open menu", exact: true });
    if (await menu.isVisible()) {
      await activate(menu);
      await p
        .getByRole("button", { name: "Close navigation", exact: true })
        .waitFor();
      await shot("navigation", false);
      await p.keyboard.press("Escape");
      await p
        .getByRole("button", { name: "Close navigation", exact: true })
        .waitFor({ state: "detached" });
    }
    check(
      mode.name +
        ": Credits stay masked with disabled Copy; shared menu opens and escapes when present",
    );
    await c.close();
    liveContexts.delete(c);
  }
  assert.deepEqual(
    fingerprint(),
    report.fingerprint,
    "runtime files stay fixed during responsive capture",
  );
  assert.equal(report.errors.length, 0);
} catch (error) {
  report.failure = String(error.stack || error);
  process.exitCode = 1;
} finally {
  report.fingerprintAtEnd = fingerprint();
  for (const context of liveContexts) await context.close().catch(() => {});
  await b.close();
  save();
}
console.log(JSON.stringify(report, null, 2));
