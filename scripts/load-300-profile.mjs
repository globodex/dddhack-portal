// Local diagnostic D1 attribution. No application/source/schema edits.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  cpSync,
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
const routes = [
  "/dashboard",
  "/discover/teams",
  "/discover/participants",
  "/projects",
  "/admin/participants",
  "/admin/teams",
  "/admin/submissions",
];
const plan = {
  base,
  routes,
  concurrency: [1, 16],
  readsPerRoutePerLevel: 16,
  plannedGET: 224,
  timeoutMs: 20000,
  budgetMs: 480000,
  postRequests: 0,
  timings:
    "Instrumented local diagnostic; competing root browser/build work may run. Not an exclusive baseline or hosted capacity.",
  fixture:
    "300 participants/90 teams; 270 versions/90 eligible projects/600 votes seeded offline solely for read attribution, not new HTTP commit throughput evidence.",
};
if (!process.argv.includes("--artifact-ready")) {
  console.log(JSON.stringify({ launch: false, plan }, null, 2));
  process.exit(0);
}
const hash = (x) => createHash("sha256").update(x).digest("hex");
const workerHash = hash(
  readFileSync(join(artifactRoot, "dist/server/index.js")),
);
assert.equal(
  workerHash,
  "75a667d2c42a821611c3cbbea72447ee464e2ad5f2f6165fbbba647764e69ce6",
);
const temp = mkdtempSync(join(tmpdir(), "ddehack-load-300-profile-"));
const snapshot = join(temp, "artifact");
mkdirSync(snapshot);
cpSync(join(artifactRoot, "dist"), join(snapshot, "dist"), { recursive: true });
cpSync(join(artifactRoot, "drizzle"), join(snapshot, "drizzle"), {
  recursive: true,
});
assert.equal(
  hash(readFileSync(join(snapshot, "dist/server/index.js"))),
  workerHash,
);
const report = {
  plan,
  workerHash,
  sourceRevision: "0e7756c60e2fff88a4f7fb1e3eca31efc20349d0",
  startedAt: new Date().toISOString(),
  fixture: fixture.summary,
  samples: [],
  groups: [],
  blockedOutbound: [],
  failure: null,
};
const metrics = new Map();
let mf,
  db,
  sequence = 0,
  timer;
