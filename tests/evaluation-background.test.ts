import { test } from "node:test";
import assert from "node:assert/strict";
import { setup, activate, attend, submission } from "./helpers";
import { queueEvaluations } from "../lib/evaluation-background";
import { one, rows, batch } from "../lib/db";
import { handlePortal } from "../lib/http";
import { fixtures } from "../scripts/fixtures";

async function submitted() {
  const f = await setup();
  await activate(f.db);
  await attend(f.db, "fake_alice");
  f.clock("2026-11-01T06:00:00.000Z");
  await f.service().command("submit", submission);
  return f;
}
test("provider processing requires an explicit single-job request and retains an unscored human-review report", async () => {
  const f = await submitted();
  try {
    f.clock("2026-11-01T11:00:00.000Z");
    const service = f.service("admin");
    let providerCalls = 0;
    service.evaluator = {
      provenance: "provider",
      configuration: "synthetic-provider-evidence",
      async evaluate(versionId) {
        providerCalls++;
        return {
          versionId,
          model: "synthetic-fixture",
          status: "needs_review",
          rubricVersion: 1,
          revision: "a".repeat(40),
          checks: [],
          dimensions: null,
          suspectedFalseClaims: [],
        };
      },
    };
    const tasks: Promise<unknown>[] = [];
    await assert.rejects(
      queueEvaluations(service, { limit: 2 }, (p) => tasks.push(p)),
      { code: "PROVIDER_BATCH_LIMIT_ONE" },
    );
    assert.equal(providerCalls, 0);
    assert.equal(tasks.length, 0);
    const result = await queueEvaluations(service, { limit: 1 }, (p) =>
      tasks.push(p),
    );
    await Promise.all(tasks);
    assert.equal(result.accepted, 1);
    assert.equal(providerCalls, 1);
    const job = await one<{ report: string }>(
      f.db,
      "SELECT report FROM astra_jobs",
    );
    assert.equal(JSON.parse(job!.report).dimensions, null);
    assert.equal(JSON.parse(job!.report).status, "needs_review");
  } finally {
    f.db.close();
  }
});
test("explicit bounded offline background batch preserves human review and never activates scoring", async () => {
  const f = await submitted();
  const tasks: Promise<unknown>[] = [];
  try {
    await assert.rejects(
      queueEvaluations(f.service("alice"), {}, (p) => tasks.push(p)),
      { code: "ADMIN_REQUIRED" },
    );
    assert.equal(tasks.length, 0);
    await assert.rejects(
      queueEvaluations(f.service("admin"), { limit: 6 }, (p) => tasks.push(p)),
    );
    const settingsBefore = await rows(f.db, "SELECT * FROM event_settings");
    const queued = await queueEvaluations(
      f.service("admin"),
      { limit: 2 },
      (p) => tasks.push(p),
    );
    assert.equal(queued.accepted, 1);
    await Promise.all(tasks);
    const job = await one<{ state: string; attempts: number; report: string }>(
      f.db,
      "SELECT state,attempts,report FROM astra_jobs",
    );
    assert.equal(job?.state, "needs_review");
    assert.equal(job.attempts, 1);
    const report = JSON.parse(job.report);
    assert.equal(report.dimensions, null);
    assert.equal(report.status, "needs_review");
    assert.equal(report.model, "disabled-no-external-calls");
    assert.deepEqual(
      await rows(f.db, "SELECT * FROM event_settings"),
      settingsBefore,
    );
    assert.equal((await rows(f.db, "SELECT * FROM reviews")).length, 0);
    const again = await queueEvaluations(f.service("admin"), {}, (p) =>
      tasks.push(p),
    );
    assert.equal(again.accepted, 0);
  } finally {
    f.db.close();
  }
});
test("concurrent evaluator claims execute once, recover stale lease, ignore late original result", async () => {
  const f = await submitted();
  f.clock("2026-11-01T11:00:00.000Z");
  let release!: () => void;
  const wait = new Promise<void>((r) => (release = r));
  let entered!: () => void;
  const running = new Promise<void>((r) => (entered = r));
  const first = f.service("admin");
  first.evaluator = {
    async evaluate(versionId) {
      entered();
      await wait;
      return {
        versionId,
        status: "needs_review",
        model: "late",
        rubricVersion: 1,
        revision: "late",
        checks: [],
        dimensions: null,
        suspectedFalseClaims: [],
      };
    },
  };
  try {
    const job = (await one<{ id: string }>(f.db, "SELECT id FROM astra_jobs"))!;
    const task = first.command("astra-run", { jobId: job.id });
    await running;
    await assert.rejects(
      f.service("admin").command("astra-run", { jobId: job.id }),
      { code: "JOB_NOT_RUNNABLE" },
    );
    await assert.rejects(
      f.service("admin").command("astra-recover", { jobId: job.id }),
    );
    f.clock("2026-11-01T11:16:00.000Z");
    await f.service("admin").command("astra-recover", { jobId: job.id });
    await f.service("admin").command("astra-run", { jobId: job.id });
    release();
    await task;
    const final = (await one<{
      state: string;
      attempts: number;
      report: string;
    }>(f.db, "SELECT * FROM astra_jobs"))!;
    assert.equal(final.state, "needs_review");
    assert.equal(final.attempts, 2);
    assert.equal(JSON.parse(final.report).model, "disabled-no-external-calls");
  } finally {
    release();
    f.db.close();
  }
});
test("background endpoint requires dispatcher, staff, same origin and returns private accepted response", async () => {
  const f = await submitted();
  const tasks: Promise<unknown>[] = [];
  const request = (data: unknown = {}) =>
    new Request("http://localhost/api/portal", {
      method: "POST",
      headers: {
        Origin: "http://localhost",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "astra-process", data }),
    });
  const runtime = { db: f.db, identity: fixtures.admin, key: undefined };
  try {
    assert.equal((await handlePortal(request(), runtime)).status, 503);
    assert.equal(
      (
        await handlePortal(request(), {
          ...runtime,
          identity: fixtures.alice,
          background: (p) => tasks.push(p),
        })
      ).status,
      403,
    );
    // Calendar windows do not gate explicit staff processing.
    const accepted = await handlePortal(request(), {
      ...runtime,
      background: (p) => tasks.push(p),
    });
    assert.equal(accepted.status, 202);
    assert.match(accepted.headers.get("Cache-Control")!, /no-store/);
    await Promise.all(tasks);
    assert.equal(tasks.length, 1);
  } finally {
    f.db.close();
  }
});
