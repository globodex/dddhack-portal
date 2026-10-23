// Coordinated local-only QA of a matching compiled Worker and disposable D1.
// Run only after root releases the browser/load hold. No production URL is used.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "/tmp/ddehack-playwright-runner/node_modules/playwright/index.mjs";

assert.ok(
  process.argv.includes("--preview-ready"),
  "Root must confirm the matching disposable preview is ready",
);
const source = process.env.BUILD_HEAD;
const workerSha = process.env.WORKER_SHA;
assert.match(
  source || "",
  /^[a-f0-9]{7,40}$/i,
  "BUILD_HEAD must identify the compiled source",
);
assert.match(
  workerSha || "",
  /^[a-f0-9]{64}$/i,
  "WORKER_SHA must identify the compiled Worker",
);
const artifact = resolve(process.env.ARTIFACT_ROOT || process.cwd());
const workerPath = join(artifact, "dist/server/index.js");
const sha = () =>
  createHash("sha256").update(readFileSync(workerPath)).digest("hex");
assert.equal(
  sha(),
  workerSha,
  "Worker differs from the root-confirmed artifact",
);
const origin = "http://127.0.0.1:4173";
const allowSave = process.argv.includes("--save-synthetic-profile");
const baseOutput = resolve("evidence/v6-profile");
mkdirSync(baseOutput, { recursive: true });
const output = mkdtempSync(join(baseOutput, `${source.slice(0, 7)}-`));
const report = {
  source,
  workerSha,
  artifact,
  origin,
  output,
  browserSandbox: true,
  syntheticOnly: true,
  identity: "fake_alice / alice@portal.test",
  saveAuthorized: allowSave,
  checks: [],
  screenshots: [],
  defects: [],
  pageErrors: [],
  blockedRequests: [],
  writes: [],
  browserClosed: false,
};
const persist = () =>
  writeFileSync(join(output, "report.json"), JSON.stringify(report, null, 2));
