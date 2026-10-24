import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { setup, rehearsalPolicy, submission, attend } from "./helpers";
import { createPGliteFixture } from "./neon-db-fixture";
import { seedLocal, fixtures, LOCAL_CREDIT_KEY } from "../scripts/fixtures";
import { PortalService } from "../lib/service";
import { batch, one, rows, type Database } from "../lib/db";
import {
  validatedProviderGrade,
  latestProviderGrade,
} from "../lib/provider-grade";
import type { Report } from "../lib/evaluation";
import {
  modelReviewReport,
  reviewAreas,
  reviewAreaCaps,
} from "../neon/ai/output";
import {
  createOpenAIEvaluator,
  type ApprovedEvaluationSnapshot,
} from "../neon/ai";

const revision = "a".repeat(40);
function report(versionId: string, mark = 1): Report {
  return {
    versionId,
    revision,
    rubricVersion: 1,
    status: "finalized",
    model: "independent-synthetic-provider",
    checks: [
      {
        id: "approved-snapshot",
        status: "PASS",
        evidence: ["commit:" + revision],
        explanation: "Synthetic approved snapshot.",
      },
      ...reviewAreas.map((area) => ({
        id: "ai-evidence:" + area,
        status: "PASS" as const,
        evidence: ["description:description"],
        explanation: "Synthetic rubric observation.",
      })),
    ],
    dimensions: Object.fromEntries(
      reviewAreas.map((area) => [area, Math.min(mark, reviewAreaCaps[area])]),
    ) as NonNullable<Report["dimensions"]>,
    suspectedFalseClaims: [],
  };
}
async function prepared(engine: "sqlite" | "postgres") {
  const local = engine === "sqlite" ? await setup() : null;
  const pg = local ? null : await createPGliteFixture();
  const db: Database = local?.db || pg!.db;
  if (pg) await seedLocal(db);
  let time = "2026-11-01T06:00:00.000Z";
  const service = (who = "alice") =>
    new PortalService(db, fixtures[who], LOCAL_CREDIT_KEY, () => time);
  await batch(db, [
    [
      "UPDATE event_settings SET policy=?,active=1 WHERE id=1",
      JSON.stringify(rehearsalPolicy),
    ],
  ]);
  await attend(db, "fake_alice");
  const committed = await service().command("submit-project", {
    revision: 0,
    project: {
      projectName: "Independent provider audit",
      problemSolution: submission.problemSolution,
      description: submission.description,
      github: submission.github,
      demo: "",
      logo: submission.logo,
      banner: submission.banner,
      attestation: true,
    },
  });
  const projectId = String(committed.projectId),
    versionId = String(committed.versionId);
  await service("admin").command("record-repository-evidence", {
    projectId,
    versionId,
    commitSha: revision,
    metadata: {
      public: true,
      createdAt: "2026-11-01T03:00:00.000Z",
      firstCommit: "2026-11-01T03:01:00.000Z",
    },
    source: "https://example.test/independent-provider-evidence",
    observedAt: time,
  });
  time = "2026-11-01T11:00:00.000Z";
  const job = (await one<{ id: string }>(
    db,
    "SELECT id FROM astra_jobs WHERE version_id=?",
    versionId,
  ))!;
  return {
    db,
    service,
    projectId,
    versionId,
    jobId: job.id,
    values: { projectId, versionId },
    clock: (value: string) => {
      time = value;
    },
    close: async () => {
      await (local?.db || pg!.db).close();
    },
  };
}

