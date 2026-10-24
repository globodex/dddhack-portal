import { reportSchema, type Evaluator, type Report } from "./evaluation";
import { one, type Database } from "./db";
import type { PortalService } from "./service";

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
    report.status !== "finalized" ||
    !report.dimensions ||
    report.rubricVersion !== 1 ||
    !/^[a-f0-9]{40}$/.test(report.revision) ||
    (revision !== undefined && report.revision !== revision) ||
    /disabled|mock|offline/i.test(report.model) ||
    !report.checks.some(
      (check) =>
        check.id === "approved-snapshot" &&
        check.status === "PASS" &&
        check.evidence.includes(`commit:${report.revision}`),
    )
  )
    return null;
  const total = Object.values(report.dimensions).reduce(
    (sum, mark) => sum + mark,
    0,
  );
  return Number.isFinite(total) && total >= 0 && total <= 30 ? total : null;
}

export function evaluationAvailability(evaluator: Evaluator) {
  const available =
    evaluator.provenance === "provider" && evaluator.available !== false;
  return {
    available,
    reason: available
      ? ""
      : evaluator.unavailableReason || "AI evaluation is not configured.",
  };
}

export function storedEvaluationReport(
  report: Report,
  grade: number | null,
): Report {
  return grade === null
    ? { ...report, status: "needs_review", dimensions: null }
    : { ...report, status: "finalized" };
}

export async function latestProviderGrade(
  db: Database,
  projectId: string,
  versionId: string,
) {
  const run = await one<{
    id: string;
    report: string;
    score: number;
    provenance: Evaluator["provenance"];
  }>(
    db,
    "SELECT id,report,score,provenance FROM evaluation_runs WHERE project_id=? AND version_id=? AND state='completed' AND provenance='provider' AND score IS NOT NULL ORDER BY updated_at DESC,id LIMIT 1",
    projectId,
    versionId,
  );
  if (!run) return null;
  try {
    const report = reportSchema.parse(JSON.parse(run.report));
    const score = validatedProviderGrade(report, run.provenance);
    return score !== null &&
      report.versionId === versionId &&
      score === run.score
      ? { runId: run.id, score, report }
      : null;
  } catch {
    return null;
  }
}

/** Private admin projection of the exact explicit evaluation-action gates. */
export async function evaluationActionState(
  service: PortalService,
  projectId: string,
  versionId: string | undefined,
  publishedVersionId: string | null,
  submissionClose: string | null,
) {
  const job = versionId ? await one<{ state: string; attempts: number; frozen: number; removed: number }>(service.db,
    "SELECT j.state,j.attempts,EXISTS(SELECT 1 FROM result_snapshots) frozen,EXISTS(SELECT 1 FROM record_removals WHERE active=1 AND ((kind='project' AND target_id=?) OR (kind='submission' AND target_id=?))) removed FROM astra_jobs j WHERE version_id=?",
    projectId, versionId, versionId,
  ) : undefined;
  const availability = evaluationAvailability(service.evaluator);
  const reason = job?.frozen ? "Final scores are frozen."
    : !availability.available ? availability.reason
      : !versionId || versionId !== publishedVersionId ? "A current committed submission is required."
        : !submissionClose ? "Set the submission closing time."
          : service.now() < submissionClose ? "Wait for submissions to close."
            : !job ? "No evaluation job exists for this submission."
              : job.removed ? "This project or submission was removed."
                : job.attempts >= 3 ? "Three evaluation attempts have been used."
                  : job.state === "running" ? "Evaluation is already running."
                    : "";
  return {
    evaluationJob: job ? { state: job.state, attempts: job.attempts, maxAttempts: 3 } : null,
    evaluationControl: { allowed: !reason, reason },
    resultsFrozen: !!job?.frozen,
  };
}
