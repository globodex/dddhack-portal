// Local, synthetic, read-only rendering evidence. No external service is queried.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  writeFileSync,
} from "node:fs";
import { resolve, join } from "node:path";
import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

assert.ok(process.env.MIGRATION_MANIFEST, "MIGRATION_MANIFEST is required");
const manifest = JSON.parse(
  readFileSync(process.env.MIGRATION_MANIFEST, "utf8"),
);
for (const field of ["syntheticOnly", "disposable"])
  assert.equal(manifest[field], true, field);
const origin = new URL(manifest.origin);
assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(origin.hostname));
assert.equal(origin.protocol, "http:");
assert.equal(origin.origin, manifest.origin);
assert.ok(["vinext-source", "next-migration"].includes(manifest.runtime));
assert.ok(
  ["synthetic-sqlite", "synthetic-postgres", "mock-api"].includes(
    manifest.backend,
  ),
);
const sourceRoot = resolve(manifest.sourceRoot);
const source = () =>
  execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: sourceRoot,
    encoding: "utf8",
  }).trim();
const runtimePaths = [
  "app",
  "lib",
  "neon",
  "next.config.ts",
  "next.config.mjs",
  "package.json",
  "package-lock.json",
];
const fingerprint = () => {
  const paths = execFileSync(
    "git",
    ["ls-files", "-c", "-o", "--exclude-standard", "--", ...runtimePaths],
    { cwd: sourceRoot, encoding: "utf8" },
  )
    .trim()
    .split("\n")
    .filter(Boolean)
    .sort();
  const hash = createHash("sha256");
  for (const path of paths) {
    const file = join(sourceRoot, path);
    hash.update(path);
    hash.update(
      lstatSync(file).isSymbolicLink()
        ? readlinkSync(file)
        : readFileSync(file),
    );
  }
  return hash.digest("hex");
};
assert.equal(source(), manifest.source);
const runtimeFingerprint = fingerprint();
const dirtyRuntime = execFileSync(
  "git",
  ["status", "--porcelain", "--", ...runtimePaths],
  { cwd: sourceRoot, encoding: "utf8" },
).trim();
const output = resolve(
  process.env.MIGRATION_OUTPUT || `evidence/migration/${manifest.label}`,
);
mkdirSync(output, { recursive: true });
const report = {
  ...manifest,
  runtimeFingerprint,
  sourceHasUncommittedRuntimeChanges: !!dirtyRuntime,
  startedAt: new Date().toISOString(),
  browserSandbox: manifest.browserSandbox !== false,
  syntheticOnly: true,
  writes: false,
  screenshots: [],
  samples: [],
  accessibility: [],
  findings: [],
  errors: [],
  blocked: [],
  limitations: [
    "Local development runtime and disposable synthetic fixtures; no hosted timing, real sign-in, physical-device or production-data evidence.",
    "Cold timings are one unthrottled diagnostic observation per route, not a benchmark or capacity estimate.",
    "Screenshots use reduced motion and identical viewports. They prove the captured runtime only; mock API captures are explicitly labelled.",
  ],
};
const save = () =>
  writeFileSync(
    join(output, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
let browser;
try {
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true,
    chromiumSandbox: report.browserSandbox,
    args: [
      "--host-resolver-rules=MAP * ~NOTFOUND,EXCLUDE 127.0.0.1,EXCLUDE localhost",
    ],
    env: {
      ...process.env,
      XDG_CONFIG_HOME: "/tmp/qa-migration-browser-config",
      XDG_CACHE_HOME: "/tmp/qa-migration-browser-cache",
    },
  });
  if (!report.browserSandbox)
    report.limitations.push(
      "Chromium native sandbox is unavailable in this container (sandbox helper owner/user namespaces). Browser launched without it against allowlisted localhost only, fresh disposable contexts, and denied external DNS/requests.",
    );
  report.browser = browser.version();
  const scenarios = manifest.scenarios || [
    { label: "home", route: "/", actor: null, axe: true },
    { label: "rules", route: "/rules", actor: "alice", axe: true },
    { label: "dashboard", route: "/dashboard", actor: "alice", axe: true },
    { label: "profile", route: "/profile", actor: "alice", axe: true },
    { label: "discover", route: "/discover/participants", actor: "alice" },
    {
      label: "admin-participants",
      route: "/admin/participants",
      actor: "admin",
    },
    { label: "admin-teams", route: "/admin/teams", actor: "admin" },
    { label: "admin-credits", route: "/admin/credits", actor: "admin" },
  ];
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    for (const scenario of scenarios) {
      const context = await browser.newContext({
        viewport,
        reducedMotion: "reduce",
        serviceWorkers: "block",
        ...(viewport.width < 500 ? { isMobile: true, hasTouch: true } : {}),
      });
      // Selecting an existing synthetic session cookie does not mutate application data.
      if (scenario.actor)
        await context.addCookies([
          {
            name: "portal_local_fixture",
            value: scenario.actor,
            url: manifest.origin,
            httpOnly: true,
            sameSite: "Strict",
          },
        ]);
      await context.route("**/*", (route) => {
        const request = route.request(),
          url = new URL(request.url());
        if (
          url.origin !== origin.origin ||
          !["GET", "HEAD"].includes(request.method())
        ) {
          report.blocked.push({
            scenario: scenario.label,
            method: request.method(),
            origin: url.origin,
            path: url.pathname,
          });
          return route.abort("blockedbyclient");
        }
        return route.continue();
      });
      const page = await context.newPage();
      const requests = [];
      page.on("request", (request) =>
        requests.push({
          method: request.method(),
          path: new URL(request.url()).pathname,
          resourceType: request.resourceType(),
        }),
      );
      page.on("pageerror", (error) =>
        report.errors.push({
          scenario: scenario.label,
          viewport,
          error: error.message,
        }),
      );
      try {
        const start = performance.now();
        const response = await page.goto(origin.origin + scenario.route, {
          waitUntil: "domcontentloaded",
          timeout: 60_000,
        });
        assert.equal(response.status(), 200, scenario.route);
        await page.locator("#main h1,h1").first().waitFor({ timeout: 30_000 });
        await page.waitForFunction(
          () =>
            !document.querySelector(".route-skeleton") &&
            !document.querySelector(".loading"),
        );
        if (scenario.route === "/")
          await page.waitForFunction(() =>
            document.querySelector(
              '.hero-dots .public-dot[style*="translate3d"]',
            ),
          );
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(300);
        const observation = await page.evaluate(() => ({
          title: document.title,
          heading: document.querySelector("#main h1,h1")?.textContent,
          horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
          navigation: performance
            .getEntriesByType("navigation")
            .map((entry) => entry.toJSON()),
          anchors: [
            ...document.querySelectorAll(
              ".public-hero,.home-hero,.delhi-wordmark,.hero-dots,.sidebar,.mobile-header,#main,.participants-table,.admin-team-list",
            ),
          ].map((node) => {
            const r = node.getBoundingClientRect();
            return {
              selector: node.id ? `#${node.id}` : node.className,
              x: r.x,
              y: r.y,
              width: r.width,
              height: r.height,
            };
          }),
        }));
        const path = join(
          output,
          `${scenario.label}-${viewport.width}x${viewport.height}-viewport.png`,
        );
        await page.screenshot({
          path,
          fullPage: false,
          animations: "disabled",
          style: "nextjs-portal { visibility: hidden !important; }",
        });
        const capture = {
          path,
          route: scenario.route,
          actor: scenario.actor || "anonymous",
          viewport,
          fullPage: false,
          developmentToolOverlayHidden: true,
          source: manifest.source,
          runtime: manifest.runtime,
          backend: manifest.backend,
          realBackend: manifest.backend !== "mock-api",
          sha256: createHash("sha256").update(readFileSync(path)).digest("hex"),
          inspected: false,
        };
        report.screenshots.push(capture);
        if (observation.horizontalOverflow)
          report.findings.push({
            scenario: scenario.label,
            viewport,
            issue: "horizontal-overflow",
          });
        const alerts = (await page.getByRole("alert").allTextContents())
          .map((text) => text.trim())
          .filter(Boolean);
        if (alerts.length)
          report.findings.push({
            scenario: scenario.label,
            viewport,
            issue: "error-alert",
            text: alerts,
          });
        report.samples.push({
          scenario: scenario.label,
          viewport,
          elapsedToCaptureMs: performance.now() - start,
          ...observation,
          requests,
          portalApiRequests: requests.filter(
            (request) => request.path === "/api/portal",
          ).length,
        });
        if (scenario.axe) {
          const result = await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
            .analyze();
          report.accessibility.push({
            scenario: scenario.label,
            viewport,
            violations: result.violations,
            incomplete: result.incomplete.map(({ id, impact, nodes }) => ({
              id,
              impact,
              nodes: nodes.length,
            })),
          });
        }
      } catch (error) {
        report.errors.push({
          scenario: scenario.label,
          viewport,
          error: String(error.stack || error),
        });
      } finally {
        save();
        await context.close();
      }
    }
  }
  assert.equal(
    source(),
    manifest.source,
    "Source revision changed during capture",
  );
  assert.equal(
    fingerprint(),
    runtimeFingerprint,
    "Runtime source changed during capture",
  );
  assert.equal(report.errors.length, 0, "Capture failures; see report");
  assert.equal(
    report.blocked.length,
    0,
    "Unexpected network requests; see report",
  );
  if (report.accessibility.some((result) => result.violations.length))
    report.findings.push({
      issue: "accessibility-violations",
      count: report.accessibility.flatMap((result) => result.violations).length,
    });
} catch (error) {
  report.failure = String(error.stack || error);
  process.exitCode = 1;
} finally {
  await browser?.close();
  report.browserClosed = true;
  report.finishedAt = new Date().toISOString();
  save();
}
console.log(
  JSON.stringify(
    {
      report: join(output, "report.json"),
      captures: report.screenshots.length,
      axeScans: report.accessibility.length,
      errors: report.errors.length,
      failure: report.failure,
    },
    null,
    2,
  ),
);
