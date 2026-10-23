// Disposable local editor QA only. No production URL or provider access.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  openSync,
  closeSync,
  unlinkSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "playwright-core";

if (!process.argv.includes("--write-ready")) {
  console.log(
    "Prepared only. Requires ADMIN_WRITE_MANIFEST from a fresh disposable reset.",
  );
  process.exit(0);
}
const manifest = JSON.parse(
  readFileSync(process.env.ADMIN_WRITE_MANIFEST, "utf8"),
);
assert.equal(manifest.disposable, true);
assert.equal(manifest.syntheticOnly, true);
assert.equal(manifest.rootConfirmedReset, true);
assert.match(manifest.resetToken, /^[a-f0-9-]{36}$/i);
const origin = new URL(manifest.origin);
assert.equal(origin.protocol, "http:");
assert.equal(origin.hostname, "127.0.0.1");
assert.ok(origin.port);
const artifactRoot = resolve(manifest.artifactRoot),
  source = manifest.source,
  worker = manifest.worker;
const hash = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");
assert.equal(
  execFileSync("git", ["-C", artifactRoot, "rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  source,
);
assert.equal(hash(join(artifactRoot, "dist/server/index.js")), worker);
const mode = process.env.ADMIN_WRITE_MODE || "mouse";
assert.ok(["mouse", "keyboard", "touch"].includes(mode));
writeFileSync(`/tmp/ddehack-admin-reset-${manifest.resetToken}`, "consumed\n", {
  flag: "wx",
  mode: 0o600,
});
const lease = `/tmp/ddehack-admin-write-${origin.port}.lock`,
  leaseToken = `content:${source}:${process.pid}`;
const fd = openSync(lease, "wx", 0o600);
writeFileSync(fd, leaseToken);
closeSync(fd);
const output = resolve(
  "evidence/v7-admin-editor",
  `${source.slice(0, 8)}-${mode}-${Date.now().toString(36)}`,
);
mkdirSync(output, { recursive: true });
const report = {
  source,
  worker,
  mode,
  origin: origin.origin,
  syntheticOnly: true,
  browserSandbox: true,
  checks: [],
  blocked: [],
  pageErrors: [],
  actions: [],
  requests: [],
  captures: [],
  limitations: [
    "Browser emulation, not physical touch hardware.",
    "Keyboard button activation uses focus plus Enter/Space; fill uses Playwright inputs.",
    "Timing measures local click-to-first-visible-feedback and local request waterfall, not hosted latency.",
    "Only exact public-content fixture save/publish permitted; no Site deployment or production mutation.",
  ],
};
let browser,
  page,
  permit = null;
const pending = [];
const ownerEmail = readFileSync(
  join(artifactRoot, "lib/identity.ts"),
  "utf8",
).match(/OWNER_EMAIL\s*=\s*"([^"]+)"/)[1];
async function activate(locator) {
  await locator.scrollIntoViewIfNeeded();
  if (mode === "touch") await locator.tap();
  else if (mode === "keyboard") {
    await locator.focus();
    assert.equal(
      await locator.evaluate((e) => e === document.activeElement),
      true,
    );
    await page.keyboard.press(
      (await locator.getAttribute("type")) === "checkbox" ? "Space" : "Enter",
    );
  } else await locator.click();
}
async function check(name, fn) {
  try {
    const detail = await fn();
    report.checks.push({ name, passed: true, ...detail });
  } catch (error) {
    report.checks.push({ name, passed: false, error: error.message });
    throw error;
  }
}
async function view() {
  return page.evaluate(async () => {
    const r = await fetch("/api/portal?view=/admin/settings", {
      cache: "no-store",
    });
    if (!r.ok) throw new Error("Settings read " + r.status);
    return r.json();
  });
}
async function confirm(cancel = false) {
  const d = page.locator("dialog.confirmation-dialog[open]");
  await d.waitFor();
  assert.equal(
    await d
      .getByRole("button", { name: "Cancel", exact: true })
      .evaluate((e) => e === document.activeElement),
    true,
  );
  await activate(
    cancel
      ? d.getByRole("button", { name: "Cancel", exact: true })
      : d.locator("button.button:not(.secondary)"),
  );
  await d.waitFor({ state: "hidden" });
}
async function feedback() {
  await page.waitForFunction(() => window.__editorFeedback.length > 0);
  const items = await page.evaluate(() => window.__editorFeedback.splice(0));
  report.actions.push(...items);
  assert.ok(
    items.every((item) => item.feedbackMs < 1000),
    "First visible action feedback must arrive within1s locally",
  );
  return items;
}
async function capture(name) {
  const path = join(output, `${mode}-${name}.png`);
  await page.screenshot({ path, fullPage: false });
  report.captures.push({
    path,
    source,
    worker,
    mode,
    viewport: page.viewportSize(),
    actualScreenshot: true,
  });
}
try {
  browser = await chromium.launch({
    headless: true,
    chromiumSandbox: true,
    args: [],
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  });
  const context = await browser.newContext({
    viewport:
      mode === "touch"
        ? { width: 390, height: 844 }
        : { width: 1440, height: 1000 },
    hasTouch: mode === "touch",
    isMobile: mode === "touch",
    serviceWorkers: "block",
    reducedMotion: "reduce",
  });
  await context.route("**/*", async (route) => {
    const r = route.request(),
      u = new URL(r.url());
    if (u.origin !== origin.origin) {
      report.blocked.push({
        kind: "external",
        method: r.method(),
        path: u.pathname,
      });
      return route.abort();
    }
    if (!["GET", "HEAD"].includes(r.method())) {
      let body;
      try {
        body = JSON.parse(r.postData() || "{}");
      } catch {}
      const allowed =
        r.method() === "POST" &&
        u.pathname === "/api/portal" &&
        permit &&
        body?.action === permit.action &&
        body?.data?.scope === "public" &&
        body?.data?.revision === permit.revision &&
        (permit.action === "content-publish" ||
          JSON.stringify(body?.data?.content) ===
            JSON.stringify(permit.content));
      if (!allowed) {
        report.blocked.push({
          kind: "unallowlisted-write",
          action: body?.action,
        });
        return route.abort();
      }
      permit = null;
    }
    await route.continue({
      headers: {
        ...r.headers(),
        "oai-authenticated-user-id": "fake_owner",
        "oai-authenticated-user-email": ownerEmail,
        "oai-authenticated-user-full-name": "Synthetic owner",
      },
    });
  });
  await context.addInitScript(() => {
    window.__editorFeedback = [];
    let action;
    document.addEventListener(
      "click",
      (event) => {
        const button = event.target.closest("button");
        if (!button?.closest(".admin-content-editor")) return;
        action = {
          label: button.getAttribute("aria-label") || button.innerText,
          start: performance.now(),
          at: performance.timeOrigin + performance.now(),
        };
      },
      true,
    );
    new MutationObserver(() => {
      if (!action) return;
      const form = document.querySelector(".admin-content-editor"),
        dialog = document.querySelector("dialog.confirmation-dialog[open]");
      const status = form?.querySelector("[role=status]")?.textContent;
      const busy = form?.getAttribute("aria-busy") === "true";
      if (!dialog && !status && !busy) return;
      window.__editorFeedback.push({
        ...action,
        feedbackMs: performance.now() - action.start,
        status: dialog ? "confirmation" : busy ? "busy" : status,
      });
      action = null;
    }).observe(document, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["aria-busy", "open", "disabled"],
    });
  });
  page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on("pageerror", (e) => report.pageErrors.push(e.message));
  const requests = new Map();
  page.on("request", (r) => {
    if (!new URL(r.url()).pathname.startsWith("/api/")) return;
    const item = {
      method: r.method(),
      url: new URL(r.url()).pathname + new URL(r.url()).search,
      start: Date.now(),
    };
    if (r.method() === "POST")
      item.action = JSON.parse(r.postData() || "{}").action;
    requests.set(r, item);
    report.requests.push(item);
  });
  page.on("response", (r) => {
    const item = requests.get(r.request());
    if (item) {
      item.status = r.status();
      item.headersMs = Date.now() - item.start;
      pending.push(
        r.finished().then(() => {
          item.finishedMs = Date.now() - item.start;
        }),
      );
    }
  });
  await page.goto(origin.origin + "/admin/settings", {
    waitUntil: "networkidle",
  });
  const initial = await view();
  assert.equal(initial.content.revision, 0, "Fresh content fixture required");
  const original = JSON.parse(initial.content.draft);
  const disclosure = page.locator("details").filter({
    has: page
      .locator("summary")
      .getByText("Public event content", { exact: true }),
  });
  await activate(disclosure.locator("summary"));
  const form = page.locator(".admin-content-editor");
  await form.waitFor();
  for (const [collection, addLabel, removeLabel, groupPrefix] of [
    ["agenda", "Add agenda entry", "Remove entry", "Agenda entry"],
    ["faqs", "Add question", "Remove question", "Question"],
  ]) {
    await check(
      `${collection} add, cancel removal, confirmed removal and immediate feedback`,
      async () => {
        const before = report.requests.filter(
          (r) => r.method === "POST",
        ).length;
        await activate(
          form.getByRole("button", { name: addLabel, exact: true }),
        );
        await feedback();
        const index = original[collection].length + 1,
          group = form.getByRole("group", {
            name: `${groupPrefix} ${index}`,
            exact: true,
          });
        await group.waitFor();
        const remove = group.getByRole("button", {
          name: new RegExp(
            `^Remove ${collection === "agenda" ? "agenda entry" : "question"} ${index}:`,
          ),
        });
        await activate(remove);
        await feedback();
        await confirm(true);
        assert.equal(await group.count(), 1);
        await activate(remove);
        await feedback();
        await confirm();
        assert.equal(await group.count(), 0);
        assert.equal(
          report.requests.filter((r) => r.method === "POST").length,
          before,
          "Local add/remove must make no write requests",
        );
        return { networkWrites: 0, defaultCancel: true };
      },
    );
  }
  const marker = `Synthetic ${mode} editor`;
  const expected = structuredClone(original);
  expected.agenda[0].title = marker + " agenda";
  expected.faqs[0].question = marker + " question?";
  expected.faqs[0].answer = marker + " answer.";
  await form
    .getByRole("group", { name: "Agenda entry 1", exact: true })
    .getByLabel("title", { exact: true })
    .fill(expected.agenda[0].title);
  const faq = form.getByRole("group", { name: "Question 1", exact: true });
  await faq
    .getByRole("textbox", { name: "question", exact: true })
    .fill(expected.faqs[0].question);
  await faq
    .getByRole("textbox", { name: "answer", exact: true })
    .fill(expected.faqs[0].answer);
  await check(
    "Draft save cancel preserves server; confirmed save persists exactly once",
    async () => {
      await activate(
        form.getByRole("button", { name: "Save draft", exact: true }),
      );
      await feedback();
      await confirm(true);
      assert.equal((await view()).content.revision, 0);
      permit = { action: "content-save", revision: 0, content: expected };
      await activate(
        form.getByRole("button", { name: "Save draft", exact: true }),
      );
      await feedback();
      await confirm();
      await form
        .getByRole("button", { name: "Save draft", exact: true })
        .waitFor({ state: "visible" });
      await page.waitForFunction(
        () =>
          document
            .querySelector(".admin-content-editor")
            ?.getAttribute("aria-busy") === "false",
      );
      const saved = await view();
      assert.equal(saved.content.revision, 1);
      assert.deepEqual(JSON.parse(saved.content.draft), expected);
      assert.equal(saved.content.published, null);
      return { revision: 1 };
    },
  );
  await check(
    "Saved draft publish cancel preserves public content; confirmed publish changes only synthetic content",
    async () => {
      await activate(
        form.getByRole("button", { name: "Publish saved draft", exact: true }),
      );
      await feedback();
      await confirm(true);
      assert.equal((await view()).content.published, null);
      permit = { action: "content-publish", revision: 1 };
      await activate(
        form.getByRole("button", { name: "Publish saved draft", exact: true }),
      );
      await feedback();
      await confirm();
      await page.waitForFunction(
        () =>
          document
            .querySelector(".admin-content-editor")
            ?.getAttribute("aria-busy") === "false",
      );
      const published = await view();
      assert.equal(published.content.revision, 2);
      assert.deepEqual(JSON.parse(published.content.published), expected);
      return { revision: 2 };
    },
  );
  await capture("agenda-faq-controls");
  assert.equal(report.requests.filter((r) => r.method === "POST").length, 2);
  await Promise.allSettled(pending);
  await context.close();
} catch (error) {
  report.failure = error.stack;
} finally {
  await browser?.close();
  await Promise.allSettled(pending);
  report.sourceUnchanged =
    execFileSync("git", ["-C", artifactRoot, "rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim() === source;
  report.workerUnchanged =
    hash(join(artifactRoot, "dist/server/index.js")) === worker;
  report.summary = {
    checks: report.checks.length,
    passed: report.checks.filter((c) => c.passed).length,
    failed: report.checks.filter((c) => !c.passed).length,
  };
  report.feedbackMs = report.actions.map((a) => a.feedbackMs);
  report.finishedAt = new Date().toISOString();
  writeFileSync(
    join(output, "receipt.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  if (readFileSync(lease, "utf8") === leaseToken) unlinkSync(lease);
}
console.log(
  JSON.stringify(
    {
      output,
      ...report.summary,
      failure: report.failure,
      blocked: report.blocked,
      feedbackMs: report.feedbackMs,
    },
    null,
    2,
  ),
);
process.exitCode =
  report.failure ||
  report.blocked.length ||
  report.pageErrors.length ||
  !report.sourceUnchanged ||
  !report.workerUnchanged
    ? 1
    : 0;
