// Confirming writes require a freshly reset disposable synthetic D1 and root release.
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
import { resolve, join } from "node:path";
// Each invocation consumes one reset-bound manifest and runs one input mode.
if (!process.argv.includes("--write-ready")) {
  console.log(
    "Prepared only. Requires ADMIN_WRITE_MANIFEST for a fresh disposable local reset.",
  );
  process.exit(0);
}
const manifestPath = process.env.ADMIN_WRITE_MANIFEST;
assert.ok(manifestPath, "Fresh disposable manifest required");
const fresh = JSON.parse(readFileSync(manifestPath, "utf8"));
assert.equal(fresh.disposable, true);
assert.equal(fresh.syntheticOnly, true);
assert.equal(fresh.rootConfirmedReset, true);
assert.match(fresh.resetToken || "", /^[a-f0-9-]{36}$/i);
const origin = fresh.origin,
  local = new URL(origin);
assert.equal(local.hostname, "127.0.0.1");
assert.equal(local.protocol, "http:");
assert.ok(local.port);
assert.equal(local.pathname, "/");
const artifactRoot = resolve(fresh.artifactRoot),
  source = fresh.source,
  workerSha = fresh.worker;
assert.match(source || "", /^[a-f0-9]{40}$/);
assert.match(workerSha || "", /^[a-f0-9]{64}$/);
const inputMode = process.env.ADMIN_WRITE_MODE || "mouse";
assert.ok(["mouse", "keyboard", "touch"].includes(inputMode));
const hash = (p) => createHash("sha256").update(readFileSync(p)).digest("hex"),
  worker = join(artifactRoot, "dist/server/index.js");
