// Bounded GET-only observations of the disposable localhost preview, never a capacity test.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const base = "http://127.0.0.1:4173";
const previewRoot =
  "/home/param302/Dev/DDEHack-portal/.worktrees/visual-integration";
const ownRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const scenarios = [
  { name: "home-api", view: "/", identity: null },
  {
    name: "profile-api",
    view: "/profile",
    identity: { id: "fake_alice", email: "alice@portal.test" },
  },
  {
    name: "admin-api",
    view: "/admin/participants",
    identity: { id: "fake_admin", email: "admin@portal.test" },
  },
];
const plan = {
  base,
  methods: ["GET"],
  redirects: "error",
  timeoutMs: 10000,
  concurrency: [1, 4, 8],
  samplesPerBurst: 24,
  warmupsPerScenario: 2,
  scenarios: scenarios.map(({ name, view, identity }) => ({
    name,
    view,
    fixture: identity?.id || "anonymous",
  })),
  maximumMeasuredRequests: 216,
  production: false,
  mutations: false,
};
const labelIndex = process.argv.indexOf("--label"),
  label = labelIndex >= 0 ? process.argv[labelIndex + 1] : "baseline";
assert(
  ["baseline", "after"].includes(label),
  "Use --label baseline or --label after.",
);
if (!process.argv.includes("--preview-ready")) {
  console.log(
    JSON.stringify(
      {
        launch: false,
        reason:
          "Root must confirm fresh synthetic preview readiness before --preview-ready is supplied.",
        label,
        plan,
      },
      null,
      2,
    ),
  );
  process.exit(0);
}
const fingerprint = () =>
  Object.fromEntries(
    [
      "dist/server/index.js",
      "dist/server/wrangler.json",
      "dist/client/.vite/manifest.json",
    ].map((file) => [
      file,
      createHash("sha256")
        .update(readFileSync(join(previewRoot, file)))
        .digest("hex"),
    ]),
  );
const before = fingerprint();
const runId = `${new Date().toISOString().replaceAll(":", "-")}-${process.pid}`;
const output = join(
  ownRoot,
  "outputs",
  "performance-bursts",
  `${label}-${runId}`,
);
mkdirSync(output, { recursive: true });
const report = {
  label,
  runId,
  startedAt: new Date().toISOString(),
  plan,
  artifactBefore: before,
  samples: [],
  summaries: [],
  failure: null,
  limitations: [
    "Local compiled Worker and disposable synthetic D1 fixtures only. No live stress, writes, production probes or capacity guarantee.",
    "HTTP elapsed time includes response body receipt in this local Node client. It is not browser render time, backend-only execution time or database-query time.",
    "24 samples per burst provide coarse empirical percentiles; no confidence interval or statistical causal conclusion is inferred.",
    "Same-host CPU contention, Worker/SQLite caches, previous runs, parallel visual tests and fixture changes can affect results. Baseline/after reports must identify builds and run under comparable conditions.",
    "The script has no automatic retry, no redirect following and no endpoint or concurrency override.",
  ],
};
function percentile(sorted, fraction) {
  return sorted.length
    ? sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)]
    : null;
}
async function sample(scenario, concurrency, index, warmup = false) {
  const url = new URL("/api/portal", base);
  url.searchParams.set("view", scenario.view);
  assert.equal(url.origin, base);
  const started = performance.now();
  let status = null,
    bytes = null,
    failure = null,
    fixtureVerified = scenario.identity === null ? true : null;
  try {
    const headers = { accept: "application/json", "cache-control": "no-cache" };
    if (scenario.identity) {
      headers["oai-authenticated-user-id"] = scenario.identity.id;
      headers["oai-authenticated-user-email"] = scenario.identity.email;
    }
    const response = await fetch(url, {
      method: "GET",
      headers,
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(plan.timeoutMs),
    });
    status = response.status;
    const body = await response.arrayBuffer();
    bytes = body.byteLength;
    if (status !== 200) failure = `HTTP ${status}`;
    else {
      const parsed = JSON.parse(new TextDecoder().decode(body));
      if (scenario.identity) {
        fixtureVerified = parsed.me?.id === scenario.identity.id;
        if (!fixtureVerified) failure = "Unexpected fixture identity";
      }
      // Never persist response bodies, returned participant rows or private values.
    }
  } catch (error) {
    failure = `${error.name}: ${error.message}`;
  }
  return {
    scenario: scenario.name,
    view: scenario.view,
    fixture: scenario.identity?.id || "anonymous",
    concurrency,
    index,
    warmup,
    status,
    bytes,
    elapsedMs: performance.now() - started,
    failure,
    fixtureVerified,
  };
}
try {
  for (const scenario of scenarios) {
    for (let i = 0; i < plan.warmupsPerScenario; i++) {
      const result = await sample(scenario, 1, i, true);
      report.samples.push(result);
      assert.equal(
        result.failure,
        null,
        `Preflight/warmup failed for ${scenario.name}: ${result.failure}`,
      );
    }
    for (const concurrency of plan.concurrency) {
      const results = [];
      let next = 0,
        identityMismatch = false;
      const started = performance.now();
      await Promise.all(
        Array.from({ length: concurrency }, async () => {
          while (!identityMismatch && next < plan.samplesPerBurst) {
            const index = next++;
            const result = await sample(scenario, concurrency, index);
            results.push(result);
            report.samples.push(result);
            if (result.fixtureVerified === false) identityMismatch = true;
          }
        }),
      );
      assert.equal(
        identityMismatch,
        false,
        "Fixture identity mismatch; stop observations after in-flight reads settle.",
      );
      const allDurations = results
        .map((row) => row.elapsedMs)
        .sort((a, b) => a - b);
      const successDurations = results
        .filter((row) => row.failure === null)
        .map((row) => row.elapsedMs)
        .sort((a, b) => a - b);
      const errors = results.filter((row) => row.failure !== null);
      const summary = {
        scenario: scenario.name,
        concurrency,
        requested: plan.samplesPerBurst,
        observed: results.length,
        successes: results.length - errors.length,
        errors: errors.length,
        errorRate: results.length ? errors.length / results.length : null,
        wallMs: performance.now() - started,
        allP50Ms: percentile(allDurations, 0.5),
        allP95Ms: percentile(allDurations, 0.95),
        successfulP50Ms: percentile(successDurations, 0.5),
        successfulP95Ms: percentile(successDurations, 0.95),
        statusCounts: Object.fromEntries(
          [...new Set(results.map((row) => String(row.status)))].map(
            (status) => [
              status,
              results.filter((row) => String(row.status) === status).length,
            ],
          ),
        ),
      };
      report.summaries.push(summary);
      console.log(JSON.stringify(summary));
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
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
    JSON.stringify(before) !== JSON.stringify(report.artifactAfter);
  if (report.artifactChangedDuringRun) {
    report.failure ||=
      "Compiled artifact changed during this run; do not compare these bursts as one build.";
    process.exitCode = 1;
  }
  report.finishedAt = new Date().toISOString();
  writeFileSync(
    join(output, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      report: join(output, "report.json"),
      failed: !!report.failure,
    }),
  );
}