function checked(name, details = {}) {
  report.checks.push({ name, passed: true, ...details });
  persist();
}
async function shot(page, name, viewport, fullPage = false) {
  await page.evaluate(() => document.fonts.ready);
  const path = join(
    output,
    `${name}--alice--${viewport.width}x${viewport.height}--${source.slice(0, 7)}.png`,
  );
  await page.screenshot({ path, fullPage, animations: "disabled" });
  report.screenshots.push({
    name,
    path,
    route: new URL(page.url()).pathname,
    viewport,
    fullPage,
    source,
    workerSha,
    inspected: false,
  });
  persist();
}
const browser = await chromium.launch({
  headless: true,
  chromiumSandbox: true,
});
report.browser = browser.version();
let committed = false;
async function newContext(viewport, options = {}) {
  const context = await browser.newContext({
    viewport,
    serviceWorkers: "block",
    reducedMotion: "reduce",
    ...options,
  });
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== origin) {
      report.blockedRequests.push({
        kind: "external",
        method: request.method(),
        url: url.origin + url.pathname,
      });
      return route.abort("blockedbyclient");
    }
    if (!["GET", "HEAD"].includes(request.method())) {
      let body;
      try {
        body = JSON.parse(request.postData() || "{}");
      } catch {}
      if (
        !allowSave ||
        committed ||
        request.method() !== "POST" ||
        url.pathname !== "/api/portal" ||
        body?.action !== "complete-profile"
      ) {
        report.blockedRequests.push({
          kind: "mutation",
          method: request.method(),
          action: body?.action || "unknown",
        });
        return route.abort("blockedbyclient");
      }
      assert.equal(body.data?.displayName, "Alice QA");
      assert.equal(body.data?.phone, "+12025550100");
      assert.equal(body.data?.organization, "Synthetic QA organization");
      assert.equal(body.data?.openaiOrgId, "");
      committed = true;
      report.writes.push({
        method: "POST",
        action: "complete-profile",
        syntheticIdentity: "fake_alice",
      });
    }
    return route.continue({
      headers: {
        ...request.headers(),
        "oai-authenticated-user-id": "fake_alice",
        "oai-authenticated-user-email": "alice@portal.test",
      },
    });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(7000);
  page.on("pageerror", (error) => report.pageErrors.push(error.message));
  return { context, page };
}
async function loaded(page) {
  await page.goto(origin + "/profile");
  await page.getByRole("heading", { name: "Profile", exact: true }).waitFor();
  await page.evaluate(() => document.fonts.ready);
  assert.equal(await page.locator(".profile-flow").count(), 1);
}
async function next(page) {
  const target =
    Number(await page.locator(".profile-flow").getAttribute("data-step")) + 1;
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.locator(`.profile-flow[data-step="${target}"]`).waitFor();
  assert.equal(
    await page
      .getByRole("heading", { name: "Profile", exact: true })
      .evaluate((el) => el === document.activeElement),
    true,
  );
}
async function metrics(page, label, { defaultFit = false } = {}) {
  const m = await page.evaluate(() => {
    const box = (selector) => {
      const r = document.querySelector(selector).getBoundingClientRect();
      return {
        x: r.x,
        y: r.y,
        width: r.width,
        height: r.height,
        right: r.right,
        bottom: r.bottom,
      };
    };
    const fields = document.querySelector(".profile-fields");
    const h = box(".profile-heading-title h1"),
      dot = box(".profile-heading-title .expressive-heading-dot");
    const flow = box(".profile-flow");
    return {
      flow,
      fields: box(".profile-fields"),
      footer: box(".profile-actions"),
      toolbar: box(".profile-toolbar"),
      titleCenterDelta: Math.abs(
        (Math.min(h.x, dot.x) + Math.max(h.right, dot.right)) / 2 -
          (flow.x + flow.width / 2),
      ),
      viewportWidth: innerWidth,
      viewportHeight: innerHeight,
      documentWidth: document.documentElement.scrollWidth,
      fieldsScrollHeight: fields.scrollHeight,
      fieldsClientHeight: fields.clientHeight,
      forms: document.querySelectorAll(".profile-step").length,
      basics: document.querySelectorAll(".profile-basics-layout").length,
      contact: document.querySelectorAll(".profile-contact-fields").length,
      about: document.querySelectorAll(".profile-about-fields").length,
    };
  });
  assert.ok(
    m.documentWidth <= m.viewportWidth + 1,
    `${label}: horizontal overflow ${JSON.stringify(m)}`,
  );
  if (m.viewportWidth <= 740) {
    assert.ok(
      m.fields.bottom <= m.footer.y + 1,
      `${label}: fields overlap actions`,
    );
  }
  const overlaps = await page
    .locator(
      '.profile-fields input:not([type="radio"]),.profile-fields select,.profile-avatar-choice,.sex-choices label',
    )
    .evaluateAll((nodes) => {
      const action = document
        .querySelector(".profile-next")
        .getBoundingClientRect();
      return nodes
        .filter((node) => {
          const r = node.getBoundingClientRect();
          return (
            r.width &&
            r.height &&
            r.left < action.right - 1 &&
            r.right > action.left + 1 &&
            r.top < action.bottom - 1 &&
            r.bottom > action.top + 1
          );
        })
        .map(
          (node) =>
            node.getAttribute("name") ||
            node.getAttribute("title") ||
            node.tagName.toLowerCase(),
        );
    });
  assert.deepEqual(
    overlaps,
    [],
    `${label}: primary action obstructs form controls`,
  );
  assert.ok(
    m.toolbar.bottom <= m.fields.y + 1,
    `${label}: toolbar overlaps fields`,
  );
  assert.ok(
    m.footer.bottom <= m.flow.bottom + 1,
    `${label}: actions outside flow`,
  );
  assert.ok(
    m.titleCenterDelta <= 2,
    `${label}: unbalanced title/dot ${m.titleCenterDelta}px`,
  );
  assert.equal(m.forms, 1, `${label}: one active form only`);
  assert.equal(
    m.basics + m.contact + m.about,
    1,
    `${label}: one active step only`,
  );
  if (defaultFit) {
    assert.ok(
      m.footer.bottom <= m.viewportHeight + 1,
      `${label}: primary action below default viewport`,
    );
    assert.ok(
      m.fieldsScrollHeight <= m.fieldsClientHeight + 1,
      `${label}: current fields need scrolling at default phone size`,
    );
  }
  checked(
    `${label}: bounded active step, centered heading and no horizontal overflow`,
    m,
  );
  return m;
}
async function reachable(page, label) {
  const fields = page.locator(".profile-fields");
  const inputs = fields.locator("input:not([type=radio]),select,a[href]");
  for (let i = 0; i < (await inputs.count()); i++) {
    await inputs.nth(i).focus();
    const bounds = await inputs.nth(i).evaluate((el) => {
      const r = el.getBoundingClientRect(),
        f = el.closest(".profile-fields").getBoundingClientRect();
      return {
        top: r.top,
        bottom: r.bottom,
        fieldTop: f.top,
        fieldBottom: f.bottom,
      };
    });
    assert.ok(
      bounds.top >= bounds.fieldTop - 1 &&
        bounds.bottom <= bounds.fieldBottom + 1,
      `${label}: focused field clipped ${JSON.stringify(bounds)}`,
    );
  }
  const action = page.locator(".profile-next");
  await action.scrollIntoViewIfNeeded();
  const box = await action.boundingBox();
  assert.ok(
    box.y >= -1 &&
      box.y + box.height <= (await page.evaluate(() => innerHeight)) + 1,
    `${label}: action unreachable after safe outer scroll`,
  );
  checked(
    `${label}: keyboard-focusable fields and primary action remain reachable`,
  );
}
async function fillFiveLinks(page) {
  const types = ["LinkedIn", "GitHub", "X", "Instagram", "Website"];
  const urls = [
    "https://linkedin.com/in/synthetic-alice",
    "https://github.com/synthetic-alice",
    "https://x.com/synthetic-alice",
    "https://instagram.com/synthetic-alice",
    "https://example.test/alice",
  ];
  const rows = page.locator(".profile-social-row");
  while ((await rows.count()) < 5)
    await page
      .getByRole("button", { name: "Add another", exact: true })
      .click();
  while ((await rows.count()) > 5)
    await rows.last().getByRole("button").click();
  for (let i = 0; i < 5; i++) {
    await rows.nth(i).locator("select").selectOption(types[i]);
    await rows.nth(i).locator('input[type="url"]').fill(urls[i]);
  }
  return urls;
}
try {
  const viewports = [
    ["desktop", { width: 1440, height: 900 }],
    ["mobile", { width: 390, height: 844 }],
    ["narrow", { width: 320, height: 640 }],
    ["tablet", { width: 834, height: 1194 }],
    ["short", { width: 390, height: 500 }],
    // Half-size CSS viewport + double pixel density models 200% desktop reflow.
    // This is explicit reflow coverage, not a claim of browser-chrome zoom testing.
    [
      "desktop-200pct-reflow",
      { width: 720, height: 450 },
      { deviceScaleFactor: 2 },
    ],
  ];
  for (const [name, viewport, options] of viewports) {
    const { context, page } = await newContext(viewport, options);
    try {
      await loaded(page);
      assert.equal(await page.locator(".profile-avatar-preview").count(), 0);
      assert.equal(
        await page.getByText("Your avatar", { exact: true }).count(),
        0,
      );
      if (name === "desktop") {
        for (const group of ["avatarColor", "avatarExpression"]) {
          for (const value of await page
            .locator(`input[name="${group}"]`)
            .evaluateAll((nodes) => nodes.map((n) => n.value))) {
            const radio = page.locator(
              `input[name="${group}"][value="${value}"]`,
            );
            await radio.locator("..").click();
            assert.equal(await radio.isChecked(), true);
          }
        }
        checked("all eight colors and expressions select independently");
      }
      await page.locator('label[title="Purple"]').click();
      await page.locator('label[title="Mixed plus"]').click();
      await page
        .getByRole("textbox", { name: "Full name", exact: true })
        .fill("Alice QA");
      await page
        .getByRole("textbox", { name: /^Bio/ })
        .fill("Synthetic local profile QA");
      await page
        .getByRole("radio", { name: "Non-binary", exact: true })
        .check();
      await page.locator(".profile-fields").evaluate((el) => {
        el.scrollTop = 0;
      });
      await page.evaluate(() => scrollTo(0, 0));
      const palette = await page
        .locator(".profile-color-grid .profile-avatar-choice")
        .evaluateAll((nodes) =>
          nodes.map((node) => {
            const r = node.getBoundingClientRect(),
              s = node
                .querySelector(".profile-color-swatch")
                .getBoundingClientRect();
            return {
              x: r.x,
              y: r.y,
              width: r.width,
              height: r.height,
              swatch: s.width,
            };
          }),
        );
      assert.equal(palette.length, 8);
      assert.ok(
        palette.every(
          (p) =>
            p.width >= 44 &&
            p.height >= 44 &&
            p.swatch >= 18 &&
            p.swatch <= (viewport.width > 740 ? 24 : 20),
        ),
      );
      const rowCount = new Set(palette.map((p) => Math.round(p.y))).size;
      if (viewport.width === 390)
        assert.equal(
          rowCount,
          1,
          "Eight palette targets must share one 390px row",
        );
      if (viewport.width === 320)
        assert.equal(
          rowCount,
          2,
          "Narrow palette must safely wrap four by two",
        );
      checked(`${name}: all eight palette dots have usable targets`, {
        palette,
        rowCount,
      });
      await metrics(page, `${name} step 1`, { defaultFit: name === "mobile" });
      await shot(page, `${name}-step1-avatar-selected`, viewport);
      await reachable(page, `${name} step 1`);
      await next(page);
      await page.getByRole("textbox", { name: /Phone/ }).fill("+12025550100");
      const urls = await fillFiveLinks(page);
      const rows = await page
        .locator(".profile-social-row")
        .evaluateAll((nodes) =>
          nodes.map((node) => {
            const boxes = [...node.querySelectorAll("select,input,button")].map(
              (el) => {
                const r = el.getBoundingClientRect();
                const style = getComputedStyle(el);
                return {
                  tag: el.tagName.toLowerCase(),
                  top: r.top,
                  bottom: r.bottom,
                  height: r.height,
                  minHeight: style.minHeight,
                  paddingTop: style.paddingTop,
                  paddingBottom: style.paddingBottom,
                };
              },
            );
            return {
              boxes,
              trashName: node
                .querySelector("button")
                .getAttribute("aria-label"),
              text: node.querySelector("button").textContent.trim(),
            };
          }),
        );
      const socialRowsAligned = rows.every(
        (row) =>
          row.boxes.every((b) => b.height >= 44) &&
          Math.max(...row.boxes.map((b) => b.top)) -
            Math.min(...row.boxes.map((b) => b.top)) <=
            1 &&
          !row.text,
      );
      if (!socialRowsAligned) {
        report.defects.push({
          viewport: name,
          kind: "social-row-alignment",
          rows,
        });
        persist();
      }
      assert.equal(
        await page.getByText(/Social profiles.*optional/).count(),
        0,
      );
      if (socialRowsAligned)
        checked(
          `${name}: five social rows align selector, URL and named icon-only trash`,
          { rows },
        );
      await page
        .getByRole("button", { name: "Remove X link 3", exact: true })
        .click();
      assert.equal(await page.locator(".profile-social-row").count(), 4);
      assert.deepEqual(
        await page
          .locator(".profile-social-url input")
          .evaluateAll((nodes) => nodes.map((node) => node.value)),
        urls.filter((_, i) => i !== 2),
      );
      await fillFiveLinks(page);
      await page
        .getByRole("button", { name: "Previous profile step", exact: true })
        .click();
      await page
        .getByRole("heading", { name: "Profile", exact: true })
        .waitFor();
      assert.equal(
        await page
          .getByRole("radio", { name: "Purple", exact: true })
          .isChecked(),
        true,
      );
      assert.equal(
        await page
          .getByRole("radio", { name: "Mixed plus", exact: true })
          .isChecked(),
        true,
      );
      assert.equal(
        await page
          .getByRole("textbox", { name: "Full name", exact: true })
          .inputValue(),
        "Alice QA",
      );
      await next(page);
      assert.deepEqual(
        await page
          .locator(".profile-social-url input")
          .evaluateAll((nodes) => nodes.map((node) => node.value)),
        urls,
      );
      checked(
        `${name}: Back/Next retains avatar, basics and five links; removal affects only its target`,
      );
      await page.locator(".profile-fields").evaluate((el) => {
        el.scrollTop = 0;
      });
      await page.evaluate(() => scrollTo(0, 0));
      await metrics(page, `${name} step 2`, { defaultFit: name === "mobile" });
      await shot(page, `${name}-step2-five-social-links`, viewport);
      await reachable(page, `${name} step 2`);
      if (name === "mobile") {
        await page.locator(".profile-platform-select select").first().focus();
        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("Escape");
        await shot(page, `${name}-step2-platform-focused`, viewport);
      }
      await next(page);
      assert.equal(
        await page.locator('select[name="bestDescription"] option').count(),
        7,
      );
      await page
        .locator('select[name="bestDescription"]')
        .selectOption("Independent Developer");
      await page
        .getByRole("textbox", { name: "Organization", exact: true })
        .fill("Synthetic QA organization");
      await page
        .getByRole("textbox", { name: "OpenAI org ID", exact: true })
        .fill("");
      await metrics(page, `${name} step 3`, { defaultFit: name === "mobile" });
      await shot(page, `${name}-step3-about`, viewport);
      await reachable(page, `${name} step 3`);
      assert.equal(
        await page.getByRole("button", { name: "Save", exact: true }).count(),
        1,
      );
      checked(`${name}: three steps, six Luma choices, no fourth review step`);
    } catch (error) {
      report.defects.push({ viewport: name, error: error.stack });
      await shot(page, `${name}-failure`, viewport, true).catch(() => {});
      persist();
    } finally {
      await context.close();
    }
  }
  if (allowSave) {
    const viewport = { width: 390, height: 844 };
    const { context, page } = await newContext(viewport);
    try {
      await loaded(page);
      await page
        .getByRole("textbox", { name: "Full name", exact: true })
        .fill("Alice QA");
      await page
        .getByRole("textbox", { name: /^Bio/ })
        .fill("Synthetic local profile QA");
      await page
        .getByRole("radio", { name: "Non-binary", exact: true })
        .check();
      await next(page);
      await page.getByRole("textbox", { name: /Phone/ }).fill("+12025550100");
      await next(page);
      await page
        .locator('select[name="bestDescription"]')
        .selectOption("Independent Developer");
      await page
        .getByRole("textbox", { name: "Organization", exact: true })
        .fill("Synthetic QA organization");
      await page
        .getByRole("textbox", { name: "OpenAI org ID", exact: true })
        .fill("");
      const responsePromise = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          new URL(response.url()).pathname === "/api/portal",
      );
      await page.getByRole("button", { name: "Save", exact: true }).click();
      const response = await responsePromise;
      assert.equal(response.status(), 200, "Synthetic save must succeed");
      await page.waitForURL(origin + "/teams");
      assert.equal(await page.locator("dialog[open]").count(), 0);
      assert.equal(report.writes.length, 1);
      await shot(page, "mobile-saved-direct-to-teams", viewport);
      checked(
        "Save commits synthetic Alice once and navigates directly to Teams without confirmation/review",
      );
    } catch (error) {
      report.defects.push({ viewport: "synthetic-save", error: error.stack });
    } finally {
      await context.close();
    }
  } else {
    report.saveSkipped =
      "Pass --save-synthetic-profile to permit one fake_alice complete-profile write to disposable D1";
  }
  assert.equal(report.pageErrors.length, 0, JSON.stringify(report.pageErrors));
  assert.equal(
    report.blockedRequests.length,
    0,
    JSON.stringify(report.blockedRequests),
  );
  assert.equal(report.defects.length, 0, JSON.stringify(report.defects));
} catch (error) {
  report.failure = error.stack;
  process.exitCode = 1;
} finally {
  await browser.close();
  report.browserClosed = true;
  report.workerShaAfter = sha();
  if (report.workerShaAfter !== workerSha) {
    report.defects.push({
      error: "Compiled Worker changed during QA; evidence invalid",
    });
    process.exitCode = 1;
  }
  persist();
}
console.log(
  JSON.stringify(
    {
      report: join(output, "report.json"),
      checks: report.checks.length,
      screenshots: report.screenshots.length,
      defects: report.defects.length,
      pageErrors: report.pageErrors.length,
      blockedRequests: report.blockedRequests.length,
      writes: report.writes.length,
      browserClosed: report.browserClosed,
    },
    null,
    2,
  ),
);
