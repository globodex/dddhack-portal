// Prepared control coverage. Root must provide a matching reset disposable fixture.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const cases = [
  [
    "route-role",
    "All supplied roles",
    "List, detail and submission capabilities",
  ],
  [
    "clean-reference",
    "All supplied roles and device modes",
    "Screenshots before any mutations",
  ],
  ["search", "Member", "Query, no result and clear"],
  [
    "pagination",
    "Member",
    "Previous disabled, Next and Previous; requires more than one page",
  ],
  ["detail-back", "Member", "List row, comments anchor and Back to Projects"],
  [
    "external-links",
    "Member",
    "GitHub and optional deployment activation; destination blocked",
  ],
  [
    "keyboard-focus",
    "Member and leader",
    "Actual Tab traversal, visible focus and Enter/Space",
  ],
  ["viewer-disabled", "Viewer", "No enabled upvote or comment composer"],
  [
    "nonleader-disabled",
    "Nonleader",
    "Disabled submission controls and no commit action",
  ],
  [
    "attempt3-disabled",
    "Leader with three commits",
    "Read-only controls and retained history",
  ],
  [
    "vote-pending-rollback",
    "Eligible member, unvoted target",
    "One pending request, synthetic HTTP error, rollback and retry enabled",
  ],
  [
    "vote-positive-unique",
    "Eligible member, unvoted target",
    "Vote persists, UI disables, direct duplicate creates no second vote",
  ],
  [
    "comment-empty-error",
    "Eligible member",
    "Empty disabled; too-short server rejection",
  ],
  [
    "comment-valid-escaped",
    "Eligible member",
    "Valid literal markup is escaped, trimmed and persists once",
  ],
  [
    "wizard-fields",
    "Eligible leader",
    "Required essentials and GitHub validation; optional deployment blank",
  ],
  [
    "wizard-state",
    "Eligible leader",
    "Three steps, Back/Next, six exact checkbox choices, separate Cerebras radios",
  ],
  [
    "upload-mime-size",
    "Eligible leader",
    "Invalid MIME and oversized image rejected locally",
  ],
  [
    "upload-ratio",
    "Eligible leader",
    "Real fixture banner in logo slot and logo in banner slot rejected by server",
  ],
  [
    "upload-valid-remove",
    "Eligible leader",
    "Existing real fixture bytes replace both images; remove and restore",
  ],
  [
    "accuracy-cancel",
    "Eligible leader",
    "Missing accuracy blocks dialog; final Cancel/Escape makes no request",
  ],
  [
    "draft-immutable",
    "Eligible leader",
    "Save draft persists, consumes no attempt, preserves committed payload hashes",
  ],
  [
    "commit-max3",
    "Eligible leader with remaining attempts",
    "UI commits remaining versions then UI and server reject further edits",
  ],
  [
    "commit-idempotent",
    "Same leader",
    "Exact repeated request returns same version without fourth attempt",
  ],
  [
    "public-privacy",
    "Anonymous and Viewer",
    "Public projection omits private fields; no new score stage",
  ],
];
cases.push([
  "history-dialog",
  "Leader/nonleader/attempt3",
  "Committed history, Close, Escape and focus return",
]);
cases.push([
  "wizard-exit",
  "Eligible leader",
  "Step-one Back returns to Dashboard Project without writes",
]);
const matrix = cases.map(([id, roles, scope]) => ({
  id,
  roles,
  scope,
  status: "pending",
  results: [],
}));
if (!process.argv.includes("--preview-ready")) {
  console.log(
    JSON.stringify(
      {
        preparedOnly: true,
        cases: matrix.length,
        run: "Set V6_CONTROL_MANIFEST to the root-confirmed JSON. Pass --preview-ready; add --mutations and V6_RESET_TOKEN only after root reset coordination.",
      },
      null,
      2,
    ),
  );
  process.exit(0);
}
const manifest = JSON.parse(
  readFileSync(process.env.V6_CONTROL_MANIFEST || "", "utf8"),
);
assert.equal(manifest.disposable, true);
assert.equal(manifest.syntheticOnly, true);
assert.match(manifest.source || "", /^[a-f0-9]{40}$/);
assert.match(manifest.worker || "", /^[a-f0-9]{64}$/);
const artifact = resolve(manifest.artifactRoot);
const hash = (value) => createHash("sha256").update(value).digest("hex");
const workerHash = () =>
  hash(readFileSync(join(artifact, "dist/server/index.js")));
