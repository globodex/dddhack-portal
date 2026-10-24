import { test } from "node:test";
import assert from "node:assert/strict";
import { setup, activate, attend, submission } from "./helpers";
import { one, rows } from "../lib/db";
import { validatedProviderGrade, latestProviderGrade } from "../lib/provider-grade";
import type { Report } from "../lib/evaluation";

const revision = "a".repeat(40);
const reportFor = (versionId: string): Report => ({
  versionId, status: "finalized", model: "synthetic-provider-model", rubricVersion: 1, revision,
  checks: [{ id: "approved-snapshot", status: "PASS", evidence: [`commit:${revision}`], explanation: "Synthetic approved snapshot." }],
  dimensions: { functionality: 1, complexity: 1, openai: 1, cerebras: 1, ux: 1, docs: 1, contributors: 1, deployment: 1, readiness: 1, seo: 1 },
  suspectedFalseClaims: [],
});
async function prepared() {
  const f = await setup();
  await activate(f.db);
  await attend(f.db, "fake_alice");
  f.clock("2026-11-01T06:00:00.000Z");
  const committed = await f.service().command("submit-project", { revision: 0, project: {
    projectName: "Synthetic graded project", problemSolution: submission.problemSolution,
    description: submission.description, github: submission.github, demo: "",
    logo: submission.logo, banner: submission.banner, attestation: true,
  } });
  await f.service("admin").command("record-repository-evidence", {
    projectId: committed.projectId, versionId: committed.versionId, commitSha: revision,
    metadata: { public: true, createdAt: "2026-11-01T03:00:00.000Z", firstCommit: "2026-11-01T03:01:00.000Z" },
    source: "https://example.test/synthetic-evidence", observedAt: "2026-11-01T06:00:00.000Z",
  });
  return { ...f, projectId: committed.projectId as string, versionId: committed.versionId as string };
}

test("only complete, bound provider rubric reports yield a score; unknown never means zero", () => {
  const report = reportFor("synthetic-version");
  assert.equal(validatedProviderGrade(report, "provider", revision), 10);
  assert.equal(validatedProviderGrade(report, "offline", revision), null);
  assert.equal(validatedProviderGrade(report, "provider", "b".repeat(40)), null);
  assert.equal(validatedProviderGrade({ ...report, status: "needs_review" }, "provider"), null);
  assert.equal(validatedProviderGrade({ ...report, dimensions: null }, "provider"), null);
  assert.equal(validatedProviderGrade({ ...report, checks: [] }, "provider"), null);
  assert.equal(validatedProviderGrade({ ...report, dimensions: { ...report.dimensions!, functionality: 7 } }, "provider"), null);
  assert.equal(validatedProviderGrade({ ...report, dimensions: Object.fromEntries(Object.keys(report.dimensions!).map(key => [key, 0])) }, "provider"), 0);
});

test("explicit current-version evaluation persists a numeric provider report, while eligibility and manual final review stay separate", async () => {
  const f = await prepared();
  try {
    const admin = f.service("admin");
    let calls = 0;
    admin.evaluator = { provenance: "provider", available: true, configuration: "synthetic-rubric", async evaluate(versionId) { calls++; return reportFor(versionId); } };
    const values = { projectId: f.projectId, versionId: f.versionId };
    await assert.rejects(admin.command("reevaluate-project", values), { code: "SUBMISSION_WINDOW_OPEN" });
    assert.equal(calls, 0);
    await assert.rejects(f.service().command("reevaluate-project", values), { code: "ADMIN_REQUIRED" });
    f.clock("2026-11-01T11:00:00.000Z");
    const result = await admin.command("reevaluate-project", values);
    assert.equal(result.message, "AI score saved.");
    assert.equal(calls, 1);
    const run = await one<{ report: string; score: number; provenance: string }>(f.db, "SELECT * FROM evaluation_runs WHERE version_id=?", f.versionId);
    assert.equal(run!.score, 10);
    assert.equal(run!.provenance, "provider");
    assert.equal(JSON.parse(run!.report).status, "finalized");
    assert.equal((await one(f.db, "SELECT state FROM astra_jobs WHERE version_id=?", f.versionId))!.state, "finalized");
    assert.equal((await rows(f.db, "SELECT * FROM reviews")).length, 0);
    assert.equal((await latestProviderGrade(f.db, f.projectId, f.versionId))!.score, 10);
    const beforeReveal = await f.service("stranger").view("/leaderboard") as any;
    assert.equal(beforeReveal.scoreStage, "community");
    assert.ok(beforeReveal.items.every((item: any) => !item.result));
    await admin.command("reveal-ai-scores", { confirmation: "PUBLIC_AI" });
    const afterReveal = await f.service("stranger").view("/leaderboard") as any;
    assert.equal(afterReveal.scoreStage, "ai");
    assert.equal(afterReveal.items[0].result.score, 10);
    assert.doesNotMatch(JSON.stringify(afterReveal), /dimensions|approved-snapshot|synthetic-provider-model|rubricVersion/);
    const view = await admin.view("/admin/submissions/" + f.projectId) as any;
    assert.equal(view.evaluationConfigured, true);
    assert.equal(view.scoringReady, true);
    assert.equal(view.evaluation.score, 10);
    await admin.command("review-project", { ...values, rating: 8, body: "Synthetic reviewer feedback." });
    const review = { teamId: "fake_team1", versionId: f.versionId, eligibility: "eligible", astra: null, codex: 4, diversity: 6, falseClaims: 0, evidence: "Synthetic actual rubric review." };
    await admin.command("review", review);
    assert.equal((await admin.compute())[0].components!.astra, 10);
    await admin.command("review", { ...review, astra: 12 });
    assert.equal((await admin.compute())[0].components!.astra, 12);
    assert.equal((await latestProviderGrade(f.db, f.projectId, f.versionId))!.score, 10);
  } finally { f.db.close(); }
});

test("missing model fails closed before any evaluation attempt and incomplete reports stay unscored", async () => {
  const f = await prepared();
  try {
    f.clock("2026-11-01T11:00:00.000Z");
    const admin = f.service("admin");
    admin.evaluator = { provenance: "provider", available: false, unavailableReason: "AI model is not configured.", async evaluate() { throw new Error("Must not run"); } };
    const values = { projectId: f.projectId, versionId: f.versionId };
    await assert.rejects(admin.command("reevaluate-project", values), /AI model is not configured/);
    assert.equal((await one(f.db, "SELECT attempts FROM astra_jobs WHERE version_id=?", f.versionId))!.attempts, 0);
    admin.evaluator = { provenance: "provider", available: true, async evaluate(versionId) { return { ...reportFor(versionId), status: "needs_review", dimensions: null }; } };
    await admin.command("reevaluate-project", values);
    assert.equal((await one(f.db, "SELECT score FROM evaluation_runs WHERE version_id=?", f.versionId))!.score, null);
    assert.equal((await latestProviderGrade(f.db, f.projectId, f.versionId)), null);
  } finally { f.db.close(); }
});
