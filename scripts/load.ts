import { createServer } from "node:http";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Worker } from "node:worker_threads";
import assert from "node:assert/strict";
import { setup, activate, submission } from "../tests/helpers";
import { batch, one, rows, type SQL } from "../lib/db";
import { PortalService } from "../lib/service";
import { LOCAL_CREDIT_KEY } from "./fixtures";
import type { Identity } from "../lib/identity";
const directory = mkdtempSync(join(tmpdir(), "devday-race-"));
const path = join(directory, "rehearsal.sqlite");
const { db, service, clock } = await setup(path);
const identities: Identity[] = Array.from({ length: 200 }, (_, i) => ({
  id: "load_" + i,
  email: `load${i}@portal.test`,
  name: "FAKE " + i,
  source: "local-test",
}));
for (const i of identities)
  await batch(db, [
    [
      "INSERT INTO users VALUES(?,?,?,?,?)",
      i.id,
      i.email,
      i.name,
      "participant",
      "2026-10-22T08:00:00.000Z",
    ],
    ["INSERT INTO registrations VALUES(?,'approved',1)", i.email],
    ["INSERT INTO profiles(user_id) VALUES(?)", i.id],
  ]);
await activate(db);
for (let i = 0; i < 8; i++)
  await batch(db, [
    [
      "INSERT INTO teams VALUES(?,?,?,?,?)",
      "load_team" + i,
      "Load team " + i,
      "load_" + i,
      "FAKE",
      "2026-10-22T08:00:00.000Z",
    ],
    [
      "INSERT INTO memberships VALUES(?,?,?)",
      "load_" + i,
      "load_team" + i,
      "2026-10-22T08:00:00.000Z",
    ],
    [
      "INSERT INTO ideas VALUES(?,?,?,?,?,?)",
      "load_team" + i,
      "FAKE",
      "FAKE core",
      "FAKE description",
      "hash",
      "2026-10-22T08:00:00.000Z",
    ],
  ]);
