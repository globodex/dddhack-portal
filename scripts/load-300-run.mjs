// Disposable actual compiled Worker + D1 test. Never imported by application code.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  makeLoad300,
  projectPayload,
  seedLoad300,
} from "./load-300-fixtures.mjs";
const ownRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const artifactRoot = resolve(ownRoot, "../visual-integration");
const base = "http://127.0.0.1:4183";
const fixture = makeLoad300();
const plan = {
  base,
  fixture: fixture.summary,
  concurrency: [1, 4, 8, 16],
  timeoutMs: 20000,
  maxInFlight: 16,
  plannedRequests: 1986,
  plannedGET: 314,
  plannedPOST: 1672,
  workloadBudgetMs: 480000,
  actualCompiledWorker: true,
  actualD1: true,
  disposable: true,
  externalFetch: "deny all Worker outbound requests",
  AI: "inactive/no model calls",
  runtime: "local workerd through Miniflare; not hosted capacity",
  ownerActions: false,
  operationalAdmins: 2,
  mutations:
    "only synthetic local submissions, explicit fixture eligibility decisions and upvotes",
  artifactRoot,
};
if (!process.argv.includes("--artifact-ready")) {
  console.log(
    JSON.stringify(
      {
        launch: false,
        reason:
          "Wait for root new combined build readiness; --artifact-ready explicitly acknowledges that signal.",
        plan,
      },
      null,
      2,
    ),
  );
  process.exit(0);
}
const hash = (value) => createHash("sha256").update(value).digest("hex");
const fingerprint = (root = artifactRoot) =>
  Object.fromEntries(
    [
      "dist/server/index.js",
      "dist/server/wrangler.json",
      "dist/client/.vite/manifest.json",
    ].map((file) => [file, hash(readFileSync(join(root, file)))]),
  );
const sourceArtifactBefore = fingerprint();
const approvedWorker = process.env.LOAD_300_WORKER_SHA ||
  "75a667d2c42a821611c3cbbea72447ee464e2ad5f2f6165fbbba647764e69ce6";
assert.match(approvedWorker, /^[a-f0-9]{64}$/, "An exact root-reviewed Worker SHA-256 is required.");
assert.equal(
  sourceArtifactBefore["dist/server/index.js"],
  approvedWorker,
  "Root-approved Worker fingerprint differs; wait for fresh readiness.",
);
const compiledConfig = JSON.parse(
  readFileSync(join(artifactRoot, "dist/server/wrangler.json"), "utf8"),
);
assert.equal(
  compiledConfig.compatibility_date,
  "2026-06-18",
  "Re-review a changed compiled compatibility date.",
);
const runId = `${new Date().toISOString().replaceAll(":", "-")}-${process.pid}`;
const output = join(ownRoot, "outputs", "load-300", runId);
mkdirSync(output, { recursive: true });
const temporary = mkdtempSync(join(tmpdir(), "ddehack-load-300-"));
const snapshotRoot = join(temporary, "artifact");
mkdirSync(snapshotRoot);
cpSync(join(artifactRoot, "dist"), join(snapshotRoot, "dist"), {
  recursive: true,
});
cpSync(join(artifactRoot, "drizzle"), join(snapshotRoot, "drizzle"), {
  recursive: true,
});
const artifactBefore = fingerprint(snapshotRoot);
assert.deepEqual(
  artifactBefore,
  sourceArtifactBefore,
  "Artifact changed while copying immutable snapshot.",
);
const workloadAbort = new AbortController();
let workloadTimer;
process.env.CLOUDFLARE_CF_FETCH_ENABLED = "false";
process.env.WRANGLER_SEND_METRICS = "false";
const report = {
  runId,
  startedAt: new Date().toISOString(),
  plan,
  artifactBefore,
  sourceArtifactBefore,
  rootProvidedSourceRevision: process.env.LOAD_300_SOURCE || "0e7756c60e2fff88a4f7fb1e3eca31efc20349d0",
  immutableSnapshot: true,
  samples: [],
  groups: [],
  checks: [],
  blockedOutbound: [],
  failure: null,
  limitations: [
    "Exactly300 simulated participants is not300 concurrent requests. Maximum in-flight requests is16.",
    "Local compiled HTTP+workerd+D1 fixture diagnostics do not establish hosting capacity or production latency.",
    "All application mutations use real compiled HTTP routes; direct D1 access only migrates/seeds disposable fixtures and reads invariant checks.",
    "Synthetic local operational window and manual eligibility decisions are explicit fixture setup, not production policy changes or repository verification.",
    "Expected authorization/concurrency/attempt rejections are reported separately from unexpected errors. No automatic retry hides failures.",
    "No response bodies, headers, uploaded images or secrets are persisted to the measurement report.",
  ],
};
let mf, db;
let sequence = 0;
const identities = new Map(
  [...fixture.participants, ...fixture.operations].map((p) => [p.id, p]),
);
const states = new Map(
  fixture.teams.map((t) => [
    t.id,
    { team: t, revision: 0, requests: [], projectId: null, versionId: null },
  ]),
);
const rows = async (sql, ...values) =>
  (
    await db
      .prepare(sql)
      .bind(...values)
      .all()
  ).results;