let stopAfterRoute = false;
process.on("SIGINT", () => {
  stopAfterRoute = true;
});
process.on("SIGTERM", () => {
  stopAfterRoute = true;
});
const abort = new AbortController();
const out = join(
  ownRoot,
  "outputs/load-300",
  `profile-${new Date().toISOString().replaceAll(":", "-")}-${process.pid}`,
);
mkdirSync(out, { recursive: true });
const pct = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)] ?? null;
};
async function sqlBatch(stmts) {
  for (let i = 0; i < stmts.length; i += 30)
    await db.batch(
      stmts
        .slice(i, i + 30)
        .map(([sql, ...binds]) => db.prepare(sql).bind(...binds)),
    );
}
async function seedReadState() {
  const at = new Date().toISOString();
  await sqlBatch(
    fixture.teams.map((t) => [
      "INSERT INTO projects(id,team_id,slug,draft,revision,updated_at) VALUES(?,?,?,?,3,?)",
      `load300_project_${t.index}`,
      t.id,
      `load300-project-${t.index}`,
      JSON.stringify(projectPayload(t, 3)),
      at,
    ]),
  );
  await sqlBatch(
    fixture.teams.flatMap((t) =>
      [1, 2, 3].map((n) => [
        "INSERT INTO submission_versions(id,team_id,attempt,payload,created_at) VALUES(?,?,?,?,?)",
        `load300_version_${t.index}_${n}`,
        t.id,
        n,
        JSON.stringify(projectPayload(t, n)),
        at,
      ]),
    ),
  );
  await sqlBatch(
    fixture.teams.flatMap((t) => [
      [
        "UPDATE projects SET published_version_id=? WHERE id=?",
        `load300_version_${t.index}_3`,
        `load300_project_${t.index}`,
      ],
      [
        "INSERT INTO project_eligibility(project_id,version_id,status,reason,decided_by,updated_at) VALUES(?,?,'eligible',?,?,?)",
        `load300_project_${t.index}`,
        `load300_version_${t.index}_3`,
        "LOCAL SYNTHETIC READ PROFILE ONLY; no repository verification or production policy",
        fixture.operations[0].id,
        at,
      ],
    ]),
  );
  await sqlBatch(
    fixture.participants.flatMap((p) =>
      [1, 2].map((offset) => [
        "INSERT INTO project_upvotes(project_id,user_id,created_at) VALUES(?,?,?)",
        `load300_project_${(p.teamIndex + offset) % 90}`,
        p.id,
        at,
      ]),
    ),
  );
  const actual = {};
  for (const table of [
    "users",
    "teams",
    "memberships",
    "projects",
    "submission_versions",
    "project_upvotes",
  ])
    actual[table] = Number(
      (await db.prepare(`SELECT count(*) n FROM ${table}`).first()).n,
    );
  assert.deepEqual(actual, {
    users: 302,
    teams: 90,
    memberships: 300,
    projects: 90,
    submission_versions: 270,
    project_upvotes: 600,
  });
  assert.equal(
    (await db.prepare("PRAGMA foreign_key_check").all()).results.length,
    0,
  );
  report.seededActual = actual;
}
async function read(route, c, i) {
  const caseId = `case-${sequence++}`;
  const person = route.startsWith("/admin")
    ? fixture.operations[i % 2]
    : fixture.participants[i];
  const url = new URL("/api/portal", base);
  url.searchParams.set("view", route);
  url.searchParams.set("page", String(route === "/projects" ? i % 4 : 0));
  const start = performance.now();
  let status = null,
    bytes = null,
    error = null;
  try {
    const response = await fetch(url, {
      redirect: "error",
      headers: {
        accept: "application/json",
        "x-load-profile-case": caseId,
        "oai-authenticated-user-id": person.id,
        "oai-authenticated-user-email": person.email,
        "oai-authenticated-user-full-name": person.name,
      },
      signal: AbortSignal.any([
        AbortSignal.timeout(plan.timeoutMs),
        abort.signal,
      ]),
    });
    status = response.status;
    const buffer = await response.arrayBuffer();
    bytes = buffer.byteLength;
    assert.equal(status, 200, `Profile ${route} status ${status}`);
    const body = JSON.parse(new TextDecoder().decode(buffer));
    assert.equal(body.me?.id, person.id);
    assert(metrics.has(caseId), "Missing D1 adapter metrics");
  } catch (e) {
    error = e.name + ": " + e.message;
  }
  const profile = metrics.get(caseId);
  const sample = {
    caseId,
    route,
    concurrency: c,
    status,
    responseBytes: bytes,
    elapsedMs: performance.now() - start,
    error,
    ...profile,
  };
  report.samples.push(sample);
  if (error) throw new Error(error);
}
try {
  process.env.CLOUDFLARE_CF_FETCH_ENABLED = "false";
  process.env.WRANGLER_SEND_METRICS = "false";
  const { Miniflare } = await import(
    pathToFileURL(
      join(artifactRoot, "node_modules/miniflare/dist/src/index.js"),
    ).href
  );
  const { draftPolicy } = await import(
    pathToFileURL(join(artifactRoot, "lib/policy.ts")).href
  );
  const serverRoot = join(snapshot, "dist/server"),
    modules = [];
  function collect(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) collect(p);
      else if (/\.m?js$/.test(entry.name))
        modules.push({ type: "ESModule", path: p });
    }
  }
  collect(serverRoot);
  modules.push({
    type: "ESModule",
    path: join(serverRoot, "load-300-profile-normalize.mjs"),
    contents: readFileSync(
      join(ownRoot, "scripts/load-300-profile-normalize.mjs"),
      "utf8",
    ),
  });
  modules.unshift({
    type: "ESModule",
    path: join(serverRoot, "load-300-profile-entry.js"),
    contents: readFileSync(
      join(ownRoot, "scripts/load-300-profile-worker.mjs"),
      "utf8",
    ),
  });
  const config = JSON.parse(
    readFileSync(join(serverRoot, "wrangler.json"), "utf8"),
  );
  mf = new Miniflare({
    name: "ddehack-local-read-profile",
    modules,
    modulesRoot: serverRoot,
    compatibilityDate: config.compatibility_date,
    compatibilityFlags: config.compatibility_flags,
    host: "127.0.0.1",
    port: 4183,
    inspectorPort: 0,
    d1Databases: { DB: "ddehack-load-300-read-profile" },
    d1Persist: join(temp, "d1"),
    bindings: { PORTAL_RUNTIME: "sites", PORTAL_TRUST_SITES_DISPATCH: "true" },
    assets: {
      directory: join(snapshot, "dist/client"),
      binding: "ASSETS",
      routerConfig: {
        has_user_worker: true,
        invoke_user_worker_ahead_of_assets: true,
      },
    },
    serviceBindings: {
      PROFILE_METRICS: async (request) => {
        const data = await request.json();
        assert(/^case-\d+$/.test(data.caseId));
        metrics.set(data.caseId, data);
        return new Response(null, { status: 204 });
      },
    },
    outboundService: async (request) => {
      report.blockedOutbound.push({ method: request.method });
      return new Response("External requests blocked", { status: 503 });
    },
  });
  await mf.ready;
  db = await mf.getD1Database("DB");
  for (const file of readdirSync(join(snapshot, "drizzle"))
    .filter((f) => f.endsWith(".sql"))
    .sort())
    for (const sql of readFileSync(join(snapshot, "drizzle", file), "utf8")
      .split("--> statement-breakpoint")
      .filter((s) => s.trim()))
      await db.prepare(sql).all();
  await seedLoad300(db, fixture, draftPolicy);
  await seedReadState();
  report.workloadStartedAt = new Date().toISOString();
  timer = setTimeout(
    () => abort.abort(new Error("Eight-minute profile budget exceeded")),
    plan.budgetMs,
  );
  console.log(
    JSON.stringify({ prepared: true, plan, actual: report.seededActual }),
  );
  profileLoop: for (const c of plan.concurrency)
    for (const route of routes) {
      const from = report.samples.length,
        start = performance.now();
      let cursor = 0,
        firstError;
      await Promise.all(
        Array.from({ length: c }, async () => {
          while (!firstError && cursor < plan.readsPerRoutePerLevel) {
            const i = cursor++;
            try {
              await read(route, c, i);
            } catch (e) {
              firstError ||= e;
            }
          }
        }),
      );
      const samples = report.samples.slice(from),
        templates = new Map();
      for (const sample of samples)
        for (const call of sample.calls || [])
          for (const template of call.templates) {
            const entry = templates.get(template) || {
              template,
              count: 0,
              totalElapsedMs: 0,
              totalEngineMs: 0,
              rowsRead: 0,
              rowsWritten: 0,
            };
            entry.count++;
            entry.totalElapsedMs += call.elapsedMs / call.templates.length;
            entry.totalEngineMs += call.engineMs / call.templates.length;
            entry.rowsRead += call.rowsRead / call.templates.length;
            entry.rowsWritten += call.rowsWritten / call.templates.length;
            templates.set(template, entry);
          }
      const group = {
        route,
        concurrency: c,
        requests: samples.length,
        wallMs: performance.now() - start,
        p50Ms: pct(
          samples.map((s) => s.elapsedMs),
          0.5,
        ),
        p95Ms: pct(
          samples.map((s) => s.elapsedMs),
          0.95,
        ),
        errors: samples.filter((s) => s.error).length,
        queryCountPerRequest: samples.map((s) =>
          s.calls ? s.calls.reduce((n, x) => n + x.templates.length, 0) : null,
        ),
        d1CallsPerRequest: samples.map((s) => s.calls?.length ?? null),
        templates: [...templates.values()].sort((a, b) => b.count - a.count),
      };
      report.groups.push(group);
      console.log(
        JSON.stringify({ ...group, templates: group.templates.slice(0, 3) }),
      );
      if (firstError) throw firstError;
      if (stopAfterRoute) break profileLoop;
    }
  report.stoppedAfterRoute = stopAfterRoute;
  if (!stopAfterRoute) assert.equal(report.samples.length, plan.plannedGET);
  assert.equal(report.blockedOutbound.length, 0);
  assert.equal(
    hash(readFileSync(join(snapshot, "dist/server/index.js"))),
    workerHash,
  );
} catch (error) {
  report.failure = error.stack || String(error);
  process.exitCode = 1;
} finally {
  if (timer) clearTimeout(timer);
  report.finishedAt = new Date().toISOString();
  report.totalGET = report.samples.length;
  report.errors = report.samples.filter((s) => s.error).length;
  writeFileSync(
    join(out, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  if (mf) await mf.dispose();
  rmSync(temp, { recursive: true, force: true });
  console.log(
    JSON.stringify({
      report: join(out, "report.json"),
      failed: !!report.failure,
      GET: report.totalGET,
      errors: report.errors,
    }),
  );
}