let now = "2026-11-01T06:00:00.000Z";
const server = createServer(async (req, res) => {
  try {
    const actor = Number(req.headers["x-local-load-session"]);
    if (!Number.isInteger(actor) || actor < 0 || actor >= 200) {
      res.writeHead(403);
      res.end();
      return;
    }
    const svc = new PortalService(
      db,
      identities[actor],
      LOCAL_CREDIT_KEY,
      () => now,
    );
    let result;
    if (req.method === "GET") result = await svc.view("/dashboard");
    else {
      let body = "";
      for await (const chunk of req) body += chunk;
      const input = JSON.parse(body);
      result = await svc.command(input.action, input.data);
    }
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    });
    res.end(JSON.stringify(result));
  } catch (e) {
    res.writeHead(409);
    res.end(JSON.stringify({ error: (e as Error).message }));
  }
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address() as { port: number };
const url = `http://127.0.0.1:${address.port}`;
const measurements: Record<string, unknown> = {
  scope:
    "LOCAL ONLY: 200 distinct synthetic sessions over loopback HTTP, SQLite WAL; not hosted Sites capacity or ChatGPT sign-in proof",
};
try {
  const durations: number[] = [];
  const start = performance.now();
  const reads = await Promise.all(
    identities.map(async (_, i) => {
      const t = performance.now();
      const response = await fetch(url, {
        headers: { "x-local-load-session": String(i) },
      });
      await response.text();
      durations.push(performance.now() - t);
      return response.status;
    }),
  );
  durations.sort((a, b) => a - b);
  assert(reads.every((s) => s === 200));
  measurements.reads = {
    sessions: 200,
    success: reads.length,
    wallMs: Math.round(performance.now() - start),
    p50Ms: Math.round(durations[100]),
    p95Ms: Math.round(durations[190]),
  };
  const submissions = await Promise.all(
    Array.from({ length: 20 }, () =>
      fetch(url, {
        method: "POST",
        headers: { "x-local-load-session": "0" },
        body: JSON.stringify({
          action: "submit",
          data: {
            ...submission,
            contributions: [{ userId: "load_0", role: "FAKE", codex: "FAKE" }],
          },
        }),
      }),
    ),
  );
  assert.equal(submissions.filter((s) => s.ok).length, 3);
  measurements.submissions = { concurrent: 20, committed: 3, rejected: 17 };
  for (let i = 1; i < 8; i++)
    await new PortalService(
      db,
      identities[i],
      LOCAL_CREDIT_KEY,
      () => now,
    ).command("submit", {
      ...submission,
      contributions: [{ userId: "load_" + i, role: "FAKE", codex: "FAKE" }],
    });
  clock(now);
  const checks = await Promise.all(
    Array.from({ length: 40 }, (_, i) =>
      service("admin").command("check-in", {
        userId: "load_" + i,
        reason: "FAKE concurrent physical check-in",
      }),
    ),
  );
  assert.equal(checks.length, 40);
  const allocation = await one<{ n: number; distinct_n: number }>(
    db,
    "SELECT count(*) n,count(DISTINCT inventory_id) distinct_n FROM credit_allocations",
  );
  assert.equal(allocation!.n, 20);
  assert.equal(allocation!.distinct_n, 20);
  measurements.checkins = {
    concurrent: 40,
    checkedIn: 40,
    allocated: 20,
    pending: 20,
    duplicateCredits: 0,
  };
  now = "2026-11-01T11:00:00.000Z";
  const votes = await Promise.all(
    Array.from({ length: 14 }, (_, i) =>
      fetch(url, {
        method: "POST",
        headers: { "x-local-load-session": "10" },
        body: JSON.stringify({
          action: "vote",
          data: { teamId: "load_team" + (i % 8) },
        }),
      }),
    ),
  );
  assert.equal(votes.filter((r) => r.ok).length, 3);
  measurements.votes = { concurrent: 14, committed: 3, rejected: 11 };
  // Six actual worker threads contend for the final team spot in one WAL database.
  const fixedTime = "2026-10-22T08:00:00.000Z";
  for (const i of [20, 21, 22])
    await batch(db, [
      [
        "INSERT INTO memberships VALUES(?,?,?)",
        "load_" + i,
        "load_team7",
        fixedTime,
      ],
    ]);
  const workers = Array.from(
    { length: 6 },
    (_, workerIndex) =>
      new Worker(new URL("./race-worker.mjs", import.meta.url), {
        workerData: {
          path,
          operations: Array.from({ length: 4 }, (_, n) => [
            [
              "INSERT INTO memberships VALUES(?,?,?)",
              "load_" + (30 + workerIndex * 4 + n),
              "load_team7",
              fixedTime,
            ],
          ]),
        },
      }),
  );
  const exits = workers.map(
    (w) => new Promise<void>((resolve) => w.once("exit", () => resolve())),
  );
  await Promise.all(
    workers.map(
      (w) => new Promise<void>((resolve) => w.once("message", () => resolve())),
    ),
  );
  const completed = workers.map(
    (w) =>
      new Promise<{ outcomes: boolean[] }>((resolve) =>
        w.once("message", resolve),
      ),
  );
  workers.forEach((w) => w.postMessage("go"));
  const result = await Promise.all(completed);
  assert.equal(result.flatMap((r) => r.outcomes).filter(Boolean).length, 1);
  assert.equal(
    (await one<{ n: number }>(
      db,
      "SELECT count(*) n FROM memberships WHERE team_id='load_team7'",
    ))!.n,
    5,
  );
  await Promise.all(exits);
  measurements.membershipRace = {
    workerThreads: 6,
    contenders: 24,
    accepted: 1,
    finalSize: 5,
  };
  measurements.integrity = {
    foreignKeyViolations: db.raw.prepare("PRAGMA foreign_key_check").all()
      .length,
    sqliteIntegrity: db.raw.prepare("PRAGMA integrity_check").get(),
  };
  assert.equal(
    (measurements.integrity as { foreignKeyViolations: number })
      .foreignKeyViolations,
    0,
  );
  writeFileSync(
    "evidence/load-results.json",
    JSON.stringify(measurements, null, 2) + "\n",
  );
  console.log(JSON.stringify(measurements, null, 2));
} finally {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  db.close();
  rmSync(directory, { recursive: true, force: true });
}