const scalar = async (sql, ...values) =>
  Number(
    (
      await db
        .prepare(sql)
        .bind(...values)
        .first()
    ).n,
  );
async function request({
  identity = null,
  view = null,
  page = 0,
  action = null,
  data = null,
  phase,
  concurrency,
  expectedCodes = [],
}) {
  const url = new URL("/api/portal", base);
  if (view !== null) {
    url.searchParams.set("view", view);
    url.searchParams.set("page", String(page));
  }
  assert.equal(url.origin, base);
  const method = action ? "POST" : "GET";
  const headers = { accept: "application/json" };
  if (identity) {
    assert(identities.has(identity.id));
    headers["oai-authenticated-user-id"] = identity.id;
    headers["oai-authenticated-user-email"] = identity.email;
    headers["oai-authenticated-user-full-name"] = identity.name;
  }
  const body = action ? JSON.stringify({ action, data }) : undefined;
  if (action) {
    headers.origin = base;
    headers["content-type"] = "application/json";
  }
  const sample = {
    sequence: sequence++,
    phase,
    concurrency,
    actor: identity?.id || "anonymous",
    method,
    view,
    action,
    status: null,
    code: null,
    expectedRejection: false,
    unexpectedError: false,
    elapsedMs: null,
    requestBytes: body ? Buffer.byteLength(body) : 0,
    responseBytes: null,
  };
  const start = performance.now();
  let parsed = null;
  try {
    const response = await fetch(url, {
      method,
      headers,
      body,
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.any([
        AbortSignal.timeout(plan.timeoutMs),
        workloadAbort.signal,
      ]),
    });
    sample.status = response.status;
    const bytes = await response.arrayBuffer();
    sample.responseBytes = bytes.byteLength;
    parsed = JSON.parse(new TextDecoder().decode(bytes));
    sample.code = parsed.code || null;
    sample.expectedRejection =
      !response.ok && expectedCodes.includes(sample.code);
    sample.unexpectedError = !response.ok && !sample.expectedRejection;
  } catch (error) {
    sample.code = error.name;
    sample.failure = error.message;
    sample.unexpectedError = true;
  }
  sample.elapsedMs = performance.now() - start;
  report.samples.push(sample);
  return { ...sample, body: parsed };
}
function expectOK(result) {
  assert.equal(
    result.status,
    200,
    `${result.phase}: expected200 got${result.status}/${result.code}`,
  );
  assert.equal(result.unexpectedError, false);
  return result.body;
}
async function group(name, items, concurrency, operation) {
  assert(plan.concurrency.includes(concurrency));
  const start = performance.now(),
    from = report.samples.length;
  let cursor = 0,
    firstError;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (!firstError && cursor < items.length) {
        const index = cursor++;
        try {
          await operation(items[index], index, name, concurrency);
        } catch (error) {
          firstError ||= error;
        }
      }
    }),
  );
  const samples = report.samples.slice(from),
    durations = samples.map((s) => s.elapsedMs).sort((a, b) => a - b),
    pct = (p) =>
      durations.length
        ? durations[Math.max(0, Math.ceil(durations.length * p) - 1)]
        : null;
  const summary = {
    name,
    concurrency,
    plannedOperations: items.length,
    requestCount: samples.length,
    wallMs: performance.now() - start,
    p50Ms: pct(0.5),
    p95Ms: pct(0.95),
    responses2xx: samples.filter((s) => s.status >= 200 && s.status < 300)
      .length,
    expectedRejections: samples.filter((s) => s.expectedRejection).length,
    unexpectedErrors: samples.filter((s) => s.unexpectedError).length,
    unexpectedErrorRate: samples.length
      ? samples.filter((s) => s.unexpectedError).length / samples.length
      : null,
    non2xxRate: samples.length
      ? samples.filter((s) => !s.status || s.status < 200 || s.status >= 300)
          .length / samples.length
      : null,
    methodCounts: Object.fromEntries(
      ["GET", "POST"].map((method) => [
        method,
        samples.filter((s) => s.method === method).length,
      ]),
    ),
  };
  report.groups.push(summary);
  console.log(JSON.stringify(summary));
  if (firstError) throw firstError;
}
async function counts(label) {
  const count = {
    label,
    participants: await scalar(
      "SELECT count(*) n FROM users WHERE role='participant'",
    ),
    operationalAdmins: await scalar(
      "SELECT count(*) n FROM users WHERE role='admin'",
    ),
    teams: await scalar("SELECT count(*) n FROM teams"),
    memberships: await scalar("SELECT count(*) n FROM memberships"),
    projects: await scalar("SELECT count(*) n FROM projects"),
    versions: await scalar("SELECT count(*) n FROM submission_versions"),
    receipts: await scalar("SELECT count(*) n FROM project_commit_receipts"),
    upvotes: await scalar("SELECT count(*) n FROM project_upvotes"),
    maxTeamSize: await scalar(
      "SELECT max(n) n FROM (SELECT count(*) n FROM memberships GROUP BY team_id)",
    ),
    maxAttempts: await scalar(
      "SELECT COALESCE(max(n),0) n FROM (SELECT count(*) n FROM submission_versions GROUP BY team_id)",
    ),
    evaluationRuns: await scalar("SELECT count(*) n FROM evaluation_runs"),
    astraJobs: await scalar("SELECT count(*) n FROM astra_jobs"),
  };
  report.checks.push(count);
  assert.equal(count.participants, 300);
  assert.equal(count.operationalAdmins, 2);
  assert.equal(count.teams, 90);
  assert.equal(count.memberships, 300);
  assert(count.maxTeamSize <= 5);
  assert(count.maxAttempts <= 3);
  assert.equal(count.evaluationRuns, 0);
  assert.equal(count.astraJobs, 0);
  return count;
}
function leader(state) {
  return identities.get(state.team.leaderId);
}
async function commit(state, attempt, phase, concurrency, variant = "normal") {
  const data = {
    revision: state.revision,
    project: projectPayload(state.team, attempt, variant),
  };
  const result = expectOK(
    await request({
      identity: leader(state),
      action: "submit-project",
      data,
      phase,
      concurrency,
    }),
  );
  assert(result.projectId && result.versionId);
  state.requests.push(data);
  state.projectId = result.projectId;
  state.versionId = result.versionId;
  state.revision++;
  return result;
}
async function publicPages(label) {
  const found = [];
  for (let page = 0; page < 4; page++) {
    const body = expectOK(
      await request({ view: "/projects", page, phase: label, concurrency: 1 }),
    );
    assert.equal(body.items.length, page === 3 ? 18 : 24);
    assert.equal(body.hasMore, page < 3);
    found.push(...body.items.map((p) => p.id));
  }
  assert.equal(new Set(found).size, 90);
  report.checks.push({
    label,
    publicProjects: found.length,
    uniquePublicProjects: new Set(found).size,
    pages: [24, 24, 24, 18],
  });
}
try {
  const { Miniflare } = await import(
    pathToFileURL(
      join(artifactRoot, "node_modules/miniflare/dist/src/index.js"),
    ).href
  );
  const { draftPolicy } = await import(
    pathToFileURL(join(artifactRoot, "lib/policy.ts")).href
  );
  // Enumerate unchanged compiled modules: automatic graph discovery cannot
  // resolve the bundler's computed dynamic imports.
  const serverRoot = join(snapshotRoot, "dist/server");
  const compiledModules = [];
  function collectModules(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) collectModules(path);
      else if (/\.m?js$/.test(entry.name))
        compiledModules.push({ type: "ESModule", path });
    }
  }
  collectModules(serverRoot);
  const entryPath = join(serverRoot, "index.js");
  compiledModules.sort((a, b) =>
    a.path === entryPath ? -1 : b.path === entryPath ? 1 : a.path.localeCompare(b.path),
  );
  report.compiledModules = compiledModules.length;
  mf = new Miniflare({
    name: "ddehack-load-300-local",
    modules: compiledModules,
    modulesRoot: serverRoot,
    compatibilityDate: compiledConfig.compatibility_date,
    compatibilityFlags: compiledConfig.compatibility_flags,
    host: "127.0.0.1",
    port: 4183,
    inspectorPort: 0,
    d1Databases: { DB: "ddehack-load-300-disposable" },
    d1Persist: join(temporary, "d1"),
    bindings: { PORTAL_RUNTIME: "sites", PORTAL_TRUST_SITES_DISPATCH: "true" },
    assets: {
      directory: join(snapshotRoot, "dist/client"),
      binding: "ASSETS",
      routerConfig: {
        has_user_worker: true,
        invoke_user_worker_ahead_of_assets: true,
      },
    },
    outboundService: async (request) => {
      report.blockedOutbound.push({ url: request.url, method: request.method });
      return new Response("External traffic blocked by local load harness", {
        status: 503,
      });
    },
  });
  await mf.ready;
  db = await mf.getD1Database("DB");
  for (const file of readdirSync(join(snapshotRoot, "drizzle"))
    .filter((file) => file.endsWith(".sql"))
    .sort())
    for (const sql of readFileSync(join(snapshotRoot, "drizzle", file), "utf8")
      .split("--> statement-breakpoint")
      .filter((sql) => sql.trim()))
      await db.prepare(sql).all();
  report.fixtureSetup = await seedLoad300(db, fixture, draftPolicy);
  await counts("seeded-exact-cardinality");
  const databaseSizes = await rows(
    "SELECT size,count(*) teams FROM (SELECT count(*) size FROM memberships GROUP BY team_id) GROUP BY size ORDER BY size",
  );
  assert.deepEqual(
    Object.fromEntries(databaseSizes.map((row) => [row.size, row.teams])),
    Object.fromEntries(
      Object.entries(fixture.summary.teamSizeDistribution).filter(
        ([, n]) => n > 0,
      ),
    ),
  );
  report.checks.push({ label: "seeded-database-distribution", databaseSizes });
  report.preparedAt = new Date().toISOString();
  writeFileSync(
    join(output, "prepared.json"),
    JSON.stringify(
      {
        plan,
        artifactBefore,
        checks: report.checks,
        fixtureSetup: report.fixtureSetup,
        preparedAt: report.preparedAt,
        timedHTTPRequests: 0,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    JSON.stringify({
      prepared: true,
      url: base,
      fixture: fixture.summary,
      actualD1: report.checks[0],
      snapshotWorkerSHA: artifactBefore["dist/server/index.js"],
      timedHTTPRequests: 0,
      waiting: process.argv.includes("--hold-after-seed"),
    }),
  );
  if (process.argv.includes("--hold-after-seed")) {
    await new Promise((resolve, reject) => {
      let input = "";
      const closed = () => {
        process.stdin.off("data", receive);
        reject(new Error("Coordination stdin closed before release; use a PTY or rerun only after explicit root release."));
      };
      const receive = (chunk) => {
        input += chunk;
        if (input.includes("RUN_LOAD_300\n")) {
          process.stdin.off("data", receive);
          process.stdin.off("end", closed);
          process.stdin.pause();
          resolve();
        } else if (input.includes("STOP_LOAD_300\n")) {
          process.stdin.off("data", receive);
          process.stdin.off("end", closed);
          process.stdin.pause();
          reject(new Error("Held load cancelled before HTTP workload."));
        }
      };
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", receive);
      process.stdin.once("end", closed);
      process.stdin.resume();
    });
  }
  report.workloadStartedAt = new Date().toISOString();
  workloadTimer = setTimeout(
    () =>
      workloadAbort.abort(
        new Error("Eight-minute bounded workload budget exceeded."),
      ),
    plan.workloadBudgetMs,
  );
  const initial = expectOK(
    await request({
      view: "/projects",
      phase: "precommit-public-empty",
      concurrency: 1,
    }),
  );
  assert.equal(initial.items.length, 0);
  const all = [...states.values()];
  await group(
    "initial-90-leader-commits",
    all,
    8,
    (state, _, phase, concurrency) => commit(state, 1, phase, concurrency),
  );
  await group(
    "identical-initial-retry-90",
    all,
    16,
    async (state, _, phase, concurrency) => {
      const body = expectOK(
        await request({
          identity: leader(state),
          action: "submit-project",
          data: state.requests[0],
          phase,
          concurrency,
        }),
      );
      assert.equal(body.versionId, state.versionId);
    },
  );
  const afterRetry = await counts("first-commit-retries-did-not-consume");
  assert.equal(afterRetry.versions, 90);
  assert.equal(afterRetry.receipts, 90);
  // Four distinct teams exercise identical retries and competing final commits at each bounded level.
  for (const [index, concurrency] of plan.concurrency.entries()) {
    const state = all[index],
      data = {
        revision: 1,
        project: projectPayload(state.team, 2, "same-request-race"),
      },
      versions = new Set();
    await group(
      `same-receipt-race-c${concurrency}`,
      Array.from({ length: Math.max(4, concurrency * 2) }),
      concurrency,
      async (_, __, phase, c) => {
        const body = expectOK(
          await request({
            identity: leader(state),
            action: "submit-project",
            data,
            phase,
            concurrency: c,
          }),
        );
        versions.add(body.versionId);
      },
    );
    assert.equal(versions.size, 1);
    state.requests.push(data);
    state.versionId = [...versions][0];
    state.revision = 2;
    let winners = 0,
      winnerData;
    await group(
      `distinct-final-race-c${concurrency}`,
      Array.from({ length: concurrency }, (_, i) => i),
      concurrency,
      async (variant, _, phase, c) => {
        const candidate = {
          revision: 2,
          project: projectPayload(state.team, 3, `competing-${variant}`),
        };
        const result = await request({
          identity: leader(state),
          action: "submit-project",
          data: candidate,
          phase,
          concurrency: c,
          expectedCodes: [
            "PROJECT_CHANGED_RELOAD",
            "PROJECT_LOCKED_AFTER_THIRD_SUBMISSION",
            "CONFLICT",
          ],
        });
        if (result.status === 200) {
          winners++;
          winnerData = candidate;
          state.versionId = result.body.versionId;
        } else assert(result.expectedRejection);
      },
    );
    assert.equal(winners, 1);
    state.requests.push(winnerData);
    state.revision = 3;
    assert.equal(
      await scalar(
        "SELECT count(*) n FROM submission_versions WHERE team_id=?",
        state.team.id,
      ),
      3,
    );
  }
  const remaining = all.slice(4);
  await group("remaining-second-commits", remaining, 8, (state, _, phase, c) =>
    commit(state, 2, phase, c),
  );
  await group("remaining-third-commits", remaining, 8, (state, _, phase, c) =>
    commit(state, 3, phase, c),
  );
  await group(
    "fourth-commit-rejected-90",
    all,
    16,
    async (state, _, phase, c) => {
      const result = await request({
        identity: leader(state),
        action: "submit-project",
        data: { revision: 3, project: projectPayload(state.team, 4) },
        phase,
        concurrency: c,
        expectedCodes: ["PROJECT_LOCKED_AFTER_THIRD_SUBMISSION"],
      });
      assert.equal(result.status, 409);
      assert.equal(result.code, "PROJECT_LOCKED_AFTER_THIRD_SUBMISSION");
    },
  );
  await group(
    "identical-retry-after-third-90",
    all,
    16,
    async (state, _, phase, c) => {
      const body = expectOK(
        await request({
          identity: leader(state),
          action: "submit-project",
          data: state.requests[2],
          phase,
          concurrency: c,
        }),
      );
      assert.equal(body.versionId, state.versionId);
    },
  );
  const committed = await counts("hard-three-and-idempotent-retries");
  assert.equal(committed.projects, 90);
  assert.equal(committed.versions, 270);
  assert.equal(committed.receipts, 270);
  const hidden = expectOK(
    await request({
      view: "/projects",
      phase: "unverified-projects-hidden",
      concurrency: 1,
    }),
  );
  assert.equal(hidden.items.length, 0);
  await group(
    "explicit-local-fixture-eligibility",
    all,
    4,
    async (state, index, phase, c) => {
      expectOK(
        await request({
          identity: fixture.operations[index % fixture.operations.length],
          action: "set-project-eligibility",
          data: {
            projectId: state.projectId,
            versionId: state.versionId,
            status: "eligible",
            reason:
              "LOCAL SYNTHETIC LOAD FIXTURE ONLY: manual test eligibility; no real repository, GitHub verification or production policy change.",
          },
          phase,
          concurrency: c,
        }),
      );
    },
  );
  await publicPages("paginated-public-after-real-commits");
  // 300 distinct participants total, divided into75-person read cohorts, not300 simultaneous requests.
  for (const [index, concurrency] of plan.concurrency.entries())
    await group(
      `normal-reads-c${concurrency}`,
      fixture.participants.slice(index * 75, index * 75 + 75),
      concurrency,
      async (person, i, phase, c) => {
        const view = [
          "/dashboard",
          "/profile",
          "/discover/teams",
          "/discover/participants",
          "/projects",
        ][i % 5];
        const body = expectOK(
          await request({
            identity: person,
            view,
            page: view === "/projects" ? i % 4 : 0,
            phase,
            concurrency: c,
          }),
        );
        assert.equal(body.me?.id, person.id);
      },
    );
  const votes = fixture.participants.flatMap((person) =>
    [1, 2].map((offset) => ({
      person,
      target: all[(person.teamIndex + offset) % 90],
    })),
  );
  await group(
    "600-distinct-user-project-votes",
    votes,
    16,
    async ({ person, target }, _, phase, c) => {
      expectOK(
        await request({
          identity: person,
          action: "upvote-project",
          data: { projectId: target.projectId },
          phase,
          concurrency: c,
        }),
      );
    },
  );
  await group(
    "300-duplicate-vote-retries",
    fixture.participants,
    16,
    async (person, _, phase, c) => {
      expectOK(
        await request({
          identity: person,
          action: "upvote-project",
          data: { projectId: all[(person.teamIndex + 1) % 90].projectId },
          phase,
          concurrency: c,
        }),
      );
    },
  );
  assert.equal(await scalar("SELECT count(*) n FROM project_upvotes"), 600);
  for (const [index, concurrency] of plan.concurrency.entries()) {
    const person = fixture.participants[index],
      target = all[(person.teamIndex + 1) % 90];
    await group(
      `same-vote-race-c${concurrency}`,
      Array.from({ length: Math.max(4, concurrency * 2) }),
      concurrency,
      async (_, __, phase, c) => {
        expectOK(
          await request({
            identity: person,
            action: "upvote-project",
            data: { projectId: target.projectId },
            phase,
            concurrency: c,
          }),
        );
      },
    );
  }
  assert.equal(await scalar("SELECT count(*) n FROM project_upvotes"), 600);
  const nonleader = fixture.participants.find(
      (person) => fixture.teams[person.teamIndex].leaderId !== person.id,
    ),
    own = all[nonleader.teamIndex];
  const denied = await request({
    identity: nonleader,
    action: "submit-project",
    data: { revision: 3, project: projectPayload(own.team, 4) },
    phase: "nonleader-authorization",
    concurrency: 1,
    expectedCodes: ["LEADER_REQUIRED"],
  });
  assert.equal(denied.status, 403);
  assert.equal(denied.code, "LEADER_REQUIRED");
  await publicPages("pagination-after-votes");
  await group(
    "immutable-history-after-third",
    all.slice(0, 4),
    4,
    async (state, _, phase, c) => {
      const body = expectOK(
        await request({
          identity: leader(state),
          view: "/project-history",
          phase,
          concurrency: c,
        }),
      );
      assert.equal(body.items.length, 3);
      assert.deepEqual(body.items.map((v) => v.attempt).sort(), [1, 2, 3]);
    },
  );
  assert.equal(
    (
      await rows(
        "SELECT project_id,user_id,count(*) n FROM project_upvotes GROUP BY project_id,user_id HAVING count(*)>1",
      )
    ).length,
    0,
  );
  assert.equal((await rows("PRAGMA foreign_key_check")).length, 0);
  const final = await counts("final-integrity");
  assert.equal(final.versions, 270);
  assert.equal(final.receipts, 270);
  assert.equal(final.upvotes, 600);
  assert.equal(report.blockedOutbound.length, 0);
  assert.equal(report.samples.filter((s) => s.unexpectedError).length, 0);
  assert.equal(report.samples.length, plan.plannedRequests);
  assert.equal(report.samples.filter((s) => s.method === "GET").length, plan.plannedGET);
  assert.equal(report.samples.filter((s) => s.method === "POST").length, plan.plannedPOST);
  assert.equal(report.samples.filter((s) => s.expectedRejection).length, 116);
  report.checks.push({
    label: "unique-user-project/foreign-keys/AI-inactive",
    duplicateVoteRows: 0,
    foreignKeyViolations: 0,
    externalCallsAttempted: 0,
    evaluationRuns: 0,
    astraJobs: 0,
  });
} catch (error) {
  report.failure = error.stack || String(error);
  if (db) {
    try {
      await counts("failure-observed-counts");
    } catch (readError) {
      report.failureCountReadError = readError.message;
    }
  }
  process.exitCode = 1;
} finally {
  try {
    report.artifactAfter = fingerprint(snapshotRoot);
    report.sourceArtifactAfter = fingerprint();
    report.sourceArtifactChangedAfterSnapshot =
      JSON.stringify(sourceArtifactBefore) !==
      JSON.stringify(report.sourceArtifactAfter);
    report.artifactChangedDuringRun =
      JSON.stringify(artifactBefore) !== JSON.stringify(report.artifactAfter);
    if (report.artifactChangedDuringRun) {
      report.failure ||=
        "Compiled artifact changed during run; observations do not represent one build.";
      process.exitCode = 1;
    }
  } catch (error) {
    report.failure ||= error.message;
    process.exitCode = 1;
  }
  if (workloadTimer) clearTimeout(workloadTimer);
  report.totals = {
    requests: report.samples.length,
    GET: report.samples.filter((s) => s.method === "GET").length,
    POST: report.samples.filter((s) => s.method === "POST").length,
    expectedRejections: report.samples.filter((s) => s.expectedRejection)
      .length,
    unexpectedErrors: report.samples.filter((s) => s.unexpectedError).length,
  };
  report.finishedAt = new Date().toISOString();
  writeFileSync(
    join(output, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  if (mf) await mf.dispose();
  rmSync(temporary, { recursive: true, force: true });
  console.log(
    JSON.stringify({
      report: join(output, "report.json"),
      failed: !!report.failure,
      totals: report.totals,
    }),
  );
}
