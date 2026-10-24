// Guarded local compiled-browser checks. All mutations and external requests are blocked.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "@playwright/test";

assert.ok(process.env.CONTROL_MANIFEST, "Fresh disposable preview required");
const manifest = JSON.parse(readFileSync(process.env.CONTROL_MANIFEST, "utf8"));
for (const key of ["disposable", "syntheticOnly", "rootConfirmedReset"])
  assert.equal(manifest[key], true);
const origin = manifest.origin;
assert.equal(new URL(origin).hostname, "127.0.0.1");
assert.equal(
  execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  manifest.source,
);
const hash = () =>
  createHash("sha256")
    .update(readFileSync("dist/server/index.js"))
    .digest("hex");
assert.equal(hash(), manifest.worker);
const root = resolve("outputs/v7-popup-layout");
mkdirSync(root, { recursive: true });
const output = mkdtempSync(join(root, manifest.source.slice(0, 8) + "-"));
const report = {
  source: manifest.source,
  worker: manifest.worker,
  syntheticOnly: true,
  writes: false,
  chromiumSandbox: true,
  checks: [],
  layouts: [],
  errors: [],
  blocked: [],
  screenshots: [],
  limitations: [
    "Chromium mouse/keyboard/touch emulation, not physical-device or hosted-session evidence.",
  ],
};
const save = () =>
  writeFileSync(join(output, "report.json"), JSON.stringify(report, null, 2));
