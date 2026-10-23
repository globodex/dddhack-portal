// Independent, read-only performance observation of the compiled synthetic preview.
// This does not start a server, seed data, mutate the portal, or contact production.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const base = "http://127.0.0.1:4173";
const runner =
  "/tmp/ddehack-playwright-runner/node_modules/playwright/index.mjs";
const previewRoot =
  "/home/param302/Dev/DDEHack-portal/.worktrees/visual-integration";
const ownRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const plan = {
  base,
  runner,
  chromiumSandbox: true,
  fixtures: ["anonymous", "fake_alice", "fake_admin"],
  routes: ["/", "/profile", "/admin/participants"],
  viewports: [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ],
  methods: ["GET", "HEAD"],
  externalRequests: "abort",
  output: "outputs/visual-performance/<unique-run>/report.json",
};
if (!process.argv.includes("--preview-ready")) {
  console.log(
    JSON.stringify(
      {
        launch: false,
        reason:
          "Wait for root to confirm preview readiness, then explicitly pass --preview-ready.",
        plan,
      },
      null,
      2,
    ),
  );
  process.exit(0);
}
assert(
  existsSync(runner),
  "The approved official Playwright runner is unavailable; do not install a substitute.",
);
const compiledPaths = [
  "dist/server/index.js",
  "dist/server/wrangler.json",
  "dist/client/.vite/manifest.json",
];
const fingerprint = () =>
  Object.fromEntries(
    compiledPaths.map((name) => {
      const path = join(previewRoot, name);
      assert(existsSync(path), `Compiled preview artifact missing: ${name}`);
      return [
        name,
        createHash("sha256").update(readFileSync(path)).digest("hex"),
      ];
    }),
  );
