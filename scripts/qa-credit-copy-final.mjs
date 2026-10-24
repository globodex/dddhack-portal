import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";
const source = "667222d5cd2680ec872860b971f32ecb7be42249",
  root = "/workspace/dddhack-portal",
  origin = "http://localhost:3000",
  out = "evidence/credit-copy-final";
assert.equal(
  execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim(),
  source,
);
assert.ok(
  !existsSync(out + "/report.json"),
  "Inspect prior reveal before rerunning",
);
mkdirSync(out, { recursive: true });
const report = {
  source,
  syntheticOnly: true,
  fixtureBackend: 8821,
  writes: [],
  screenshots: [],
  checks: [],
  errors: [],
};
const save = () =>
  writeFileSync(out + "/report.json", JSON.stringify(report, null, 2));
save();
const b = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  headless: true,
  chromiumSandbox: false,
});
const c = await b.newContext({
  viewport: { width: 320, height: 720 },
  hasTouch: true,
  isMobile: true,
  reducedMotion: "reduce",
  permissions: ["clipboard-read", "clipboard-write"],
});
await c.addCookies([
  {
    name: "portal_local_fixture",
    value: "alice",
    url: origin,
    httpOnly: true,
    sameSite: "Strict",
  },
]);
await c.route("**/*", (r) => {
  const req = r.request();
  if (new URL(req.url()).origin !== origin) return r.abort();
  if (!["GET", "HEAD"].includes(req.method())) {
    const d = req.postDataJSON();
    assert.equal(d.action, "reveal-credit");
    assert.equal(d.data.typeId, "fake_credit");
    assert.equal(report.writes.length, 0);
    report.writes.push({
      action: d.action,
      typeId: d.data.typeId,
      status: "pending",
    });
    save();
  }
  return r.continue();
});
const p = await c.newPage();
p.setDefaultTimeout(30000);
p.on("pageerror", (e) => report.errors.push(e.message));
const shot = async (name, size) => {
  const path = out + "/" + name + "-" + size + ".png";
  await p.screenshot({
    path,
    fullPage: false,
    animations: "disabled",
    style: "nextjs-portal{visibility:hidden!important}",
  });
  report.screenshots.push({
    path,
    sha256: createHash("sha256").update(readFileSync(path)).digest("hex"),
  });
  save();
};
try {
  await p.goto(origin + "/dashboard#credits", {
    waitUntil: "networkidle",
    timeout: 60000,
  });
  await p.getByRole("tab", { name: "Credits", exact: true }).tap();
  await p.locator(".dashboard-credit").first().waitFor();
  await shot("masked", "320x720");
  const response = p.waitForResponse(
    (r) =>
      r.request().method() === "POST" &&
      r.request().postDataJSON()?.action === "reveal-credit",
    { timeout: 60000 },
  );
  await p
    .getByRole("button", { name: "Reveal my allocation", exact: true })
    .tap();
  const r = await response;
  report.writes[0].httpStatus = r.status();
  report.writes[0].status =
    r.status() === 200 ? "revealed-synthetic" : "failed";
  save();
  assert.equal(r.status(), 200);
  await p.getByRole("button", { name: "Copy allocation", exact: true }).tap();
  const copied = p.getByRole("button", {
    name: "Copied allocation",
    exact: true,
  });
  await copied.waitFor();
  assert.equal(
    await p.evaluate(() => navigator.clipboard.readText()),
    "SYNTHETIC-NOT-REDEEMABLE-VOUCHER",
  );
  assert.equal(await copied.locator("svg.lucide-circle-check").count(), 1);
  assert.ok(
    await p
      .getByRole("status")
      .filter({ hasText: "Allocation copied" })
      .count(),
  );
  await shot("copied-visible", "320x720");
  await p.setViewportSize({ width: 1440, height: 900 });
  await copied.focus();
  await copied.press("Enter");
  await shot("copied-visible", "1440x900");
  await p.getByRole("button", { name: "Hide allocation", exact: true }).click();
  assert.equal(
    await p
      .getByRole("button", { name: "Copy allocation", exact: true })
      .isDisabled(),
    true,
  );
  report.checks.push({
    name: "320 touch reveal/copy, actual clipboard, visible CircleCheck/green state and live success announcement; desktop keyboard copy and Hide",
    passed: true,
  });
  assert.equal(report.errors.length, 0);
} catch (e) {
  report.failure = String(e.stack || e);
  process.exitCode = 1;
} finally {
  await b.close();
  save();
}
console.log(JSON.stringify(report, null, 2));
