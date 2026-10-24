import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
const origin = "http://localhost:3008",
  out = "evidence/viewer-registration/after";
const report = {
  source: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  applicationEquivalentTo: "9ebee61d29b44fbb0dbf7e5382ed2fd3ba7b96c9",
  syntheticOnly: true,
  method:
    "Already registered Stranger from real admin import. Read-only requests, local unsaved field/radio edits; no team or registration mutation.",
  cases: [],
};
const b = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  headless: true,
  chromiumSandbox: false,
});
try {
  for (const viewport of [
    { width: 320, height: 480 },
    { width: 390, height: 480 },
    { width: 768, height: 1024 },
    { width: 1440, height: 900 },
  ]) {
    const c = await b.newContext({
      viewport,
      reducedMotion: "reduce",
      ...(viewport.width < 500 ? { isMobile: true, hasTouch: true } : {}),
    });
    await c.addCookies([
      { name: "portal_local_fixture", value: "stranger", url: origin },
    ]);
    const item = { viewport, requests: [], errors: [] };
    await c.route("**/*", (r) =>
      new URL(r.request().url()).origin !== origin ||
      !["GET", "HEAD"].includes(r.request().method())
        ? r.abort("blockedbyclient")
        : r.continue(),
    );
    const p = await c.newPage();
    p.on("request", (q) =>
      item.requests.push({ url: q.url(), method: q.method() }),
    );
    p.on("pageerror", (e) => item.errors.push(e.message));
    await p.goto(origin + "/dashboard", {
      waitUntil: "domcontentloaded",
      timeout: 120000,
    });
    await p.locator(".team-create-form[data-hydrated=true]").waitFor();
    await p.evaluate(() => document.fonts.ready);
    assert.equal(
      await p.locator(".viewer-welcome,.page-error-card").count(),
      0,
    );
    Object.assign(
      item,
      await p.evaluate(() => {
        const selectors = [
          ".dashboard-empty-team",
          ".team-find-panel",
          ".team-find-panel h3",
          ".team-create-form",
          ".team-creation-identity",
          ".team-creation-palette",
          ".team-creation-fields input",
          ".team-creation-fields textarea",
          ".team-creation-footer button",
        ];
        return {
          overflow: document.documentElement.scrollWidth > innerWidth,
          grid: getComputedStyle(
            document.querySelector(".dashboard-empty-team"),
          ).gridTemplateColumns,
          boxes: selectors.map((s) => ({
            selector: s,
            box: document.querySelector(s).getBoundingClientRect().toJSON(),
          })),
          colors: [
            ...document.querySelectorAll(".team-creation-palette>label"),
          ].map((e) => e.getBoundingClientRect().toJSON()),
        };
      }),
    );
    assert.equal(item.overflow, false);
    for (const { selector, box } of item.boxes) {
      assert.ok(
        box.x >= -0.5 && box.right <= viewport.width + 0.5,
        selector + " fits width",
      );
    }
    for (const box of item.colors)
      assert.ok(box.width >= 44 && box.height >= 44, "All color controls44px");
    assert.equal(item.colors.length, 8);
    if (viewport.width <= 850)
      assert.ok(!item.grid.includes(" "), "Stacked single column");
    item.file = `${out}/registered-teamless-fixed-${viewport.width}x${viewport.height}.png`;
    await p.screenshot({
      path: item.file,
      fullPage: true,
      animations: "disabled",
    });
    const form = p.locator(".team-create-form");
    await form
      .getByRole("textbox", { name: "Team name", exact: false })
      .fill("Synthetic Registration Team");
    await form
      .getByRole("textbox", { name: "Team intro", exact: true })
      .fill(
        "Synthetic unsaved team introduction for keyboard and responsive checks.",
      );
    const orange = form.getByRole("radio", { name: "Orange", exact: true });
    const colorLabel = orange.locator("..");
    if (viewport.width < 500) await colorLabel.tap();
    else await colorLabel.click();
    assert.equal(await orange.isChecked(), true);
    await form
      .getByRole("textbox", { name: "Team name", exact: false })
      .focus();
    await p.keyboard.press("Tab");
    assert.equal(
      await form
        .getByRole("textbox", { name: "Team intro", exact: true })
        .evaluate((e) => e === document.activeElement),
      true,
    );
    await p.keyboard.press("Tab");
    const cta = form.getByRole("button", { name: "Create team", exact: true });
    assert.equal(await cta.evaluate((e) => e === document.activeElement), true);
    const hit = await cta.evaluate((e) => {
      const r = e.getBoundingClientRect();
      return {
        box: r.toJSON(),
        hit: e.contains(
          document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2),
        ),
        focus: e === document.activeElement,
      };
    });
    assert.ok(hit.box.height >= 44 && hit.box.width >= 44);
    assert.equal(hit.hit, true);
    item.interaction = {
      orangeSelected: true,
      nameValue: await form
        .getByRole("textbox", { name: "Team name", exact: false })
        .inputValue(),
      keyboardNameIntroCreate: true,
      cta: hit,
    };
    if (viewport.width < 500) {
      item.focusFile = `${out}/registered-teamless-fixed-cta-${viewport.width}x${viewport.height}.png`;
      await p.screenshot({ path: item.focusFile, animations: "disabled" });
    }
    assert.equal(
      item.requests.some((q) => !["GET", "HEAD"].includes(q.method)),
      false,
    );
    assert.equal(item.errors.length, 0);
    report.cases.push(item);
    await c.close();
    console.log(JSON.stringify({ viewport, result: "PASS" }));
  }
  report.result = "PASS";
} catch (e) {
  report.result = "FAIL";
  report.failure = { message: e.message, stack: e.stack };
  throw e;
} finally {
  await b.close();
  report.browserClosed = true;
  writeFileSync(out + "/teamless-report.json", JSON.stringify(report, null, 2));
}