const artifactBefore = fingerprint();
const runId = new Date().toISOString().replaceAll(":", "-") + "-" + process.pid;
const output = join(ownRoot, "outputs", "visual-performance", runId);
mkdirSync(output, { recursive: true });
const { chromium } = await import(runner);
const report = {
  plan,
  runId,
  startedAt: new Date().toISOString(),
  previewRoot,
  artifactBefore,
  browser: null,
  cases: [],
  failure: null,
  limitations: [
    "Local compiled preview, disposable synthetic fixtures, unthrottled browser. These are not production performance measurements or controlled comparative benchmarks.",
    "Each case uses a fresh context with cache disabled. Request routing also disables HTTP cache; these observations do not describe a returning user's warm-cache experience.",
    "Browser-observed API counts exclude backend-internal service calls. Repeated requests are reported with their phase and exact canonical URL, without assuming their cause.",
    "CDP encodedDataLength and Resource Timing transferSize are distinct browser-reported measurements, retained separately. Unknown sizes remain null rather than being inferred from Content-Length.",
    "Image decode probes run after each timing snapshot. They measure explicit decode() completion at that point, often on an already decoded image; they are not the image's original decode cost.",
    "Document-image probes do not measure original CSS background, canvas or inline SVG decode work. Resource request records still capture any downloaded image resources.",
    "Last observed LCP candidates are not finalized Core Web Vitals. No causal performance claims are generated.",
  ],
};
let browser;
function canonicalURL(value) {
  const url = new URL(value);
  url.searchParams.sort();
  return url.href;
}
function summary(records) {
  const finished = records.filter(
    (row) => typeof row.encodedDataLength === "number",
  );
  const byType = {};
  for (const row of records) {
    const group = (byType[row.type || "Unknown"] ||= {
      requests: 0,
      finishedWithKnownBytes: 0,
      encodedBytes: 0,
    });
    group.requests++;
    if (typeof row.encodedDataLength === "number") {
      group.finishedWithKnownBytes++;
      group.encodedBytes += row.encodedDataLength;
    }
  }
  const groups = new Map();
  for (const row of records) {
    if (row.method !== "GET" || new URL(row.url).pathname !== "/api/portal")
      continue;
    const key = canonicalURL(row.url),
      group = groups.get(key) || [];
    group.push({
      id: row.id,
      phase: row.phase,
      timestamp: row.timestamp,
      status: row.status ?? null,
    });
    groups.set(key, group);
  }
  return {
    requests: records.length,
    finishedWithKnownBytes: finished.length,
    encodedBytes: finished.reduce(
      (total, row) => total + row.encodedDataLength,
      0,
    ),
    byType,
    apiCalls: [...groups].map(([url, requests]) => ({
      url,
      count: requests.length,
      requests,
    })),
    duplicateApiCalls: [...groups]
      .filter(([, rows]) => rows.length > 1)
      .map(([url, requests]) => ({ url, count: requests.length, requests })),
  };
}
async function snapshot(page) {
  return page.evaluate(() => ({
    capturedAtMs: performance.now(),
    navigation: performance
      .getEntriesByType("navigation")
      .map((entry) => entry.toJSON()),
    paint: performance.getEntriesByType("paint").map((entry) => entry.toJSON()),
    observedLCP: window.__visualPerformance?.lcp || [],
    resources: performance
      .getEntriesByType("resource")
      .map((entry) => entry.toJSON()),
    layout: {
      innerWidth,
      innerHeight,
      scrollY,
      scrollHeight: document.documentElement.scrollHeight,
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
      inlineSvgCount: document.querySelectorAll("svg").length,
      canvasCount: document.querySelectorAll("canvas").length,
    },
  }));
}
async function images(page) {
  return page.evaluate(async () =>
    Promise.all(
      [...document.images].map(async (image, index) => {
        const rect = image.getBoundingClientRect();
        const record = {
          index,
          src: image.getAttribute("src"),
          currentSrc: image.currentSrc,
          loading: image.loading,
          decoding: image.decoding,
          fetchPriority: image.fetchPriority,
          complete: image.complete,
          naturalWidth: image.naturalWidth,
          naturalHeight: image.naturalHeight,
          renderedWidth: rect.width,
          renderedHeight: rect.height,
          inViewport:
            rect.bottom > 0 &&
            rect.right > 0 &&
            rect.top < innerHeight &&
            rect.left < innerWidth,
          decodeProbeMs: null,
          decodeProbeOutcome: "not attempted: incomplete or no natural image",
          resourceEntries: performance
            .getEntriesByName(image.currentSrc)
            .map((entry) => entry.toJSON()),
        };
        if (image.complete && image.naturalWidth > 0) {
          const start = performance.now();
          try {
            await image.decode();
            record.decodeProbeMs = performance.now() - start;
            record.decodeProbeOutcome = "resolved";
          } catch (error) {
            record.decodeProbeMs = performance.now() - start;
            record.decodeProbeOutcome = error.name;
          }
        }
        return record;
      }),
    ),
  );
}
async function settle(page, evidence) {
  try {
    await page.waitForLoadState("networkidle", { timeout: 15000 });
  } catch (error) {
    evidence.observationNotes.push(
      `Network-idle observation timed out: ${error.name}`,
    );
  }
  await page.evaluate(() =>
    Promise.race([
      document.fonts.ready.then(() => "ready"),
      new Promise((resolve) => setTimeout(() => resolve("timeout"), 5000)),
    ]),
  );
  // Fixed observation window; no clicks, data mutations or speculative retries.
  await page.waitForTimeout(750);
}
async function observe(name, route, identity, viewport) {
  const evidence = {
    name,
    route,
    fixture: identity?.id || "anonymous",
    viewport,
    cache: "disabled",
    requests: [],
    playwrightRequestSizes: [],
    blockedRequests: [],
    browserErrors: [],
    observationNotes: [],
    initial: null,
    afterScroll: null,
    summary: null,
  };
  report.cases.push(evidence);
  let phase = "initial-navigation";
  const pendingSizes = new Set();
  const context = await browser.newContext({
    viewport,
    serviceWorkers: "block",
  });
  try {
    await context.route("**/*", async (route) => {
      const request = route.request(),
        url = new URL(request.url());
      if (url.origin !== base || !["GET", "HEAD"].includes(request.method())) {
        evidence.blockedRequests.push({
          url: request.url(),
          method: request.method(),
          type: request.resourceType(),
          reason:
            url.origin !== base ? "external origin" : "non-read-only method",
        });
        await route.abort("blockedbyclient");
        return;
      }
      const headers = { ...request.headers() };
      delete headers["oai-authenticated-user-id"];
      delete headers["oai-authenticated-user-email"];
      if (identity) {
        headers["oai-authenticated-user-id"] = identity.id;
        headers["oai-authenticated-user-email"] = identity.email;
      }
      await route.continue({ headers });
    });
    await context.addInitScript(() => {
      performance.setResourceTimingBufferSize(5000);
      window.__visualPerformance = { lcp: [] };
      try {
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries())
            window.__visualPerformance.lcp.push({
              startTime: entry.startTime,
              renderTime: entry.renderTime,
              loadTime: entry.loadTime,
              size: entry.size,
              url: entry.url || null,
              tagName: entry.element?.tagName || null,
            });
        }).observe({ type: "largest-contentful-paint", buffered: true });
      } catch {}
    });
    const page = await context.newPage();
    page.on("pageerror", (error) =>
      evidence.browserErrors.push({
        type: "pageerror",
        message: error.message,
      }),
    );
    page.on("requestfinished", (request) => {
      const requestPhase = phase;
      const pending = request
        .sizes()
        .then((sizes) =>
          evidence.playwrightRequestSizes.push({
            url: request.url(),
            method: request.method(),
            phase: requestPhase,
            sizes,
          }),
        )
        .catch((error) =>
          evidence.playwrightRequestSizes.push({
            url: request.url(),
            method: request.method(),
            phase: requestPhase,
            sizes: null,
            error: error.message,
          }),
        )
        .finally(() => pendingSizes.delete(pending));
      pendingSizes.add(pending);
    });
    const client = await context.newCDPSession(page);
    await client.send("Network.enable");
    await client.send("Network.setCacheDisabled", { cacheDisabled: true });
    const inflight = new Map(),
      ordinals = new Map();
    client.on("Network.requestWillBeSent", (event) => {
      const previous = inflight.get(event.requestId);
      if (previous && event.redirectResponse) {
        previous.status = event.redirectResponse.status;
        previous.redirectResponseEncodedDataLength =
          event.redirectResponse.encodedDataLength ?? null;
        previous.redirected = true;
      }
      const ordinal = (ordinals.get(event.requestId) || 0) + 1;
      ordinals.set(event.requestId, ordinal);
      const row = {
        id: `${event.requestId}:${ordinal}`,
        phase,
        url: event.request.url,
        method: event.request.method,
        type: event.type,
        timestamp: event.timestamp,
        wallTime: event.wallTime,
        initiatorType: event.initiator.type,
        status: null,
        mimeType: null,
        encodedDataLength: null,
      };
      evidence.requests.push(row);
      inflight.set(event.requestId, row);
    });
    client.on("Network.responseReceived", (event) => {
      const row = inflight.get(event.requestId);
      if (row)
        Object.assign(row, {
          status: event.response.status,
          mimeType: event.response.mimeType,
          protocol: event.response.protocol,
          fromDiskCache: !!event.response.fromDiskCache,
          fromServiceWorker: !!event.response.fromServiceWorker,
          responseTimestamp: event.timestamp,
          responseTiming: event.response.timing || null,
        });
    });
    client.on("Network.loadingFinished", (event) => {
      const row = inflight.get(event.requestId);
      if (row)
        Object.assign(row, {
          encodedDataLength: event.encodedDataLength,
          finishedTimestamp: event.timestamp,
          requestDurationMs: (event.timestamp - row.timestamp) * 1000,
        });
    });
    client.on("Network.loadingFailed", (event) => {
      const row = inflight.get(event.requestId);
      if (row)
        Object.assign(row, {
          failure: event.errorText,
          blockedReason: event.blockedReason || null,
          canceled: event.canceled,
          failedTimestamp: event.timestamp,
        });
    });
    const response = await page.goto(base + route, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    evidence.navigationStatus = response?.status() ?? null;
    assert.equal(
      new URL(page.url()).origin,
      base,
      "Navigation must remain on the approved local preview.",
    );
    assert.equal(
      evidence.navigationStatus,
      200,
      "Expected the compiled fixture page to load successfully.",
    );
    if (route === "/profile")
      await page
        .getByRole("heading", { name: "Your profile", exact: true })
        .waitFor({ timeout: 15000 });
    else if (route === "/admin/participants")
      await page.locator(".participants-table").waitFor({ timeout: 15000 });
    else await page.locator("h1").first().waitFor({ timeout: 15000 });
    await settle(page, evidence);
    evidence.initial = {
      timings: await snapshot(page),
      images: await images(page),
    };
    phase = "controlled-scroll";
    const positions = [];
    for (let step = 0; step < 16; step++) {
      const position = await page.evaluate(() => {
        const before = scrollY;
        window.scrollBy(0, Math.max(200, innerHeight * 0.8));
        return {
          before,
          after: scrollY,
          bottom:
            scrollY + innerHeight >= document.documentElement.scrollHeight - 1,
        };
      });
      positions.push(position);
      if (position.bottom || position.after === position.before) break;
      await page.waitForTimeout(100);
    }
    await settle(page, evidence);
    evidence.afterScroll = {
      positions,
      timings: await snapshot(page),
      images: await images(page),
    };
    await Promise.allSettled([...pendingSizes]);
    evidence.summary = summary(evidence.requests);
    console.log(
      JSON.stringify({
        case: name,
        requests: evidence.summary.requests,
        encodedBytes: evidence.summary.encodedBytes,
        duplicateApiGroups: evidence.summary.duplicateApiCalls.length,
        blockedRequests: evidence.blockedRequests.length,
      }),
    );
    await client.detach();
  } catch (error) {
    evidence.failure = error.stack || String(error);
    throw error;
  } finally {
    await context.close();
  }
}
try {
  browser = await chromium.launch({ headless: true, chromiumSandbox: true });
  report.browser = browser.version();
  for (const [viewportName, viewport] of [
    ["desktop", plan.viewports[0]],
    ["mobile", plan.viewports[1]],
  ]) {
    await observe(`home-${viewportName}`, "/", null, viewport);
    await observe(
      `profile-${viewportName}`,
      "/profile",
      { id: "fake_alice", email: "alice@portal.test" },
      viewport,
    );
    await observe(
      `admin-${viewportName}`,
      "/admin/participants",
      { id: "fake_admin", email: "admin@portal.test" },
      viewport,
    );
  }
} catch (error) {
  report.failure = error.stack || String(error);
  process.exitCode = 1;
} finally {
  try {
    report.artifactAfter = fingerprint();
  } catch (error) {
    report.artifactAfterError = error.message;
    report.failure ||=
      "Compiled artifact became unavailable during observation.";
    process.exitCode = 1;
  }
  report.artifactChangedDuringRun =
    JSON.stringify(report.artifactBefore) !==
    JSON.stringify(report.artifactAfter);
  if (report.artifactChangedDuringRun) {
    report.failure ||=
      "Compiled artifact changed during observation; do not treat cases as one build.";
    process.exitCode = 1;
  }
  report.finishedAt = new Date().toISOString();
  writeFileSync(
    join(output, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  if (browser) await browser.close();
  console.log(
    JSON.stringify({
      report: join(output, "report.json"),
      failed: !!report.failure,
      artifactChangedDuringRun: report.artifactChangedDuringRun,
    }),
  );
}