assert.equal(hash(worker), workerSha);
assert.equal(
  execFileSync("git", ["-C", artifactRoot, "rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  source,
);
const ownerEmail = readFileSync(
  join(artifactRoot, "lib/identity.ts"),
  "utf8",
).match(/OWNER_EMAIL\s*=\s*"([^"]+)"/)[1];
writeFileSync(`/tmp/ddehack-admin-reset-${fresh.resetToken}`, "consumed\n", {
  flag: "wx",
  mode: 0o600,
});
const stamp = Date.now().toString(36),
  prefix = `v6-audit-${stamp}`,
  output = resolve(
    "evidence/v6-admin-writes",
    `${source.slice(0, 8)}-${stamp}`,
  );
mkdirSync(output, { recursive: true });
const leasePath = `/tmp/ddehack-admin-write-${local.port}.lock`,
  leaseToken = `${source}:${prefix}:${process.pid}`;
// Never steal or delete a pre-existing/uncertain runner lease.
const leaseFd = openSync(leasePath, "wx", 0o600);
writeFileSync(leaseFd, leaseToken);
closeSync(leaseFd);
const report = {
  source,
  workerSha256: workerSha,
  phase: "fresh-exclusive-disposable-synthetic-writes",
  fixtureResetHash: hash(manifestPath),
  inputMode,
  startedAt: new Date().toISOString(),
  checks: [],
  responses: [],
  sessions: [],
  activations: [],
  attempts: [],
  blocked: [],
  pageErrors: [],
  manifest: { before: null, after: null },
  limitations: [
    "Synthetic loopback identities; not hosted sign-in.",
    "Mouse uses click; isMobile+hasTouch uses tap for every pointer activation. Text fill, selectOption and file injection use Playwright input APIs; no native OS picker/keyboard coverage claimed.",
    "Local lease prevents duplicate admin runners; root exclusive release must keep other lanes from writing concurrently.",
    "No production data, external writes, admin grants, voucher reveal, AI activation, or scoring enablement.",
    "Owner policy publication is excluded; Settings windows/switches are preview/draft/cancel only.",
    "Expired15-minute preview timing is not simulated; invalid digest guard is tested separately.",
  ],
};
const { chromium } = await import("playwright-core");
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
let page,
  role = "admin",
  mode = "mouse";
const pendingResponses = [];
function allow(action, data) {
  if (action === "preview-import" || action === "commit-import")
    return (
      data.kind === "roster" &&
      typeof data.csv === "string" &&
      data.csv
        .split(/[\s,;]+/)
        .filter((v) => v.includes("@"))
        .every(
          (v) =>
            v === "bob@portal.test" ||
            (v.startsWith(prefix) && v.endsWith("@portal.test")),
        )
    );
  if (action === "admin-status")
    return (
      data.kind === "person" &&
      data.targetId === "fake_pending" &&
      ["Registered", "Going", "Checked in", "Absent"].includes(data.status)
    );
  if (action === "remove-workspace-member")
    return (
      ["fake_carol", mode === "mouse" ? "fake_ivy" : "fake_frank"].includes(
        data.userId,
      ) && Object.keys(data).every((k) => ["userId", "reason"].includes(k))
    );
  if (action === "review-project")
    return (
      ["judge", "mentor"].includes(role) &&
      data.projectId === "visual_project_alice" &&
      String(data.body).startsWith(
        `[Synthetic control audit] ${prefix}-${mode}-${role}`,
      ) &&
      (role === "mentor"
        ? !Object.hasOwn(data, "rating")
        : Number.isInteger(data.rating) &&
          data.rating >= 1 &&
          data.rating <= 10)
    );
  if (action === "update-credit-instructions")
    return (
      data.typeId === "fake_credit" &&
      typeof data.markdown === "string" &&
      data.markdown.length < 1000
    );
  if (action === "preview-submission-window")
    return (
      role === "owner" &&
      typeof data.open === "string" &&
      typeof data.close === "string"
    );
  return false;
}
async function session(nextRole, nextMode) {
  role = nextRole;
  mode = nextMode;
  const context = await browser.newContext({
    viewport:
      mode === "touch"
        ? { width: 390, height: 844 }
        : { width: 1440, height: 1000 },
    isMobile: mode === "touch",
    hasTouch: mode === "touch",
    reducedMotion: "reduce",
    serviceWorkers: "block",
  });
  const contextRole = role,
    contextMode = mode;
  await context.route("**/*", async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    if (url.origin !== origin) {
      report.blocked.push({
        kind: "external",
        origin: url.origin,
        path: url.pathname,
      });
      return route.abort();
    }
    if (!["GET", "HEAD"].includes(request.method())) {
      let body;
      try {
        body = JSON.parse(request.postData() || "{}");
      } catch {}
      if (
        request.method() !== "POST" ||
        url.pathname !== "/api/portal" ||
        !allow(body?.action, body?.data || {})
      ) {
        report.blocked.push({
          kind: "out-of-scope-write",
          action: body?.action,
          path: url.pathname,
        });
        return route.abort();
      }
      report.attempts.push({
        role: contextRole,
        mode: contextMode,
        action: body.action,
      });
    }
    await route.continue({
      headers: {
        ...request.headers(),
        "oai-authenticated-user-id": `fake_${contextRole}`,
        "oai-authenticated-user-email":
          contextRole === "owner" ? ownerEmail : `${contextRole}@portal.test`,
        "oai-authenticated-user-full-name": `Synthetic ${contextRole}`,
      },
    });
  });
  page = await context.newPage();
  page.setDefaultTimeout(7000);
  page.on("pageerror", (e) =>
    report.pageErrors.push({
      role: contextRole,
      mode: contextMode,
      message: e.message,
    }),
  );
  page.on("response", (response) => {
    if (
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/portal"
    )
      pendingResponses.push(
        (async () => {
          try {
            const b = await response.json(),
              req = JSON.parse(response.request().postData());
            report.responses.push({
              role: contextRole,
              mode: contextMode,
              action: req.action,
              status: response.status(),
              code: b.code,
            });
          } catch {
            report.pageErrors.push({
              role: contextRole,
              mode: contextMode,
              message:
                "Action response unreadable; inspect state before retry.",
            });
          }
        })(),
      );
  });
  const input = await page.evaluate(() => ({
    maxTouchPoints: navigator.maxTouchPoints,
    coarse: matchMedia("(pointer:coarse)").matches,
  }));
  assert.equal(input.maxTouchPoints > 0, mode === "touch");
  report.sessions.push({
    role,
    mode,
    isMobile: mode === "touch",
    hasTouch: mode === "touch",
    ...input,
  });
  return context;
}
async function activate(loc) {
  await loc.scrollIntoViewIfNeeded();
  const name =
    (await loc.getAttribute("aria-label")) ||
    (await loc.innerText().catch(() => ""));
  if (mode === "touch") await loc.tap();
  else if (mode === "keyboard") {
    await loc.focus();
    assert.equal(
      await loc.evaluate((el) => el === document.activeElement),
      true,
    );
    await page.keyboard.press(
      (await loc.getAttribute("type")) === "checkbox" ? "Space" : "Enter",
    );
  } else await loc.click();
  report.activations.push({
    role,
    mode,
    method:
      mode === "touch" ? "tap" : mode === "keyboard" ? "focus+Enter" : "click",
    name: name.trim().slice(0, 130),
    route: new URL(page.url()).pathname,
  });
}
async function load(path) {
  await page.goto(origin + path, { waitUntil: "networkidle" });
}
async function view(path) {
  return page.evaluate(async (p) => {
    const r = await fetch("/api/portal?view=" + encodeURIComponent(p));
    if (!r.ok) throw new Error(`Read ${r.status}`);
    return r.json();
  }, path);
}
async function api(action, data) {
  return page.evaluate(
    async ({ action, data }) => {
      const r = await fetch("/api/portal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, data }),
      });
      return { status: r.status, body: await r.json() };
    },
    { action, data },
  );
}
async function check(name, fn) {
  try {
    const details = await fn();
    report.checks.push({ role, mode, name, passed: true, ...details });
  } catch (e) {
    report.checks.push({ role, mode, name, passed: false, error: e.message });
    throw e;
  }
}
async function confirm({ cancel = false, target } = {}) {
  const dialog = page.locator("dialog.confirmation-dialog[open]");
  await dialog.waitFor();
  if (target) assert.ok((await dialog.innerText()).includes(target));
  if (cancel)
    await activate(dialog.getByRole("button", { name: "Cancel", exact: true }));
  else await activate(dialog.locator("button.button:not(.secondary)"));
  await dialog.waitFor({ state: "hidden" });
}
function manifest(data) {
  return data.items
    .map((t) => ({
      id: t.id,
      locked: t.locked,
      members: t.members.map((m) => m.id).sort(),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}
try {
  // One sequential writer. Mode-specific imports/removals, restored settings,
  // and protected TeamQA membership snapshots prevent fixture collisions.
  for (mode of [inputMode]) {
    const context = await session("admin", mode);
    await load("/admin/teams");
    const before = manifest(await view("/admin/teams"));
    report.manifest.before ||= before;
    const allowedId = mode === "mouse" ? "fake_ivy" : "fake_frank",
      allowedName = mode === "mouse" ? "Ivy" : "Frank";
    assert.ok(
      before.find((t) => t.id === "fake_team5")?.members.includes(allowedId),
      "Independent removable member required",
    );
    assert.ok(
      before.find((t) => t.id === "fake_team3")?.locked,
      "Fresh locked Common Ground required",
    );
    await check("Keyboard skip link reaches main", async () => {
      if (mode !== "keyboard") return { notApplicable: true };
      await load("/admin/participants");
      await page.keyboard.press("Tab");
      const skip = page.getByRole("link", {
        name: "Skip to content",
        exact: true,
      });
      assert.equal(
        await skip.evaluate((el) => el === document.activeElement),
        true,
      );
      await page.keyboard.press("Enter");
      assert.equal(
        await page
          .locator("main")
          .evaluate((el) => el === document.activeElement),
        true,
      );
      return { focus: "main" };
    });
    for (const sourceMode of ["Single email", "Email list", "CSV"])
      await check(`${sourceMode} actual add-only commit`, async () => {
        await load("/admin/participants");
        await activate(
          page.getByRole("button", { name: "Add participants", exact: true }),
        );
        const add = page.locator(".admin-import");
        await activate(
          add.getByRole("button", { name: sourceMode, exact: true }),
        );
        const suffix =
            sourceMode === "Single email"
              ? "single"
              : sourceMode === "Email list"
                ? "list"
                : "csv",
          email = `${prefix}-${mode}-${suffix}@portal.test`;
        if (sourceMode === "Single email")
          await add.getByLabel("Email", { exact: true }).fill(email);
        else if (sourceMode === "Email list")
          await add
            .getByLabel("Email list", { exact: true })
            .fill(`${email};${email};bob@portal.test`);
        else
          await add.locator("input[type=file]").setInputFiles({
            name: "synthetic-add-only.csv",
            mimeType: "text/csv",
            buffer: Buffer.from(`email\n${email}\nbob@portal.test\n`),
          });
        await activate(add.getByRole("button", { name: "Add", exact: true }));
        await confirm({
          target: sourceMode === "Single email" ? email : "1 participant",
        });
        await page.waitForLoadState("networkidle");
        const data = await view("/admin/participants");
        assert.equal(data.items.filter((p) => p.email === email).length, 1);
        assert.equal(
          data.items.filter((p) => p.email === "bob@portal.test").length,
          1,
        );
        return { newSyntheticRows: 1, existingBobRows: 1 };
      });
    await check(
      "Invalid/stale import digest rejected without commit",
      async () => {
        const result = await api("commit-import", {
          kind: "roster",
          csv: `email\n${prefix}-${mode}-stale@portal.test\n`,
          digest: "stale-audit-digest",
        });
        assert.equal(result.status, 409);
        assert.equal(result.body.code, "PREVIEW_REQUIRED");
        return {
          status: result.status,
          code: result.body.code,
          input: "API negative probe; not a pointer interaction",
        };
      },
    );
    for (const status of ["Going", "Checked in", "Absent", "Registered"])
      await check(`Pending synthetic person status ${status}`, async () => {
        await load("/admin/participants");
        if (mode === "touch")
          await activate(
            page.getByRole("button", {
              name: "Participant filters",
              exact: true,
            }),
          );
        const filters = page.locator(".admin-participant-filters");
        await filters.locator("select").nth(0).selectOption("all");
        await filters.locator("select").nth(1).selectOption("all");
        const search =
          mode === "touch"
            ? page.locator(".admin-mobile-tools input[type=search]")
            : filters.locator("input[type=search]");
        await search.fill("pending@portal.test");
        const row = page.locator(".participants-table tbody tr");
        assert.equal(await row.count(), 1);
        const menu = row.locator(".admin-status-menu");
        await activate(menu.locator("summary"));
        await menu.locator("select[name=status]").selectOption(status);
        const responsePromise = page.waitForResponse(
          (r) =>
            r.request().method() === "POST" && r.url().endsWith("/api/portal"),
        );
        await activate(
          menu.getByRole("button", {
            name: "Review status change",
            exact: true,
          }),
        );
        await confirm();
        const response = await responsePromise;
        assert.ok(response.ok(), `Status response ${response.status()}`);
        const person = (await view("/admin/participants")).items.find(
          (p) => p.id === "fake_pending",
        );
        assert.equal(person.status, status);
        return { status: response.status(), personStatus: person.status };
      });
    await check("Synthetic credit Markdown save and restore", async () => {
      await load("/admin/settings");
      let form = page.locator(".admin-settings-credits");
      await form.locator("select").selectOption("fake_credit");
      const original = await form.locator("textarea").inputValue();
      for (const markdown of [
        `[Synthetic control audit] ${prefix}-${mode} instructions.`,
        original,
      ]) {
        form = page.locator(".admin-settings-credits");
        await form.locator("textarea").fill(markdown);
        const responsePromise = page.waitForResponse(
          (r) =>
            r.request().method() === "POST" && r.url().endsWith("/api/portal"),
        );
        await activate(form.getByRole("button", { name: "Save", exact: true }));
        await confirm();
        const response = await responsePromise;
        assert.ok(response.ok(), `Credit response ${response.status()}`);
        await page.waitForLoadState("networkidle");
        await load("/admin/settings");
        assert.equal(
          await page.locator(".admin-settings-credits textarea").inputValue(),
          markdown,
        );
      }
      return { provider: "fake_credit", restored: true };
    });
    await check("Locked membership Cancel then server guard", async () => {
      await load("/admin/teams");
      const button = page.getByRole("button", {
        name: /^Remove Carol from Common Ground$/,
      });
      await activate(button);
      await confirm({ cancel: true, target: "Carol" });
      assert.ok(
        manifest(await view("/admin/teams"))
          .find((t) => t.id === "fake_team3")
          .members.includes("fake_carol"),
      );
      const responsePromise = page.waitForResponse(
        (r) =>
          r.request().method() === "POST" && r.url().endsWith("/api/portal"),
      );
      await activate(button);
      await confirm({ target: "Carol" });
      const response = await responsePromise;
      const body = await response.json();
      assert.equal(response.status(), 409);
      assert.equal(body.code, "TEAM_LOCKED");
      assert.ok(
        manifest(await view("/admin/teams"))
          .find((t) => t.id === "fake_team3")
          .members.includes("fake_carol"),
      );
      return { status: response.status(), code: body.code };
    });
    await check(
      "Unlocked named synthetic member removed successfully",
      async () => {
        await load("/admin/teams");
        const team = page
          .locator(".admin-team-list > li")
          .filter({ hasText: "The Fifth Element" })
          .first();
        const disclosure = team.locator(".admin-team-disclosure");
        if (!(await disclosure.evaluate((e) => e.open)))
          await activate(disclosure.locator("summary").first());
        const button = page.getByRole("button", {
          name: `Remove ${allowedName} from The Fifth Element`,
          exact: true,
        });
        await activate(button);
        await confirm({ cancel: true, target: allowedName });
        assert.ok(
          manifest(await view("/admin/teams"))
            .find((t) => t.id === "fake_team5")
            .members.includes(allowedId),
        );
        const responsePromise = page.waitForResponse(
          (r) =>
            r.request().method() === "POST" && r.url().endsWith("/api/portal"),
        );
        await activate(button);
        await confirm({ target: allowedName });
        const response = await responsePromise;
        assert.ok(response.ok(), `Remove response ${response.status()}`);
        assert.ok(
          !manifest(await view("/admin/teams"))
            .find((t) => t.id === "fake_team5")
            .members.includes(allowedId),
        );
        return { status: response.status(), target: allowedId };
      },
    );
    report.manifest.after = manifest(await view("/admin/teams"));
    assert.deepEqual(
      report.manifest.after.filter((t) => t.id.startsWith("fake_teamqa_")),
      report.manifest.before.filter((t) => t.id.startsWith("fake_teamqa_")),
      "TeamQA fixtures must be unchanged",
    );
    await context.close();
    const ownerContext = await session("owner", mode);
    await check(
      "Owner Settings invalid dates, preview and switch draft Cancel",
      async () => {
        await load("/admin/settings");
        const state = (data) => ({
          policyVersion: data.policyVersion,
          open: data.policy?.submissionOpen,
          close: data.policy?.submissionClose,
          engagement: data.engagement,
        });
        const before = state(await view("/admin/settings"));
        const window = page.locator(".admin-window"),
          open = window.getByLabel("Opens (IST)"),
          close = window.getByLabel("Closes (IST)"),
          publish = window.getByRole("button", {
            name: "Publish",
            exact: true,
          });
        const original = await open.inputValue();
        await open.fill(await close.inputValue());
        assert.ok(await publish.isDisabled());
        await open.fill(original);
        await activate(publish);
        await page.waitForLoadState("networkidle");
        if (!(await page.locator("dialog.confirmation-dialog[open]").count()))
          await activate(publish);
        await confirm({ cancel: true });
        const engagement = page.locator(".admin-settings-engagement"),
          toggle = engagement.locator("input[type=checkbox]").first();
        const initial = await toggle.isChecked();
        await activate(toggle);
        assert.equal(await toggle.isChecked(), !initial);
        await activate(
          engagement.getByRole("button", { name: "Save", exact: true }),
        );
        await confirm({ cancel: true });
        assert.deepEqual(
          state(await view("/admin/settings")),
          before,
          "Cancel must preserve policy and engagement",
        );
        return { policyUnchanged: true };
      },
    );
    await ownerContext.close();
    for (const reviewer of ["judge", "mentor"]) {
      const reviewContext = await session(reviewer, mode);
      await check("Synthetic private review actual save", async () => {
        await load("/review/synthetic-alice");
        const form = page.locator(".admin-review-score");
        if (reviewer === "judge")
          await activate(
            form.locator('input[type=radio][name=rating][value="7"]'),
          );
        else assert.equal(await form.locator("input[name=rating]").count(), 0);
        const marker = `[Synthetic control audit] ${prefix}-${mode}-${reviewer}`;
        await form.locator("textarea").fill(`${marker} private advice.`);
        const save = form.getByRole("button", {
          name: reviewer === "judge" ? "Save score" : "Save advice",
          exact: true,
        });
        await activate(save);
        await confirm({ cancel: true });
        assert.ok(
          !(await view("/review/synthetic-alice")).history.some((r) =>
            String(r.body || "").includes(marker),
          ),
          "Cancelled review must not persist",
        );
        await activate(save);
        await confirm();
        await page.waitForLoadState("networkidle");
        const data = await view("/review/synthetic-alice");
        const own = data.history.find((r) =>
          String(r.body || "").includes(marker),
        );
        assert.ok(own, "Private history receipt missing");
        if (reviewer === "judge") {
          assert.equal(own.author_id, "fake_judge");
          assert.equal(own.rating, 7);
        } else {
          assert.ok(
            data.history.every((r) => !Object.hasOwn(r, "rating")),
            "Mentor history must omit numeric scores",
          );
          assert.ok(
            !Object.hasOwn(own, "author_id"),
            "Mentor history omits private author identifiers",
          );
        }
        return { actor: `fake_${reviewer}`, private: true };
      });
      await reviewContext.close();
    }
  }
} catch (e) {
  report.failure = e.stack;
} finally {
  await browser.close();
  await Promise.allSettled(pendingResponses);
  report.finishedAt = new Date().toISOString();
  report.workerUnchanged = hash(worker) === workerSha;
  report.sourceUnchanged =
    execFileSync("git", ["-C", artifactRoot, "rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim() === source;
  report.resumePolicy =
    "Fail fast. Inspect actual state before retry after failed/uncertain write; full rerun requires fresh reset.";
  report.summary = {
    checks: report.checks.length,
    passed: report.checks.filter((c) => c.passed).length,
    failed: report.checks.filter((c) => !c.passed).length,
  };
  writeFileSync(
    join(output, "receipt.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  if (readFileSync(leasePath, "utf8") === leaseToken) unlinkSync(leasePath);
}
console.log(
  JSON.stringify(
    {
      output,
      ...report.summary,
      failed: report.checks.filter((c) => !c.passed),
      blocked: report.blocked,
      failure: report.failure,
    },
    null,
    2,
  ),
);
if (
  report.failure ||
  report.checks.some((c) => !c.passed) ||
  report.blocked.length ||
  report.pageErrors.length ||
  !report.workerUnchanged ||
  !report.sourceUnchanged
)
  process.exitCode = 1;
