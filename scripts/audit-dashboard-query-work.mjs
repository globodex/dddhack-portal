// Read-only production-source audit. The only database is a new in-memory
// synthetic SQLite fixture. No server, provider, real cookie or credential.
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const baseline = resolve(process.argv[2] || "/workspace/ddd-landing-baseline");
const final = resolve(fileURLToPath(new URL("../", import.meta.url)));
const output = resolve(process.argv[3] || "evidence/dashboard-performance-source/query-work.json");
const source = (directory) => execFileSync("git", ["rev-parse", "HEAD"], { cwd: directory, encoding: "utf8" }).trim();
if (source(baseline) !== "696b125f9711a4fd6e02c3ece3adadb18b83cba7")
  throw new Error("BASELINE_SOURCE_MISMATCH");
const moduleAt = (directory, path) => import(pathToFileURL(resolve(directory, path)).href);
let externalCalls = 0;
const previousFetch = globalThis.fetch;
globalThis.fetch = async () => { externalCalls++; throw new Error("OUTBOUND_DISABLED_IN_SOURCE_AUDIT"); };

const { LocalDatabase } = await moduleAt(final, "lib/local-test/sqlite.ts");
const { seedLocal, fixtures, LOCAL_CREDIT_KEY } = await moduleAt(final, "scripts/fixtures.ts");
const { seedRichVisual, seedMockupReview } = await moduleAt(final, "scripts/visual-rich-fixtures.ts");
const db = new LocalDatabase(":memory:");
try {
  db.migrate();
  await seedLocal(db);
  await seedRichVisual(db);
  await seedMockupReview(db);
  let trace = [], directReads = 0, batches = 0;
  const prepare = db.prepare.bind(db);
  const batch = db.batch.bind(db);
  db.prepare = (sql) => {
    const statement = prepare(sql);
    const all = statement.all.bind(statement), execute = statement.execute.bind(statement);
    statement.all = async () => { directReads++; trace.push(sql.replace(/\s+/g, " ").trim()); return all(); };
    statement.execute = () => { trace.push(sql.replace(/\s+/g, " ").trim()); return execute(); };
    return statement;
  };
  db.batch = async (statements) => { batches++; return batch(statements); };
  const observations = [];
  for (const [label, directory] of [["baseline", baseline], ["final", final]]) {
    const { PortalService } = await moduleAt(directory, "lib/service.ts");
    trace = []; directReads = 0; batches = 0;
    const service = new PortalService(db, fixtures.alice, LOCAL_CREDIT_KEY);
    const calls = { actor: 0, settings: 0 };
    for (const name of Object.keys(calls)) {
      const method = service[name].bind(service);
      service[name] = (...args) => { calls[name]++; return method(...args); };
    }
    const view = await service.view("/dashboard");
    const frequencies = Object.entries(trace.reduce((counts, sql) => ({ ...counts, [sql]: (counts[sql] || 0) + 1 }), {}))
      .map(([sql, count]) => ({ sql, count })).sort((a, b) => b.count - a.count || a.sql.localeCompare(b.sql));
    observations.push({ label, source: source(directory), fixture: { teamMembers: view.members.length, committedAttempts: view.attempts.length, personallyCheckedIn: view.checkedIn, creditCategories: view.credits.length, projectPresent: !!view.project }, calls, statements: trace.length, directStatementExecutions: directReads, explicitBatches: batches, statementFrequencies: frequencies, statementSequence: trace });
  }
  const report = { checkedAt: new Date().toISOString(), syntheticOnly: true, outboundRequests: externalCalls, observations, limits: ["Counts, not a timing benchmark or a production TTFB/FCP measurement.", "One matched in-memory SQLite fixture. Both service versions use the same populated data and schema; no native PostgreSQL network/transaction latency is measured.", "Counts application SQL statements, excluding internal SQLite trigger statements, changes() bookkeeping, BEGIN/COMMIT, and backend session authentication.", "No production source edits, hosted database, browser, real auth or provider changes."] };
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(observations.map(({ label, source, fixture, calls, statements, directStatementExecutions, explicitBatches }) => ({ label, source, fixture, calls, statements, directStatementExecutions, explicitBatches })), null, 2));
} finally {
  db.close();
  globalThis.fetch = previousFetch;
}