test("independent provider mapping: mocked response keeps exact bound caps/evidence and unknown stays unscored; unavailable model performs no lookup or fetch", async () => {
  const content = "export const approvedEntry = true;\n";
  const snapshot: ApprovedEvaluationSnapshot = {
    approved: true,
    versionId: "independent-snapshot",
    commitSha: revision,
    approvedPaths: ["src/entry.ts"],
    descriptions: { description: "Synthetic approved project description." },
    files: [
      {
        path: "src/entry.ts",
        content,
        commitSha: revision,
        sha256: createHash("sha256").update(content).digest("hex"),
      },
    ],
    commit: { sha: revision },
  };
  const numeric = () => ({
    versionId: snapshot.versionId,
    revision,
    observations: reviewAreas.map((area) => ({
      area,
      status: "SCORED",
      score: reviewAreaCaps[area],
      explanation: "Synthetic assessment limited to cited approved evidence.",
      evidence: [{ source: "src/entry.ts", startLine: 1, endLine: 1 }],
    })),
  });
  let calls = 0;
  const evaluator = createOpenAIEvaluator(
    {
      OPENAI_API_KEY: "independent-synthetic-key-not-live-0000",
      OPENAI_MODEL: "independent-synthetic-model",
      PORTAL_OPENAI_EVALUATION_APPROVED: "true",
    },
    {
      resolveApprovedSnapshot: async () => snapshot,
      fetch: async (_input, init) => {
        calls++;
        const body = JSON.parse(String(init?.body));
        assert.equal(body.store, false);
        assert.deepEqual(body.tools, []);
        assert.equal(body.tool_choice, "none");
        return Response.json({
          status: "completed",
          model: "independent-synthetic-model",
          output: [
            {
              type: "message",
              role: "assistant",
              status: "completed",
              content: [
                { type: "output_text", text: JSON.stringify(numeric()) },
              ],
            },
          ],
        });
      },
    },
  );
  const mapped = await evaluator.evaluate(snapshot.versionId, {
    commitSha: revision,
  });
  assert.equal(calls, 1);
  assert.equal(validatedProviderGrade(mapped, "provider", revision), 30);
  assert.deepEqual(mapped.suspectedFalseClaims, []);
  const unknown = numeric();
  Object.assign(unknown.observations[0], {
    status: "UNKNOWN",
    score: null,
    evidence: [],
  });
  const uncertain = modelReviewReport(
    unknown,
    snapshot,
    "independent-synthetic-model",
  );
  assert.equal(uncertain.dimensions, null);
  assert.equal(validatedProviderGrade(uncertain, "provider", revision), null);
  for (const mutate of [
    (v: any) => {
      v.versionId = "wrong-version";
    },
    (v: any) => {
      v.revision = "b".repeat(40);
    },
    (v: any) => {
      v.observations[0].score = 7;
    },
    (v: any) => {
      v.observations[0].score = Number.NaN;
    },
    (v: any) => {
      v.observations[0].evidence[0].source = "private-source.ts";
    },
    (v: any) => {
      v.observations[0].evidence[0].endLine = 500;
    },
    (v: any) => {
      v.observations[0].evidence = [];
    },
    (v: any) => {
      v.observations[1] = v.observations[0];
    },
  ]) {
    const value = numeric();
    mutate(value);
    assert.throws(
      () => modelReviewReport(value, snapshot, "independent-synthetic-model"),
      { message: "OPENAI_OUTPUT_INVALID" },
    );
  }
  const missing = createOpenAIEvaluator(
    {
      OPENAI_API_KEY: "independent-synthetic-key-not-live-0000",
      PORTAL_OPENAI_EVALUATION_APPROVED: "true",
    },
    {
      resolveApprovedSnapshot: async () => {
        throw new Error("NO_LOOKUP");
      },
      fetch: async () => {
        throw new Error("NO_FETCH");
      },
    },
  );
  assert.equal(missing.available, false);
  await assert.rejects(
    missing.evaluate(snapshot.versionId, { commitSha: revision }),
    { message: "OPENAI_NOT_CONFIGURED" },
  );
});

