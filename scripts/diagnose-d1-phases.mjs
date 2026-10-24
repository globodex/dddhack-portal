import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

// Diagnostic copies only. This tool never changes the tracked test or its deadline.
const [checkoutArg, outputArg] = process.argv.slice(2);
if (!checkoutArg || !outputArg)
  throw new Error("Expected checkout and output paths");
const checkout = resolve(checkoutArg),
  output = resolve(outputArg);
const sourcePath = resolve(checkout, "tests/d1.test.ts");
const original = readFileSync(sourcePath, "utf8");
const originalTimeoutMs = Number(original.match(/\{ timeout: (\d+) \}/)?.[1]);
if (![30000, 120000].includes(originalTimeoutMs))
  throw new Error("Unexpected integration deadline");
const sha = (s) => createHash("sha256").update(s).digest("hex");
let code = original;
function replace(before, after) {
  if (code.split(before).length !== 2)
    throw new Error("Diagnostic anchor mismatch");
  code = code.replace(before, after);
}
for (const path of [
  "./helpers",
  "../scripts/fixtures",
  "../lib/service",
  "../lib/db",
])
  code = code.replaceAll(
    '"' + path + '"',
    JSON.stringify(resolve(checkout, "tests", path)),
  );
replace(`{ timeout: ${originalTimeoutMs} }`, "{ timeout: 120000 }");
replace(
  'new URL("../db/migrations/", import.meta.url)',
  JSON.stringify(resolve(checkout, "db/migrations")),
);
replace(
  'readFileSync(new URL(n, directory), "utf8")',
  'readFileSync(directory + "/" + n, "utf8")',
);
replace(
  "async () => {\n    const mf",
  "async () => {\n    const diag = diagnostic();\n    const mf",
);
replace(
  'const db: Database = await mf.getD1Database("DB");',
  'const native = await mf.getD1Database("DB");\n      diag.mark("miniflare-binding");\n      const db: Database = diag.wrap(native);',
);
replace(
  'let buffer = "";',
  `const migrationFiles = readdirSync(directory).filter(n => n.endsWith(".sql")).sort();
      const migrationEnds = migrationFiles.map(n => [n, readFileSync(directory + "/" + n, "utf8").split("\\n").length] as const);
      let migrationIndex = 0, migrationLine = 0;
      let buffer = "";`,
);
replace(
  'for (const line of sql.split("\\n")) {',
  `for (const line of sql.split("\\n")) {
        if (migrationIndex < migrationEnds.length && migrationLine++ === migrationEnds[migrationIndex][1]) {
          diag.mark("migration:" + migrationEnds[migrationIndex][0]);
          migrationIndex++; migrationLine = 1;
        }`,
);
replace(
  'assert.equal(buffer.trim(), "");',
  'assert.equal(buffer.trim(), "");\n      diag.mark("migration:" + migrationEnds.at(-1)![0]);',
);
replace(
  "await seedLocal(db);",
  'await seedLocal(db);\n      diag.mark("seed");',
);
replace(
  "const roster =",
  'diag.mark("settings-and-owner-view");\n      const roster =',
);
replace(
  'await admin.command("commit-import", {',
  'diag.mark("roster-preview-200");\n      await admin.command("commit-import", {',
);
replace(
  "assert.equal(\n        (\n          await rows(",
  'diag.mark("roster-commit-200");\n      assert.equal(\n        (\n          await rows(',
);
replace(
  "await Promise.all(\n        Array.from({ length: 12 }",
  'diag.mark("roster-count-assertion");\n      await Promise.all(\n        Array.from({ length: 12 }',
);
replace(
  'assert.equal(\n        (await rows(db, "SELECT * FROM credit_allocations"))',
  'diag.mark("check-in-12-concurrent");\n      assert.equal(\n        (await rows(db, "SELECT * FROM credit_allocations"))',
);
replace(
  "await assert.rejects(",
  'diag.mark("allocation-count-assertion");\n      await assert.rejects(',
);
replace(
  'await batch(db, [\n        [\n          "UPDATE event_settings SET policy=?,active=0 WHERE id=1",\n          JSON.stringify(rehearsalPolicy)',
  'diag.mark("batch-rollback-and-assertion");\n      await batch(db, [\n        [\n          "UPDATE event_settings SET policy=?,active=0 WHERE id=1",\n          JSON.stringify(rehearsalPolicy)',
);
replace(
  "const outcomes =",
  'diag.mark("submission-setup");\n      const outcomes =',
);
replace(
  "assert.equal(outcomes.filter",
  'diag.mark("submit-10-concurrent");\n      assert.equal(outcomes.filter',
);
replace(
  "} finally {\n      await mf.dispose();",
  '} finally {\n      diag.mark("final-count-assertions");\n      await mf.dispose();\n      diag.mark("dispose");\n      console.log("D1_DIAGNOSTIC " + JSON.stringify(diag.report()));',
);
const helper = `
function diagnostic() {
  const start = performance.now(); let previous = start;
  let rpc = 0, statements = 0, oldRpc = 0, oldStatements = 0;
  let previousCpu = process.cpuUsage();
  const phases: any[] = [], groups = new Map<string, any>();
  const stats = new Map<any, { raw: any, kind: string }>();
  const kind = (sql: string) => sql.includes("SELECT email FROM registrations WHERE email=? UNION SELECT email FROM luma_roster WHERE email=?") ? "registered-or-luma" : sql.trim() === "SELECT email FROM luma_roster WHERE email=?" ? "luma-only" : sql.trim().split(/\\s+/, 2).join(" ");
  const record = async (k: string, count: number, work: () => Promise<any>) => {
    rpc++; statements += count; const t = performance.now();
    try { return await work(); } finally {
      const item = groups.get(k) || { rpc: 0, statements: 0, elapsedMs: 0 };
      item.rpc++; item.statements += count; item.elapsedMs += performance.now() - t; groups.set(k, item);
    }
  };
  function wrapStatement(raw: any, k: string): any {
    const wrapped = { bind(...args: any[]) { return wrapStatement(raw.bind(...args), k); }, all() { return record(k, 1, () => raw.all()); } };
    stats.set(wrapped, { raw, kind: k }); return wrapped;
  }
  return {
    wrap(db: any) { return { prepare(sql: string) { return wrapStatement(db.prepare(sql), kind(sql)); }, batch(items: any[]) { return record("BATCH", items.length, () => db.batch(items.map(item => stats.get(item)!.raw))); } }; },
    mark(name: string) { const current = performance.now(), cpu = process.cpuUsage(); const item = { phase: name, wallMs: current - previous, elapsedMs: current - start, rpc: rpc - oldRpc, statements: statements - oldStatements, nodeCpuMs: (cpu.user - previousCpu.user + cpu.system - previousCpu.system) / 1000 }; phases.push(item); console.log("D1_PHASE " + JSON.stringify(item)); previous = current; oldRpc = rpc; oldStatements = statements; previousCpu = cpu; },
    report() { return { phases, rpc, statements, wallMs: performance.now() - start, groups: Object.fromEntries(groups) }; }
  };
}
`;
code = helper + code;
const assertions = (s) => s.match(/assert\.(?:equal|rejects)\(/g)?.length || 0;
if (assertions(original) !== assertions(code))
  throw new Error("Assertion count changed");
mkdirSync(resolve(checkout, ".local/d1-diagnostics"), { recursive: true });
mkdirSync(output, { recursive: true });
const generated = resolve(checkout, ".local/d1-diagnostics/d1-phase.test.ts");
writeFileSync(generated, code);
writeFileSync(resolve(output, "diagnostic-copy.test.ts.txt"), code);
const commit = spawnSync("git", ["rev-parse", "HEAD"], {
  cwd: checkout,
  encoding: "utf8",
}).stdout.trim();
const started = new Date().toISOString();
const environment = () =>
  Object.fromEntries(
    [
      "/sys/fs/cgroup/cpu.max",
      "/sys/fs/cgroup/cpu.stat",
      "/sys/fs/cgroup/memory.current",
      "/sys/fs/cgroup/memory.max",
      "/sys/fs/cgroup/memory.events",
      "/sys/fs/cgroup/memory.pressure",
      "/sys/fs/cgroup/pids.current",
      "/proc/loadavg",
    ].map((path) => {
      try {
        return [path, readFileSync(path, "utf8").trim()];
      } catch {
        return [path, null];
      }
    }),
  );
const environmentBefore = environment();
const result = spawnSync(
  process.execPath,
  ["--import", "tsx", "--test", "--test-concurrency=1", generated],
  {
    cwd: checkout,
    encoding: "utf8",
    timeout: 150000,
    maxBuffer: 4 * 1024 * 1024,
  },
);
const log = (result.stdout || "") + (result.stderr || "");
writeFileSync(resolve(output, "run.log"), log);
const match = log.match(/D1_DIAGNOSTIC (\{.*\})/);
const report = {
  commit,
  started,
  completed: new Date().toISOString(),
  environmentBefore,
  environmentAfter: environment(),
  originalSha256: sha(original),
  originalTimeoutMs,
  diagnosticTimeoutMs: 120000,
  assertionCount: assertions(original),
  generatedSha256: sha(code),
  exitStatus: result.status,
  signal: result.signal,
  spawnError: result.error?.name,
  measurements: match ? JSON.parse(match[1]) : null,
  originalUnchanged: readFileSync(sourcePath, "utf8") === original,
  limitations: [
    "One diagnostic run; not a stable latency estimate",
    "120-second deadline is set in the generated ignored diagnostic copy; this script never changes the tracked deadline",
    "No application changes",
    "Synthetic disposable Miniflare D1 only; no hosted database",
    "Statement wrapper and phase logging add small identical diagnostic overhead",
  ],
};
writeFileSync(
  resolve(output, "report.json"),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    commit,
    exitStatus: result.status,
    wallMs: report.measurements?.wallMs,
    rpc: report.measurements?.rpc,
    statements: report.measurements?.statements,
    originalUnchanged: report.originalUnchanged,
  }),
);
process.exitCode = result.status || (result.signal ? 1 : 0);