assert.equal(workerHash(), manifest.worker);
assert.equal(
  execFileSync("git", ["-C", artifact, "rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  manifest.source,
);
const origin = "http://127.0.0.1:4173";
assert.equal(manifest.origin, origin);
assert.match(manifest.project?.slug || "", /^[a-zA-Z0-9_-]+$/);
assert.ok(manifest.project?.id);
for (const actor of Object.values(manifest.actors || {})) {
  assert.match(actor.id, /^(fake_|load300_)/);
  assert.match(actor.email, /^[^@]+@[^@]+\.test$/);
}
const mutations = process.argv.includes("--mutations");
if (mutations) {
  assert.equal(manifest.rootConfirmedReset, true);
  assert.ok(manifest.resetToken?.length >= 16);
  assert.ok(
    process.env.V6_RESET_TOKEN === manifest.resetToken,
    "Reset coordination token must match",
  );
  assert.ok(manifest.actors.member && manifest.actors.leader);
}
mkdirSync("evidence/v6-project-controls", { recursive: true });
const output = mkdtempSync(
  "evidence/v6-project-controls/" + manifest.source.slice(0, 8) + "-",
);
const report = {
  source: manifest.source,
  worker: manifest.worker,
  artifact,
  origin,
  output,
  syntheticOnly: true,
  physicalDeviceTested: false,
  mutationsEnabled: mutations,
  matrix,
  inventory: [],
  screenshots: [],
  pageErrors: [],
  deniedRequests: [],
  expectedExternalBlocks: [],
  requests: [],
  limitations: [
    "Emulated touch, mouse and keyboard only. No physical device claim.",
    "Screenshot files require visual inspection before acceptance.",
    "Fixture roles/routes absent from the manifest are recorded unavailable, never passed.",
  ],
};
const save = () =>
  writeFileSync(join(output, "report.json"), JSON.stringify(report, null, 2));
const record = (id, status, detail, device) => {
  const entry = matrix.find((c) => c.id === id);
  entry.results.push({ status, device, detail });
  entry.status = entry.results.some((r) => r.status === "failed")
    ? "failed"
    : entry.results.some((r) => r.status === "passed")
      ? entry.results.some((r) => ["blocked", "unavailable"].includes(r.status))
        ? "partial"
        : "passed"
      : status;
  save();
};
async function check(id, device, fn) {
  try {
    record(id, "passed", await fn(), device);
  } catch (e) {
    record(id, "failed", e.message, device);
  }
}
const { chromium } =
  await import("/tmp/ddehack-playwright-runner/node_modules/playwright/index.mjs");
const browser = await chromium.launch({
  headless: true,
  chromiumSandbox: true,
});
const allDevices = [
  {
    name: "desktop-mouse",
    viewport: { width: 1440, height: 900 },
    mode: "mouse",
    hasTouch: false,
    isMobile: false,
  },
  {
    name: "tablet-touch",
    viewport: { width: 834, height: 1194 },
    mode: "touch",
    hasTouch: true,
    isMobile: true,
  },
  {
    name: "mobile-touch",
    viewport: { width: 390, height: 844 },
    mode: "touch",
    hasTouch: true,
    isMobile: true,
  },
  {
    name: "narrow-touch",
    viewport: { width: 320, height: 740 },
    mode: "touch",
    hasTouch: true,
    isMobile: true,
  },
  {
    name: "desktop-keyboard",
    viewport: { width: 1440, height: 900 },
    mode: "keyboard",
    hasTouch: false,
    isMobile: false,
  },
];
const requestedDevice = process.argv
  .find((arg) => arg.startsWith("--device="))
  ?.slice(9);
const devices = requestedDevice
  ? allDevices.filter((device) => device.name === requestedDevice)
  : allDevices;
assert.ok(devices.length, "Unknown --device value");
const postActions = new Set([
  "upvote-project",
  "comment-project",
  "save-project",
  "submit-project",
]);
async function session(role, device, policy = {}) {
  const actor =
    manifest.actorsByDevice?.[device.name]?.[role] || manifest.actors[role];
  assert.ok(actor || role === "anonymous", `Missing manifest role ${role}`);
  const context = await browser.newContext({
    viewport: device.viewport,
    hasTouch: device.hasTouch,
    isMobile: device.isMobile,
    serviceWorkers: "block",
  });
  const state = { posts: [], responses: [], lastCommit: null, policy };
  await context.route("**/*", async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    if (["data:", "blob:"].includes(url.protocol)) return route.continue();
    if (url.origin !== origin) {
      report.expectedExternalBlocks.push({
        role,
        device: device.name,
        kind: policy.external ? "intentional-link" : "unexpected",
        protocol: url.protocol,
      });
      return route.abort("blockedbyclient");
    }
    const method = request.method();
    if (!["GET", "HEAD"].includes(method)) {
      let body;
      try {
        body = JSON.parse(request.postData() || "{}");
      } catch {}
      const action = body?.action,
        data = body?.data;
      const engagement = ["upvote-project", "comment-project"].includes(action);
      const allowed =
        mutations &&
        policy.write &&
        method === "POST" &&
        url.pathname === "/api/portal" &&
        postActions.has(action) &&
        (engagement
          ? role === "member" &&
            data?.projectId ===
              (
                manifest.mutationProjects?.[device.name] ||
                manifest.mutationProject ||
                manifest.project
              ).id
          : role === "leader" &&
            data?.project &&
            Number.isInteger(data?.revision));
      if (!allowed) {
        report.deniedRequests.push({
          role,
          device: device.name,
          method,
          action: action || "unknown",
        });
        return route.abort("blockedbyclient");
      }
      state.posts.push({ action, data }); // Memory only; never serialize drafts/media.
      report.requests.push({ role, device: device.name, action });
      if (action === "submit-project") state.lastCommit = body;
      if (policy.voteReject && action === "upvote-project") {
        await policy.voteReject;
        return route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            code: "SYNTHETIC_QA_REJECTION",
            message: "Synthetic vote failure for rollback check.",
          }),
        });
      }
    }
    return route.continue({
      headers: {
        ...request.headers(),
        ...(actor
          ? {
              "oai-authenticated-user-id": actor.id,
              "oai-authenticated-user-email": actor.email,
              "oai-authenticated-user-full-name":
                actor.name || "Synthetic QA actor",
            }
          : {}),
      },
    });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  page.on("pageerror", (e) =>
    report.pageErrors.push({ role, device: device.name, error: e.message }),
  );
  page.on("response", (r) => {
    if (r.request().method() === "POST")
      state.responses.push({ status: r.status() });
  });
  return { context, page, state, role, device };
}
async function visit(s, path) {
  await s.page.goto(origin + path, { waitUntil: "networkidle" });
  await s.page.evaluate(() => document.fonts.ready);
}
async function tabTo(page, locator) {
  for (let i = 0; i < 150; i++) {
    if (await locator.evaluate((el) => document.activeElement === el)) {
      assert.ok(
        await locator.evaluate((el) => {
          const s = getComputedStyle(el);
          return (
            s.outlineStyle !== "none" ||
            s.boxShadow !== "none" ||
            getComputedStyle(el.parentElement).outlineStyle !== "none"
          );
        }),
        "Keyboard focus needs a visible outline or shadow",
      );
      return;
    }
    await page.keyboard.press("Tab");
  }
  throw new Error("Control was not reached by Tab traversal");
}
async function activate(s, locator, key = "Enter") {
  const pointerTarget =
    (await locator.getAttribute("type")) === "radio"
      ? locator.locator("..")
      : locator;
  if (s.device.mode === "touch") await pointerTarget.tap();
  else if (s.device.mode === "keyboard") {
    await tabTo(s.page, locator);
    await s.page.keyboard.press(key);
  } else await pointerTarget.click();
}
async function writeValue(s, locator, value) {
  if (s.device.mode === "keyboard") {
    await tabTo(s.page, locator);
    await s.page.keyboard.press("ControlOrMeta+A");
    await s.page.keyboard.press("Backspace");
    if (value) await s.page.keyboard.type(value);
  } else {
    const pointerTarget =
      (await locator.getAttribute("type")) === "radio"
        ? locator.locator("..")
        : locator;
    if (s.device.mode === "touch") await pointerTarget.tap();
    await locator.fill(value);
  }
}
async function bounds(s) {
  assert.equal(
    await s.page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
    "No horizontal overflow",
  );
}
async function snapshot(s, label) {
  await bounds(s);
  const path = join(output, `${label}-${s.role}-${s.device.name}.png`);
  await s.page.screenshot({ path, fullPage: true, animations: "disabled" });
  report.screenshots.push({
    label,
    role: s.role,
    device: s.device.name,
    path,
    inspected: false,
    cleanFixture: true,
  });
  const controls = await s.page
    .locator(".projects-v6, .dashboard-v6")
    .locator("a,button,input,textarea,select,summary")
    .evaluateAll((elements) =>
      elements.map((el) => ({
        tag: el.tagName,
        type: el.getAttribute("type"),
        name: el.getAttribute("name"),
        label:
          el.getAttribute("aria-label") ||
          (el.labels?.[0]?.textContent || el.textContent || "")
            .trim()
            .replace(/\s+/g, " ")
            .slice(0, 180),
        disabled: !!el.disabled,
        visible: !!el.getClientRects().length,
      })),
    );
  report.inventory.push({
    role: s.role,
    device: s.device.name,
    route: new URL(s.page.url()).pathname,
    controls,
  });
  save();
}
async function read(s, route) {
  return s.page.evaluate(async (view) => {
    const r = await fetch("/api/portal?view=" + encodeURIComponent(view), {
      cache: "no-store",
    });
    return { status: r.status, body: await r.json() };
  }, route);
}
async function post(s, body) {
  return s.page.evaluate(async (payload) => {
    const r = await fetch("/api/portal", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    return { status: r.status, body: await r.json() };
  }, body);
}
function privateAbsent(value) {
  const forbidden = new Set([
    "draft",
    "feedback",
    "privateVenue",
    "credits",
    "inventory",
    "apiKey",
    "openaiEvidence",
    "cerebrasEvidence",
    "evaluationReport",
  ]);
  function walk(v) {
    if (!v || typeof v !== "object") return;
    for (const [key, child] of Object.entries(v)) {
      assert.ok(!forbidden.has(key), `Private public-projection key: ${key}`);
      walk(child);
    }
  }
  walk(value);
}
async function next(s) {
  await activate(s, s.page.getByRole("button", { name: /^Next/ }));
  assert.equal(
    await s.page.locator("dialog[open]").count(),
    0,
    "Next never opens a mutation confirmation",
  );
}
async function openEditor(s) {
  await visit(s, "/dashboard#project");
  await activate(s, s.page.getByRole("tab", { name: "Project", exact: true }));
  const update = s.page.getByRole("button", {
    name: "Update project",
    exact: true,
  });
  if (await update.count()) await activate(s, update);
  return (await s.page.locator(".submission-v6").count()) > 0;
}
async function stage3(s) {
  await next(s);
  await next(s);
  await s.page
    .locator('.submission-stage[data-step="3"]:not([hidden])')
    .waitFor();
}
function originalFile(url, name) {
  const [header, data] = url.split(",");
  assert.match(header, /^data:image\/(png|jpeg);base64$/);
  return {
    name,
    mimeType: header.includes("png") ? "image/png" : "image/jpeg",
    buffer: Buffer.from(data, "base64"),
  };
}
async function responseAction(s, action, operation, confirm = true) {
  const waiting = s.page.waitForResponse(
    (r) =>
      r.request().method() === "POST" &&
      JSON.parse(r.request().postData() || "{}").action === action,
  );
  await operation();
  if (confirm) {
    const dialog = s.page.locator("dialog[open]");
    await dialog.waitFor();
    await activate(s, dialog.getByRole("button").last());
  }
  const response = await waiting;
  await response.finished();
  await s.page.waitForFunction(
    () => !document.querySelector('[aria-busy="true"]'),
  );
  return response;
}

let initialScoreStage;
try {
  // Capture the exact reset fixture in every role/device before any write or edit.
  for (const device of devices)
    for (const role of [
      "anonymous",
      "viewer",
      "member",
      "leader",
      "nonleader",
      "attempt3",
    ]) {
      if (role !== "anonymous" && !manifest.actors[role]) {
        record(
          "route-role",
          "unavailable",
          `Manifest lacks ${role}`,
          device.name,
        );
        continue;
      }
      const s = await session(role, device);
      try {
        await check("route-role", device.name + ":" + role, async () => {
          await visit(s, "/projects");
          await s.page.locator(".public-project-list").waitFor();
          await snapshot(s, "projects");
          await visit(s, "/projects/" + manifest.project.slug);
          await s.page.locator(".public-project-detail").waitFor();
          await snapshot(s, "detail");
          if (["viewer", "anonymous"].includes(role)) {
            const publicData = await read(
              s,
              "/projects/" + manifest.project.slug,
            );
            privateAbsent(publicData.body);
            if (role === "anonymous")
              initialScoreStage = publicData.body.scoreStage;
            record(
              "public-privacy",
              "passed",
              "No private projection keys",
              device.name + ":" + role,
            );
          }
          if (role === "viewer") {
            assert.equal(
              await s.page
                .locator(
                  "button.upvote-button:not([disabled]), .project-comment-composer",
                )
                .count(),
              0,
            );
            record(
              "viewer-disabled",
              "passed",
              "No enabled engagement controls",
              device.name,
            );
          }
          if (["leader", "nonleader", "attempt3"].includes(role)) {
            await openEditor(s);
            await snapshot(s, "project-editor-state");
            if (role === "leader") {
              await s.page.locator(".submission-v6").waitFor();
              assert.equal(
                await s.page.locator(".submission-stage:not([hidden])").count(),
                1,
              );
              await next(s);
              await snapshot(s, "wizard-2");
              await next(s);
              await snapshot(s, "wizard-3");
            } else {
              assert.equal(
                await s.page
                  .locator(".dashboard-v6 button:enabled")
                  .filter({ hasText: /Next|Save draft|Submit|Update project/ })
                  .count(),
                0,
              );
              assert.equal(
                await s.page
                  .locator(
                    ".project-editor input:enabled, .project-editor textarea:enabled",
                  )
                  .count(),
                0,
              );
              record(
                role === "nonleader"
                  ? "nonleader-disabled"
                  : "attempt3-disabled",
                "passed",
                "Editor disabled and no mutation actions",
                device.name,
              );
            }
          }
          if (["leader", "nonleader", "attempt3"].includes(role)) {
            await check(
              "history-dialog",
              device.name + ":" + role,
              async () => {
                if (await s.page.locator(".submission-v6").count()) {
                  while (
                    await s.page
                      .getByRole("button", {
                        name: "Previous submission step",
                        exact: true,
                      })
                      .count()
                  )
                    await activate(
                      s,
                      s.page.getByRole("button", {
                        name: "Previous submission step",
                        exact: true,
                      }),
                    );
                  await activate(
                    s,
                    s.page.locator(
                      '.submission-back[aria-label="Back to your project"], .submission-back[aria-label="Back to Team"]',
                    ),
                  );
                }
                const opener = s.page
                  .getByRole("button", {
                    name: /Versions [0-3]\/3|View committed history/,
                  })
                  .first();
                assert.ok(
                  await opener.count(),
                  "History opener is available to authorized team",
                );
                await activate(s, opener);
                const dialog = s.page.getByRole("dialog", {
                  name: "Committed history",
                  exact: true,
                });
                await dialog.locator(".history-version").first().waitFor();
                assert.ok(
                  (await dialog.locator(".history-version").count()) <= 3,
                );
                await activate(
                  s,
                  dialog.getByRole("button", { name: "Close", exact: true }),
                );
                await dialog.waitFor({ state: "hidden" });
                assert.equal(
                  await opener.evaluate((el) => document.activeElement === el),
                  true,
                  "History Close restores focus",
                );
                await activate(s, opener);
                await dialog.waitFor();
                await s.page.keyboard.press("Escape");
                await dialog.waitFor({ state: "hidden" });
                assert.equal(
                  await opener.evaluate((el) => document.activeElement === el),
                  true,
                  "History Escape restores focus",
                );
                return "Authorized immutable history has at most 3 versions; Close and Escape work";
              },
            );
          }
          record(
            "clean-reference",
            "passed",
            "Clean fixture screenshots before mutations",
            device.name + ":" + role,
          );
          return "List/detail plus applicable submission role";
        });
      } finally {
        await s.context.close();
      }
    }
  for (const device of devices) {
    if (!manifest.actors.member) break;
    const s = await session("member", device, { external: true });
    try {
      await visit(s, "/projects");
      await check("search", device.name, async () => {
        const search = s.page.getByRole("searchbox", {
          name: "Search projects",
        });
        await writeValue(
          s,
          search,
          "qa-no-project-" + manifest.source.slice(0, 8),
        );
        await s.page.waitForResponse(
          (r) =>
            r.url().includes("q=qa-no-project-") &&
            r.request().method() === "GET",
        );
        assert.equal(await s.page.locator(".project-list > li").count(), 0);
        await writeValue(
          s,
          search,
          manifest.project.search || manifest.project.name,
        );
        await s.page.waitForResponse(
          (r) =>
            new URL(r.url()).searchParams.get("q") ===
            (manifest.project.search || manifest.project.name),
        );
        await s.page
          .locator(
            `.project-row-link[href="/projects/${manifest.project.slug}"]`,
          )
          .waitFor();
        await writeValue(s, search, "");
        await s.page.locator(".project-row-link").first().waitFor();
        return "No-result, matching query and cleared query";
      });
      await check("pagination", device.name, async () => {
        await visit(s, "/projects");
        assert.equal(
          await s.page
            .getByRole("button", { name: "Previous page" })
            .isDisabled(),
          true,
        );
        const nextPage = s.page.getByRole("button", { name: "Next page" });
        if (await nextPage.isDisabled()) {
          record(
            "pagination",
            "unavailable",
            "Fixture has no second page",
            device.name,
          );
          return "Disabled Next verified; positive paging unavailable";
        }
        await activate(s, nextPage);
        await s.page.getByText("Page 2", { exact: true }).waitFor();
        await activate(
          s,
          s.page.getByRole("button", { name: "Previous page" }),
        );
        await s.page.getByText("Page 1", { exact: true }).waitFor();
        return "Next/Previous mouse, touch or Enter";
      });
      await check("detail-back", device.name, async () => {
        await activate(s, s.page.locator(".project-row-link").first());
        await s.page.locator(".public-project-detail").waitFor();
        await activate(s, s.page.locator(".project-comments-button"));
        assert.equal(new URL(s.page.url()).hash, "#comments");
        await activate(
          s,
          s.page.getByRole("link", { name: "Back to Projects", exact: true }),
        );
        await s.page.locator(".public-project-list").waitFor();
        return "Row → detail → comments → back";
      });
      await check("external-links", device.name, async () => {
        await visit(s, "/projects/" + manifest.project.slug);
        const publicProject = (
          await read(s, "/projects/" + manifest.project.slug)
        ).body.items[0];
        if (!publicProject.demo)
          record(
            "external-links",
            "unavailable",
            "Optional deployment link is blank in this fixture; GitHub remains tested",
            device.name,
          );
        const links = s.page.locator(
          '.public-project-detail a[target="_blank"]',
        );
        assert.ok(await links.count(), "Fixture must have GitHub link");
        for (const link of await links.all()) {
          const url = new URL(await link.getAttribute("href"));
          assert.equal(url.protocol, "https:");
          const popup = s.page.waitForEvent("popup");
          await activate(s, link);
          const child = await popup;
          await child.close();
        }
        return `${await links.count()} HTTPS links activated and blocked before network`;
      });
      if (device.mode === "keyboard")
        record(
          "keyboard-focus",
          "passed",
          "Tab/Enter used for Projects interactive navigation; wizard Space checked below",
          device.name,
        );
    } finally {
      await s.context.close();
    }
  }
  for (const device of devices) {
    if (!manifest.actors.leader) break;
    const s = await session("leader", device);
    try {
      await openEditor(s);
      await check("wizard-exit", device.name, async () => {
        await activate(
          s,
          s.page.locator(
            '.submission-back[aria-label="Back to your project"], .submission-back[aria-label="Back to Team"]',
          ),
        );
        await s.page.locator(".dashboard-v6").waitFor();
        assert.equal(
          await s.page
            .getByRole("tab", { name: "Project", exact: true })
            .getAttribute("aria-selected"),
          "true",
        );
        assert.equal(s.state.posts.length, 0);
        await openEditor(s);
        return "Back exits editor to Project without saving";
      });
      await check("wizard-fields", device.name, async () => {
        for (const field of ["projectName", "problemSolution", "description"]) {
          const input = s.page.locator(`[name="${field}"]`),
            original = await input.inputValue();
          await writeValue(s, input, "");
          await next(s);
          assert.equal(
            await s.page
              .locator('.submission-stage[data-step="1"]')
              .isVisible(),
            true,
          );
          await s.page
            .getByRole("alert")
            .filter({ hasText: "Add a project name" })
            .waitFor();
          await writeValue(s, input, original);
        }
        await next(s);
        const github = s.page.locator('[name="github"]'),
          original = await github.inputValue();
        await writeValue(s, github, "https://example.test/repo");
        await next(s);
        assert.equal(
          await s.page.locator('.submission-stage[data-step="2"]').isVisible(),
          true,
        );
        await writeValue(s, github, original);
        await writeValue(s, s.page.locator('[name="demo"]'), "");
        await next(s);
        assert.equal(
          await s.page.locator('.submission-stage[data-step="3"]').isVisible(),
          true,
        );
        return "Essentials/GitHub block Next; blank deployment allowed";
      });
      await check("wizard-state", device.name, async () => {
        await openEditor(s);
        await next(s);
        const expected = [
          "OpenAI API",
          "Codex",
          "ChatGPT Sites",
          "Parallel Agents",
          "Parallel worktrees",
          "ChatGPT",
        ];
        const options = s.page.locator(
          ".submission-ecosystem-options input[type=checkbox]",
        );
        assert.equal(await options.count(), 6);
        for (const label of expected) {
          const control = s.page.getByRole("checkbox", {
            name: label,
            exact: true,
          });
          const previous = await control.isChecked();
          await activate(s, control, "Space");
          assert.equal(await control.isChecked(), !previous);
        }
        await activate(
          s,
          s.page.getByRole("radio", { name: "Yes", exact: true }),
          "Space",
        );
        await activate(
          s,
          s.page.getByRole("radio", { name: "No", exact: true }),
          "Space",
        );
        assert.equal(
          await s.page
            .getByRole("radio", { name: "Yes", exact: true })
            .isChecked(),
          false,
        );
        await activate(
          s,
          s.page.getByRole("button", { name: "Previous submission step" }),
        );
        await next(s);
        assert.equal(
          await s.page
            .getByRole("radio", { name: "No", exact: true })
            .isChecked(),
          true,
        );
        if (device.mode === "keyboard")
          record(
            "keyboard-focus",
            "passed",
            "Actual Tab and Space toggle native checkbox/radio controls",
            device.name,
          );
        return "Exact optional options, separate mutually exclusive Cerebras, state retained";
      });
      await check("upload-mime-size", device.name, async () => {
        await stage3FromCurrent(s);
        const upload = s.page.getByLabel("Upload logo", { exact: true });
        await upload.setInputFiles({
          name: "bad.txt",
          mimeType: "text/plain",
          buffer: Buffer.from("Synthetic invalid MIME"),
        });
        await s.page
          .getByRole("alert")
          .filter({ hasText: "Use a PNG or JPEG" })
          .waitFor();
        await upload.setInputFiles({
          name: "oversize.png",
          mimeType: "image/png",
          buffer: Buffer.alloc(131073),
        });
        await s.page.getByRole("alert").filter({ hasText: "128 KB" }).waitFor();
        return "Local MIME and size rejection; no writes";
      });
      await check("upload-valid-remove", device.name, async () => {
        const image = s.page.locator("img.upload-preview.logo"),
          original = await image.getAttribute("src");
        await activate(
          s,
          s.page.getByRole("button", { name: "Remove logo image" }),
        );
        assert.equal(await image.count(), 0);
        await s.page
          .getByLabel("Upload logo", { exact: true })
          .setInputFiles(originalFile(original, "existing-synthetic-logo.png"));
        await image.waitFor();
        const banner = s.page.locator("img.upload-preview.banner"),
          originalBanner = await banner.getAttribute("src");
        await activate(
          s,
          s.page.getByRole("button", { name: "Remove banner image" }),
        );
        assert.equal(await banner.count(), 0);
        await s.page
          .getByLabel("Upload banner", { exact: true })
          .setInputFiles(
            originalFile(originalBanner, "existing-synthetic-banner.png"),
          );
        await banner.waitFor();
        return "Both fixture images removed and restored from original bytes";
      });
      await check("accuracy-cancel", device.name, async () => {
        const accuracy = s.page.getByRole("checkbox", {
          name: "I confirm this submission is accurate.",
          exact: true,
        });
        if (await accuracy.isChecked()) await activate(s, accuracy, "Space");
        await activate(
          s,
          s.page.getByRole("button", { name: "Submit", exact: true }),
        );
        assert.equal(await s.page.locator("dialog[open]").count(), 0);
        await activate(s, accuracy, "Space");
        await activate(
          s,
          s.page.getByRole("button", { name: "Submit", exact: true }),
        );
        const dialog = s.page.locator("dialog[open]");
        await dialog.waitFor();
        await activate(
          s,
          dialog.getByRole("button", { name: "Cancel", exact: true }),
        );
        await dialog.waitFor({ state: "hidden" });
        await activate(
          s,
          s.page.getByRole("button", { name: "Submit", exact: true }),
        );
        await dialog.waitFor();
        await s.page.keyboard.press("Escape");
        await dialog.waitFor({ state: "hidden" });
        assert.equal(s.state.posts.length, 0);
        return "Accuracy, final Cancel and Escape produce zero POSTs";
      });
    } finally {
      await s.context.close();
    }
  }
  if (!mutations)
    for (const id of [
      "vote-pending-rollback",
      "vote-positive-unique",
      "comment-empty-error",
      "comment-valid-escaped",
      "upload-ratio",
      "draft-immutable",
      "commit-max3",
      "commit-idempotent",
    ])
      record(
        id,
        "blocked",
        "Requires root-confirmed reset manifest, --mutations and matching V6_RESET_TOKEN",
      );
  else await mutationChecks();
  const finalPublic = await session("anonymous", devices[0]);
  try {
    await visit(finalPublic, "/projects");
    const publicData = await read(finalPublic, "/projects");
    privateAbsent(publicData.body);
    assert.equal(
      publicData.body.scoreStage,
      initialScoreStage,
      "QA must not activate score disclosure",
    );
    record(
      "public-privacy",
      "passed",
      "Final anonymous projection still private and score disclosure stage unchanged",
      "final",
    );
  } finally {
    await finalPublic.context.close();
  }
  assert.equal(workerHash(), manifest.worker, "Artifact unchanged during QA");
} catch (e) {
  report.failure = String(e.stack || e);
  process.exitCode = 1;
} finally {
  await browser.close();
  report.browserClosed = true;
  for (const entry of matrix)
    if (entry.status === "pending") entry.status = "unavailable";
  report.summary = Object.fromEntries(
    ["passed", "partial", "failed", "blocked", "unavailable"].map((s) => [
      s,
      matrix.filter((c) => c.status === s).length,
    ]),
  );
  if (
    matrix.some((c) => c.status === "failed") ||
    report.pageErrors.length ||
    report.deniedRequests.length ||
    report.expectedExternalBlocks.some((b) => b.kind === "unexpected")
  )
    process.exitCode = 1;
  save();
}
console.log(
  JSON.stringify(
    {
      output,
      summary: report.summary,
      screenshots: report.screenshots.length,
      failure: report.failure || null,
    },
    null,
    2,
  ),
);

async function stage3FromCurrent(s) {
  if (await s.page.locator('.submission-stage[data-step="1"]').isVisible())
    await next(s);
  if (await s.page.locator('.submission-stage[data-step="2"]').isVisible())
    await next(s);
  await s.page
    .locator('.submission-stage[data-step="3"]:not([hidden])')
    .waitFor();
}
async function mutationChecks() {
  const device = devices[0];
  const target =
    manifest.mutationProjects?.[device.name] ||
    manifest.mutationProject ||
    manifest.project;
  let release;
  const rejection = new Promise((r) => {
    release = r;
  });
  const vote = await session("member", device, {
    write: true,
    voteReject: rejection,
  });
  try {
    await visit(vote, "/projects/" + target.slug);
    await check("vote-pending-rollback", device.name, async () => {
      const control = vote.page.locator("button.upvote-button");
      assert.equal(
        await control.isEnabled(),
        true,
        "Member target must initially be unvoted",
      );
      const before = await control.locator("span").innerText();
      await activate(vote, control);
      await activate(
        vote,
        vote.page.locator("dialog[open]").getByRole("button").last(),
      );
      await vote.page
        .locator('button.upvote-button[aria-busy="true"]')
        .waitFor();
      assert.equal(await control.isDisabled(), true);
      await vote.page.keyboard.press("Enter");
      assert.equal(vote.state.posts.length, 1);
      release();
      await vote.page
        .getByRole("alert")
        .filter({ hasText: "Synthetic vote failure" })
        .waitFor();
      assert.equal(await control.locator("span").innerText(), before);
      assert.equal(await control.isEnabled(), true);
      return "Exactly one held request; HTTP503 rollback restores count and retry";
    });
    release();
  } finally {
    release();
    await vote.context.close();
  }
  const member = await session("member", device, { write: true });
  try {
    await visit(member, "/projects/" + target.slug);
    await check("vote-positive-unique", device.name, async () => {
      const before = (await read(member, "/projects/" + target.slug)).body
        .items[0];
      const response = await responseAction(member, "upvote-project", () =>
        activate(member, member.page.locator("button.upvote-button")),
      );
      assert.equal(response.status(), 200);
      await member.page
        .locator('button.upvote-button[aria-pressed="true"]')
        .waitFor();
      assert.equal(
        await member.page.locator("button.upvote-button").isDisabled(),
        true,
      );
      const duplicate = await post(member, {
        action: "upvote-project",
        data: { projectId: target.id },
      });
      assert.equal(duplicate.status, 200);
      const after = (await read(member, "/projects/" + target.slug)).body
        .items[0];
      assert.equal(after.upvotes, before.upvotes + 1);
      return "One durable vote despite duplicate API request";
    });
    await check("comment-empty-error", device.name, async () => {
      const send = member.page.getByRole("button", {
          name: "Post comment",
          exact: true,
        }),
        field = member.page.getByRole("textbox", { name: "Public comment" });
      await field.fill("");
      assert.equal(await send.isDisabled(), true);
      await field.fill("too short");
      const r = await responseAction(member, "comment-project", () =>
        activate(member, send),
      );
      assert.equal(r.status(), 422);
      await member.page
        .locator(".project-comment-composer [role=alert]")
        .waitFor();
      return "Empty disabled; server rejects below30 characters and preserves input";
    });
    await check("comment-valid-escaped", device.name, async () => {
      const comment = `  Synthetic control QA ${manifest.source.slice(0, 8)} <img src=x onerror=alert(1)> safe literal text.  `;
      const before = (await read(member, "/projects/" + target.slug)).body
        .comments.length;
      await member.page
        .getByRole("textbox", { name: "Public comment" })
        .fill(comment);
      const r = await responseAction(member, "comment-project", () =>
        activate(
          member,
          member.page.getByRole("button", {
            name: "Post comment",
            exact: true,
          }),
        ),
      );
      assert.equal(r.status(), 200);
      await member.page.getByText(comment.trim(), { exact: true }).waitFor();
      assert.equal(
        await member.page
          .locator(
            ".public-comment-content img, .public-comment-content script",
          )
          .count(),
        0,
      );
      const after = await read(member, "/projects/" + target.slug);
      assert.equal(after.body.comments.length, before + 1);
      assert.equal(after.body.comments.at(-1).body, comment.trim());
      privateAbsent(after.body);
      return "One trimmed literal comment; executable markup absent from DOM";
    });
  } finally {
    await member.context.close();
  }
  const leader = await session("leader", device, { write: true });
  try {
    await openEditor(leader);
    const initial = await read(leader, "/submission"),
      history = await read(leader, "/project-history");
    assert.equal(initial.status, 200);
    assert.ok(initial.body.submissionAccess.canCommit);
    assert.ok(
      initial.body.project.draft.logo && initial.body.project.draft.banner,
    );
    const beforeAttempts = initial.body.submissionAccess.attemptsUsed;
    assert.ok(
      Number.isInteger(beforeAttempts) &&
        beforeAttempts >= 0 &&
        beforeAttempts < 3,
    );
    const originalHashes = new Map(
      history.body.items.map((v) => [v.id, hash(JSON.stringify(v.payload))]),
    );
    await stage3(leader);
    const logo = await leader.page
        .locator("img.upload-preview.logo")
        .getAttribute("src"),
      banner = await leader.page
        .locator("img.upload-preview.banner")
        .getAttribute("src");
    await check("upload-ratio", device.name, async () => {
      for (const [slot, wrong, correct] of [
        ["logo", banner, logo],
        ["banner", logo, banner],
      ]) {
        await leader.page
          .getByLabel("Upload " + slot, { exact: true })
          .setInputFiles(originalFile(wrong, "wrong-ratio.png"));
        const r = await responseAction(leader, "save-project", () =>
          activate(
            leader,
            leader.page.getByRole("button", {
              name: "Save draft",
              exact: true,
            }),
          ),
        );
        assert.equal(r.status(), 422);
        await leader.page
          .getByRole("alert")
          .filter({ hasText: slot === "logo" ? /square/ : /16:9/ })
          .waitFor();
        await leader.page
          .getByLabel("Upload " + slot, { exact: true })
          .setInputFiles(originalFile(correct, "correct-ratio.png"));
      }
      return "Both wrong aspect ratios server-rejected without saved revision";
    });
    await check("draft-immutable", device.name, async () => {
      const r = await responseAction(leader, "save-project", () =>
        activate(
          leader,
          leader.page.getByRole("button", { name: "Save draft", exact: true }),
        ),
      );
      assert.equal(r.status(), 200);
      const current = await read(leader, "/submission");
      assert.equal(current.body.submissionAccess.attemptsUsed, beforeAttempts);
      assert.equal(
        current.body.project.revision,
        initial.body.project.revision + 1,
      );
      const latest = await read(leader, "/project-history");
      for (const v of latest.body.items)
        assert.equal(hash(JSON.stringify(v.payload)), originalHashes.get(v.id));
      return "Revision increased once, attempts unchanged, committed payloads unchanged";
    });
    let lastBody;
    await check("commit-max3", device.name, async () => {
      for (let attempt = beforeAttempts + 1; attempt <= 3; attempt++) {
        await openEditor(leader);
        await leader.page
          .locator('[name="projectName"]')
          .fill(`Synthetic control QA version ${attempt}`);
        await stage3(leader);
        const accuracy = leader.page.getByRole("checkbox", {
          name: "I confirm this submission is accurate.",
          exact: true,
        });
        if (!(await accuracy.isChecked())) await accuracy.check();
        await activate(
          leader,
          leader.page.getByRole("button", { name: "Submit", exact: true }),
        );
        const dialog = leader.page.locator("dialog[open]");
        await dialog.waitFor();
        const r = await responseAction(
          leader,
          "submit-project",
          () =>
            activate(
              leader,
              dialog.getByRole("button", {
                name: "Commit submission",
                exact: true,
              }),
            ),
          false,
        );
        assert.equal(r.status(), 200);
        lastBody = leader.state.lastCommit;
        const current = await read(leader, "/submission");
        assert.equal(current.body.submissionAccess.attemptsUsed, attempt);
        const versions = await read(leader, "/project-history");
        for (const v of versions.body.items)
          if (originalHashes.has(v.id))
            assert.equal(
              hash(JSON.stringify(v.payload)),
              originalHashes.get(v.id),
            );
      }
      await openEditor(leader);
      assert.equal(
        await leader.page
          .locator(".submission-v6 button")
          .filter({ hasText: /Next|Save draft|Submit|Update project/ })
          .count(),
        0,
      );
      const locked = await read(leader, "/submission");
      assert.equal(locked.body.submissionAccess.attemptsUsed, 3);
      assert.equal(locked.body.submissionAccess.locked, true);
      const changed = {
        ...lastBody.data,
        revision: locked.body.project.revision,
        project: {
          ...lastBody.data.project,
          projectName: "Synthetic prohibited fourth version",
        },
      };
      for (const action of ["save-project", "submit-project"]) {
        const rejected = await post(leader, { action, data: changed });
        assert.ok([403, 409].includes(rejected.status));
      }
      return "Third commit locks UI and server; earlier version payload hashes unchanged";
    });
    await check("commit-idempotent", device.name, async () => {
      assert.ok(lastBody, "Requires successful UI commit");
      const result = await post(leader, lastBody);
      assert.equal(result.status, 200);
      const current = await read(leader, "/submission");
      assert.equal(current.body.submissionAccess.attemptsUsed, 3);
      return "Exact retry returns receipt without fourth attempt";
    });
  } finally {
    await leader.context.close();
  }
}