for (const engine of ["sqlite", "postgres"] as const) {
  test(`${engine}: independent bridge rejects wrong version/revision, preserves true zero and private scores, and caps three committed attempts`, async () => {
    const f = await prepared(engine);
    try {
      const admin = f.service("admin");
      let calls = 0;
      admin.evaluator = {
        provenance: "provider",
        available: false,
        unavailableReason: "AI model is not configured.",
        async evaluate() {
          calls++;
          throw new Error("MUST_NOT_RUN");
        },
      };
      await assert.rejects(admin.command("reevaluate-project", f.values), {
        code: "EVALUATOR_NOT_CONFIGURED",
      });
      assert.equal(
        (await one(
          f.db,
          "SELECT attempts FROM astra_jobs WHERE id=?",
          f.jobId,
        ))!.attempts,
        0,
      );
      assert.equal(calls, 0);
      admin.evaluator = {
        provenance: "provider",
        available: true,
        configuration: "independent-bound-config",
        async evaluate(versionId) {
          calls++;
          return calls === 1
            ? { ...report(versionId), versionId: "wrong-version" }
            : calls === 2
              ? { ...report(versionId), revision: "b".repeat(40) }
              : report(versionId, 0);
        },
      };
      await assert.rejects(
        admin.command("reevaluate-project", {
          ...f.values,
          versionId: "wrong-current-version",
        }),
        { code: "STALE_SUBMISSION" },
      );
      await assert.rejects(
        f.service("alice").command("reevaluate-project", f.values),
        { code: "ADMIN_REQUIRED" },
      );
      assert.equal(calls, 0);
      await admin.command("reevaluate-project", f.values);
      assert.equal(
        (await one(f.db, "SELECT state FROM astra_jobs WHERE id=?", f.jobId))!
          .state,
        "failed_retryable",
      );
      assert.equal(
        await latestProviderGrade(f.db, f.projectId, f.versionId),
        null,
      );
      await admin.command("reevaluate-project", f.values);
      assert.equal(
        (await one(f.db, "SELECT state FROM astra_jobs WHERE id=?", f.jobId))!
          .state,
        "needs_review",
      );
      assert.equal(
        await latestProviderGrade(f.db, f.projectId, f.versionId),
        null,
      );
      await admin.command("reevaluate-project", f.values);
      assert.equal(
        (await latestProviderGrade(f.db, f.projectId, f.versionId))!.score,
        0,
      );
      assert.equal(
        (await one(
          f.db,
          "SELECT attempts FROM astra_jobs WHERE id=?",
          f.jobId,
        ))!.attempts,
        3,
      );
      await assert.rejects(admin.command("reevaluate-project", f.values), {
        code: "JOB_NOT_RUNNABLE",
      });
      assert.equal(calls, 3);
      assert.equal(
        (await rows(f.db, "SELECT * FROM reviews")).length,
        0,
        "Provider must not write manual scores/eligibility/penalties",
      );
      for (const who of ["stranger", "alice"]) {
        const view = (await f.service(who).view("/projects")) as any;
        assert.ok(view.items.every((item: any) => !item.result));
        assert.doesNotMatch(
          JSON.stringify(view),
          /independent-synthetic-provider|approved-snapshot|rubricVersion|dimensions/,
        );
      }
      const privateView = (await admin.view(
        "/admin/submissions/" + f.projectId,
      )) as any;
      assert.equal(privateView.evaluation.score, 0);
      await admin.command("review-project", {
        ...f.values,
        rating: 8,
        body: "Independent synthetic human review.",
      });
      await admin.command("review", {
        teamId: "fake_team1",
        versionId: f.versionId,
        eligibility: "eligible",
        astra: 0,
        codex: 4,
        diversity: 6,
        falseClaims: 0,
        evidence: "Independent manual zero override.",
      });
      assert.equal((await admin.compute())[0].components!.astra, 0);
    } finally {
      await f.close();
    }
  });

  test(`${engine}: independent provider stale recovery frees the actual configuration, permits one retry and discards the late original`, async () => {
    const f = await prepared(engine);
    let release!: () => void,
      entered!: () => void,
      task: Promise<unknown> | undefined;
    const gate = new Promise<void>((r) => {
        release = r;
      }),
      started = new Promise<void>((r) => {
        entered = r;
      });
    try {
      const admin = f.service("admin");
      let calls = 0;
      admin.evaluator = {
        provenance: "provider",
        available: true,
        configuration: "independent-real-config",
        async evaluate(versionId) {
          calls++;
          entered();
          await gate;
          return report(versionId, 6);
        },
      };
      task = admin.command("reevaluate-project", f.values);
      await started;
      await assert.rejects(admin.command("reevaluate-project", f.values), {
        code: "JOB_NOT_RUNNABLE",
      });
      assert.equal(calls, 1);
      f.clock("2026-11-01T11:16:00.000Z");
      await admin.command("astra-recover", { jobId: f.jobId });
      assert.equal(
        (await one(
          f.db,
          "SELECT state FROM evaluation_runs WHERE version_id=?",
          f.versionId,
        ))!.state,
        "stale",
      );
      admin.evaluator = {
        provenance: "provider",
        available: true,
        configuration: "independent-real-config",
        async evaluate(versionId) {
          calls++;
          return report(versionId);
        },
      };
      await admin.command("reevaluate-project", f.values);
      release();
      await task;
      assert.equal(calls, 2);
      assert.equal(
        (await latestProviderGrade(f.db, f.projectId, f.versionId))!.score,
        10,
      );
      assert.equal(
        (await one(
          f.db,
          "SELECT attempts FROM astra_jobs WHERE id=?",
          f.jobId,
        ))!.attempts,
        2,
      );
      const runs = await rows<any>(
        f.db,
        "SELECT state,score FROM evaluation_runs WHERE version_id=? ORDER BY created_at",
        f.versionId,
      );
      assert.equal(
        runs.filter((run) => run.state === "stale" && run.score === null)
          .length,
        1,
      );
      assert.equal(
        runs.filter((run) => run.state === "completed" && run.score === 10)
          .length,
        1,
      );
    } finally {
      release();
      if (task) await task;
      await f.close();
    }
  });

  test(`${engine}: independent in-flight provider completion cannot add a numeric grade after owner freezes results`, async () => {
    const f = await prepared(engine);
    let release!: () => void,
      entered!: () => void,
      task: Promise<unknown> | undefined;
    const gate = new Promise<void>((r) => {
        release = r;
      }),
      started = new Promise<void>((r) => {
        entered = r;
      });
    try {
      const admin = f.service("admin");
      await admin.command("review-project", {
        ...f.values,
        rating: 8,
        body: "Independent synthetic human review.",
      });
      await admin.command("review", {
        teamId: "fake_team1",
        versionId: f.versionId,
        eligibility: "eligible",
        astra: 12,
        codex: 4,
        diversity: 6,
        falseClaims: 0,
        evidence: "Independent manually checked rubric.",
      });
      admin.evaluator = {
        provenance: "provider",
        available: true,
        configuration: "independent-freeze-config",
        async evaluate(versionId) {
          entered();
          await gate;
          return report(versionId);
        },
      };
      task = admin.command("reevaluate-project", f.values);
      await started;
      f.clock("2026-11-01T13:00:00.000Z");
      await f
        .service("owner")
        .command("freeze-results", {
          reason: "Independent synthetic frozen-score proof.",
        });
      const frozen = await rows(f.db, "SELECT * FROM result_snapshots");
      await assert.rejects(admin.command("reevaluate-project", f.values), {
        code: "RESULTS_FROZEN",
      });
      release();
      await task;
      assert.equal(
        await latestProviderGrade(f.db, f.projectId, f.versionId),
        null,
      );
      assert.equal(
        (await one(
          f.db,
          "SELECT score FROM evaluation_runs WHERE version_id=?",
          f.versionId,
        ))!.score,
        null,
      );
      assert.deepEqual(
        await rows(f.db, "SELECT * FROM result_snapshots"),
        frozen,
      );
      assert.equal(
        (await one(
          f.db,
          "SELECT astra FROM reviews WHERE version_id=?",
          f.versionId,
        ))!.astra,
        12,
      );
    } finally {
      release();
      if (task) await task;
      await f.close();
    }
  });
}