const check = (name, viewport) => {
  report.checks.push({ name, viewport, passed: true });
  save();
};
let browser;
try {
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true,
    chromiumSandbox: true,
  });
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
    { width: 320, height: 480 },
  ]) {
    const touch = viewport.width < 500;
    const context = await browser.newContext({
      viewport,
      hasTouch: touch,
      isMobile: touch,
      reducedMotion: "reduce",
      serviceWorkers: "block",
      extraHTTPHeaders: {
        "oai-authenticated-user-id": "fake_admin",
        "oai-authenticated-user-email": "admin@portal.test",
      },
    });
    await context.route("**/*", (route) => {
      const request = route.request(),
        url = new URL(request.url());
      if (
        url.origin !== origin ||
        !["GET", "HEAD"].includes(request.method())
      ) {
        report.blocked.push({ method: request.method(), path: url.pathname });
        return route.abort("blockedbyclient");
      }
      return route.continue();
    });
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    page.on("pageerror", (error) => report.errors.push(error.message));
    const activate = async (control) => {
      await control.scrollIntoViewIfNeeded();
      return touch ? control.tap() : control.click();
    };
    const layout = async (selector) =>
      page.evaluate((selector) => {
        const r = document.querySelector(selector).getBoundingClientRect();
        return {
          x: r.x,
          y: r.y,
          width: r.width,
          height: r.height,
          pageX: scrollX,
          pageY: scrollY,
          documentWidth: document.documentElement.scrollWidth,
          documentHeight: document.documentElement.scrollHeight,
        };
      }, selector);
    const sameLayout = (a, b, label) => {
      for (const key of Object.keys(a))
        assert.ok(
          Math.abs(a[key] - b[key]) <= 1,
          `${label} changed ${key}: ${a[key]} → ${b[key]}`,
        );
    };
    const bounded = async (dialog) => {
      const b = await dialog.boundingBox();
      assert.ok(
        b.x >= 0 &&
          b.y >= 0 &&
          b.x + b.width <= viewport.width + 1 &&
          b.y + b.height <= viewport.height + 1,
        JSON.stringify(b),
      );
      assert.equal(
        await dialog.evaluate((node) => node.matches(":modal")),
        true,
      );
    };
    for (const [kind, path, name, selector] of [
      ["person", "/admin/participants", "Alice", ".participants-table"],
      ["team", "/admin/teams", "Small Wonder", ".admin-team-list"],
    ]) {
      await page.goto(origin + path);
      const trigger =
        kind === "person"
          ? page.locator(".admin-status-menu > button").first()
          : page.getByRole("button", {
              name: `Change ${name} status`,
              exact: true,
            });
      await trigger.scrollIntoViewIfNeeded();
      const before = await layout(selector);
      await activate(trigger);
      const dialog = page.locator(".admin-status-popover[open]");
      await dialog.waitFor();
      await bounded(dialog);
      sameLayout(before, await layout(selector), `${kind} popup open`);
      assert.equal(await trigger.getAttribute("aria-expanded"), "true");
      assert.equal(
        await dialog.evaluate((node) => node.contains(document.activeElement)),
        true,
      );
      for (let n = 0; n < 7; n++) {
        await page.keyboard.press("Tab");
        assert.equal(
          await dialog.evaluate((node) =>
            node.contains(document.activeElement),
          ),
          true,
        );
      }
      await page.mouse.move(2, 2);
      await page.mouse.wheel(0, 350);
      await page.waitForTimeout(80);
      sameLayout(before, await layout(selector), `${kind} background wheel`);
      check(
        `${kind}: top-layer overlay preserves row/list geometry and scroll; native focus trap and background scroll blocking`,
        viewport,
      );
      const status = dialog.getByLabel("New status", { exact: true });
      const nextStatus = kind === "person" ? "Going" : "Locked";
      assert.equal(
        await status.evaluate((node) => {
          const r = node.getBoundingClientRect();
          return (
            document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) ===
            node
          );
        }),
        true,
        "Native status select must own its touch target",
      );
      await status.selectOption(nextStatus);
      assert.equal(await status.inputValue(), nextStatus);
      const saveButton = dialog.getByRole("button", {
        name: "Review status change",
        exact: true,
      });
      await activate(saveButton);
      const confirmation = page.locator(".confirmation-dialog[open]");
      await confirmation.waitFor();
      await bounded(confirmation);
      assert.equal(
        await confirmation.evaluate((node) =>
          node.contains(document.activeElement),
        ),
        true,
      );
      await activate(
        confirmation.getByRole("button", { name: "Cancel", exact: true }),
      );
      await confirmation.waitFor({ state: "hidden" });
      assert.equal(await dialog.isVisible(), true);
      await page.waitForFunction(() =>
        document
          .querySelector(".admin-status-popover[open]")
          ?.contains(document.activeElement),
      );
      assert.equal(
        await status.inputValue(),
        nextStatus,
        "Cancel keeps the uncommitted selection",
      );
      sameLayout(before, await layout(selector), `${kind} confirmation cancel`);
      check(
        `${kind}: confirmation stacks above status dialog and cancellation preserves the page and draft`,
        viewport,
      );
      await dialog
        .getByRole("button", { name: "Close status menu", exact: true })
        .scrollIntoViewIfNeeded();
      const screenshot = join(
        output,
        `${kind}-${viewport.width}x${viewport.height}.png`,
      );
      await page.screenshot({ path: screenshot });
      report.screenshots.push(screenshot);
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "hidden" });
      assert.equal(
        await trigger.evaluate((node) => node === document.activeElement),
        true,
      );
      sameLayout(before, await layout(selector), `${kind} Escape`);
      await activate(trigger);
      await dialog.waitFor();
      await page.mouse.click(2, 2);
      await dialog.waitFor({ state: "hidden" });
      sameLayout(before, await layout(selector), `${kind} outside dismissal`);
      assert.equal(await page.locator(".admin-import-dialog[open]").count(), 0);
      check(
        `${kind}: Escape/outside dismissal restores focus without scroll/reflow or click-through`,
        viewport,
      );
      await activate(trigger);
      await dialog.waitFor();
      await activate(
        dialog.getByRole("button", { name: "Close status menu", exact: true }),
      );
      await dialog.waitFor({ state: "hidden" });
      sameLayout(before, await layout(selector), `${kind} close button`);
      check(
        `${kind}: visible close control accepts mouse/touch without changing the underlying layout`,
        viewport,
      );
      report.layouts.push({
        kind,
        viewport,
        before,
        after: await layout(selector),
      });
    }
    await page.goto(origin + "/admin/participants");
    const add = page.getByRole("button", {
      name: "Add participants",
      exact: true,
    });
    await add.scrollIntoViewIfNeeded();
    const importBefore = await layout(".participants-table");
    await activate(add);
    const importing = page.locator(".admin-import-dialog[open]");
    await importing.waitFor();
    await bounded(importing);
    sameLayout(
      importBefore,
      await layout(".participants-table"),
      "import open",
    );
    await page.keyboard.press("Escape");
    await importing.waitFor({ state: "hidden" });
    sameLayout(
      importBefore,
      await layout(".participants-table"),
      "import close",
    );
    check(
      "Import dialog overlays the table, fits viewport and restores opener without layout/scroll change",
      viewport,
    );

    await context.setExtraHTTPHeaders({
      "oai-authenticated-user-id": "fake_alice",
      "oai-authenticated-user-email": "alice@portal.test",
    });
    for (const [path, triggerSelector, dialogSelector, contentSelector] of [
      [
        "/discover/participants",
        ".discover-people-cards button",
        ".discovery-profile[open]",
        ".discover-people-cards",
      ],
      [
        "/discover/teams",
        ".discover-view-team",
        ".discover-team-dialog-v6[open]",
        ".discover-teams",
      ],
    ]) {
      await page.goto(origin + path);
      const trigger = page.locator(triggerSelector).first();
      await trigger.scrollIntoViewIfNeeded();
      const before = await layout(contentSelector);
      await activate(trigger);
      const dialog = page.locator(dialogSelector);
      await dialog.waitFor();
      await bounded(dialog);
      sameLayout(before, await layout(contentSelector), path + " open");
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "hidden" });
      assert.equal(
        await trigger.evaluate((node) => node === document.activeElement),
        true,
      );
      sameLayout(before, await layout(contentSelector), path + " close");
      check(
        `${path}: native dialog preserves cards/list, fits viewport and restores focus with Escape`,
        viewport,
      );
    }
    await page.goto(origin + "/dashboard");
    await page.getByRole("tab", { name: /Project/ }).click();
    const historyTrigger = page.getByRole("button", { name: /^Versions / });
    await historyTrigger.scrollIntoViewIfNeeded();
    const historyBefore = await layout(".dashboard-v6");
    await activate(historyTrigger);
    const history = page.locator(".project-history-dialog[open]");
    await history.waitFor();
    await bounded(history);
    await page
      .getByRole("heading", { name: "Committed history", exact: true })
      .waitFor();
    sameLayout(historyBefore, await layout(".dashboard-v6"), "history open");
    await page.keyboard.press("Escape");
    await history.waitFor({ state: "hidden" });
    sameLayout(historyBefore, await layout(".dashboard-v6"), "history close");
    check(
      "Committed history remains a bounded native overlay with Escape and scroll-preserving focus restoration",
      viewport,
    );
    await context.close();
  }
  assert.equal(report.errors.length, 0, JSON.stringify(report.errors));
  assert.equal(report.blocked.length, 0, JSON.stringify(report.blocked));
  assert.equal(hash(), manifest.worker);
} catch (error) {
  report.failure = String(error.stack || error);
  process.exitCode = 1;
} finally {
  await browser?.close();
  report.browserClosed = true;
  save();
  console.log(
    JSON.stringify(
      {
        report: join(output, "report.json"),
        checks: report.checks.length,
        failure: report.failure,
        blocked: report.blocked,
        errors: report.errors,
      },
      null,
      2,
    ),
  );
}
