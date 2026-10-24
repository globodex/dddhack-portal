import { reportSchema, type Evaluator, type Report } from "./evaluation";
import { one, type Database } from "./db";

/** The grade is derived locally, never accepted as a provider-supplied total. */
export function validatedProviderGrade(
  value: unknown,
  provenance: Evaluator["provenance"],
  revision?: string,
): number | null {
  const parsed = reportSchema.safeParse(value);
  if (!parsed.success || provenance !== "provider") return null;
  const report = parsed.data;
  if (
    report.status !== "finalized" || !report.dimensions || report.rubricVersion !== 1 ||
    !/^[a-f0-9]{40}$/.test(report.revision) ||
    (revision !== undefined && report.revision !== revision) ||
    /disabled|mock|offline/i.test(report.model) ||
    !report.checks.some(check => check.id === "approved-snapshot" && check.status === "PASS" && check.evidence.includes(`commit:${report.revision}`))
  ) return null;
  const total = Object.values(report.dimensions).reduce((sum, mark) => sum + mark, 0);
  return Number.isFinite(total) && total >= 0 && total <= 30 ? total : null;
}

export function evaluationAvailability(evaluator: Evaluator) {
  const available = evaluator.provenance === "provider" && evaluator.available !== false;
  return {
    available,
    reason: available ? "" : evaluator.unavailableReason || "AI evaluation is not configured.",
  };
}

export function storedEvaluationReport(report: Report, grade: number | null): Report {
  return grade === null
    ? { ...report, status: "needs_review", dimensions: null }
    : { ...report, status: "finalized" };
}

export async function latestProviderGrade(db: Database, projectId: string, versionId: string) {
  const run = await one<{ id: string; report: string; score: number; provenance: Evaluator["provenance"] }>(
    db,
    "SELECT id,report,score,provenance FROM evaluation_runs WHERE project_id=? AND version_id=? AND state='completed' AND provenance='provider' AND score IS NOT NULL ORDER BY updated_at DESC,id LIMIT 1",
    projectId, versionId,
  );
  if (!run) return null;
  try {
    const report = reportSchema.parse(JSON.parse(run.report));
    const score = validatedProviderGrade(report, run.provenance);
    return score !== null && report.versionId === versionId && score === run.score ? { runId: run.id, score, report } : null;
  } catch { return null; }
}
