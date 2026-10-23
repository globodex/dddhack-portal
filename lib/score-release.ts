import { auditReason } from "./security";
import { z } from "zod";
import type { PortalService } from "./service";
import { one, rows, assertPreviousWrite, type SQL } from "./db";
import { demand } from "./security";
import { weightage } from "./policy-controls";
import { reportSchema } from "./evaluation";
type Entry = {
  projectId: string;
  versionId: string;
  teamId: string;
  score: number;
  position?: number;
};
type Release = {
  id: string;
  stage: "ai" | "final";
  source_id: string;
  payload: string;
  criteria: string | null;
};
const reason = auditReason();
export async function scoreState(s: PortalService) {
  const releases = await rows<Release>(
    s.db,
    "SELECT * FROM score_releases ORDER BY CASE stage WHEN 'final' THEN 0 ELSE 1 END",
  );
  const active = releases.at(0);
  const unveiled =
    active?.stage === "final"
      ? await rows<{ position: number; project_id: string }>(
          s.db,
          "SELECT position,project_id FROM winner_reveals WHERE release_id=? ORDER BY position",
          active.id,
        )
      : [];
  const entries: Entry[] = active ? JSON.parse(active.payload) : [];
  const hiddenCount = Math.min(5, entries.length);
  return {
    active,
    entries,
    unveiled,
    stage: active?.stage || "community",
    complete: active?.stage === "final" && unveiled.length === hiddenCount,
  };
}
export async function publicScores(s: PortalService) {
  const state = await scoreState(s);
  // Eligibility/version changes revoke a score immediately; never attach an older version's award.
  const valid = state.entries.length
    ? await rows<{ id: string; versionId: string }>(
        s.db,
        "SELECT p.id,p.published_version_id versionId FROM projects p JOIN submission_versions v ON v.id=p.published_version_id WHERE NOT EXISTS(SELECT 1 FROM record_removals rr WHERE rr.active=1 AND ((rr.kind='project' AND rr.target_id=p.id) OR (rr.kind='submission' AND rr.target_id=v.id))) AND COALESCE((SELECT status FROM project_eligibility e WHERE e.project_id=p.id AND e.version_id=v.id),(SELECT eligibility FROM reviews r WHERE r.team_id=p.team_id AND r.version_id=v.id),'needs_review')='eligible'",
      )
    : [];
  const current = state.entries.filter((e) =>
    valid.some((v) => v.id === e.projectId && v.versionId === e.versionId),
  );
  const visible =
    state.stage === "final" && !state.complete
      ? current.filter((e) =>
          state.unveiled.some((v) => v.project_id === e.projectId),
        )
      : current;
  return {
    stage: state.stage,
    complete: state.complete,
    scores: visible,
    criteria:
      state.stage === "final" && state.active?.criteria
        ? JSON.parse(state.active.criteria)
        : undefined,
  };
}
export async function revealCommand(
  s: PortalService,
  action: string,
  input: unknown,
) {
  if (
    ![
      "reveal-ai-scores",
      "reveal-final-scores",
      "unveil-winner",
      "publish-results",
    ].includes(action)
  )
    return null;
  const actor = await s.staff();
  demand(action !== "publish-results", 409, "USE_STAGED_SCORE_REVEAL");
  const d = z
    .object({
      reason,
      confirmation: z.string(),
      snapshotId: z.string().optional(),
      position: z.number().int().min(1).max(5).optional(),
      releaseId: z.string().optional(),
    })
    .strict()
    .parse(input);
  const token =
    action === "reveal-ai-scores"
      ? "PUBLIC_AI"
      : action === "reveal-final-scores"
        ? "PUBLIC_FINAL"
        : `UNVEIL_${d.position}`;
  demand(
    d.confirmation === token,
    422,
    "EXPLICIT_REVEAL_CONFIRMATION_REQUIRED",
  );
  const state = await scoreState(s);
  if (action === "unveil-winner") {
    demand(
      state.active?.stage === "final" && state.active.id === d.releaseId,
      409,
      "FINAL_RELEASE_CHANGED",
    );
    const previous = state.unveiled.find((v) => v.position === d.position);
    if (previous) return { message: "This award was already unveiled." };
    demand(
      d.position && d.position <= Math.min(5, state.entries.length),
      422,
      "WINNER_POSITION_INVALID",
    );
    const winner = state.entries.find((e) => e.position === d.position);
    demand(winner, 409, "WINNER_NOT_AVAILABLE");

    await s.mutate(
      actor.id,
      action,
      state.active.id,
      [
        [
          "INSERT INTO winner_reveals(release_id,position,project_id,created_at,actor_id) SELECT ?,?,?,?,? WHERE (SELECT count(*) FROM winner_reveals WHERE release_id=?)=? ON CONFLICT(release_id,position) DO NOTHING",
          state.active.id,
          d.position,
          winner.projectId,
          s.now(),
          actor.id,
          state.active.id,
          state.unveiled.length,
        ],
        ...assertPreviousWrite(),
      ],
      { position: d.position },
      d.reason,
    );
    return { message: `Award ${d.position} is now public.` };
  }
  const existing = await one<Release>(
    s.db,
    "SELECT * FROM score_releases WHERE stage=?",
    action === "reveal-ai-scores" ? "ai" : "final",
  );
  if (existing) {
    demand(
      action !== "reveal-final-scores" || existing.source_id === d.snapshotId,
      409,
      "FINAL_RELEASE_CHANGED",
    );
    return { message: "This score stage was already revealed." };
  }
  if (action === "reveal-ai-scores")
    demand(state.stage === "community", 409, "SCORE_STAGE_CLOSED");
  const settings = await s.live();
  const revision = (await one<{ version: number }>(
    s.db,
    "SELECT version FROM scoring_revision WHERE id=1",
  ))!.version;
  let entries: Entry[] = [],
    sourceId = "",
    criteria: string | null = null;
  if (action === "reveal-ai-scores") {
    const eligible = await rows<{
      id: string;
      team_id: string;
      versionId: string;
    }>(
      s.db,
      "SELECT p.id,p.team_id,p.published_version_id versionId FROM projects p JOIN submission_versions v ON v.id=p.published_version_id WHERE COALESCE((SELECT status FROM project_eligibility e WHERE e.project_id=p.id AND e.version_id=v.id),(SELECT eligibility FROM reviews r WHERE r.team_id=p.team_id AND r.version_id=v.id),'needs_review')='eligible' ORDER BY (SELECT first.created_at FROM submission_versions first WHERE first.team_id=p.team_id ORDER BY attempt LIMIT 1),p.id",
    );
    demand(eligible.length > 0, 409, "NO_ELIGIBLE_EVALUATIONS");
    const runIds: string[] = [];
    for (const project of eligible) {
      const run = await one<{
        id: string;
        report: string;
        score: number;
        provenance: string;
      }>(
        s.db,
        "SELECT id,report,score,provenance FROM evaluation_runs WHERE project_id=? AND version_id=? AND state='completed' AND provenance='provider' AND score IS NOT NULL ORDER BY updated_at DESC,id LIMIT 1",
        project.id,
        project.versionId,
      );
      demand(
        run && Number.isFinite(run.score) && run.score >= 0 && run.score <= 30,
        409,
        "REAL_EVALUATION_REQUIRED",
      );
      const report = reportSchema.parse(JSON.parse(run.report));
      demand(
        report.status === "finalized" &&
          report.versionId === project.versionId &&
          report.dimensions &&
          !/disabled|mock/i.test(report.model),
        409,
        "FINALIZED_EVALUATION_REQUIRED",
      );
      entries.push({
        projectId: project.id,
        versionId: project.versionId,
        teamId: project.team_id,
        score: run.score,
      });
      runIds.push(run.id);
    }
    entries.sort((a, b) => b.score - a.score); // Stable sort retains first-submission/ID order for tied scores.
    sourceId = JSON.stringify(runIds);
  } else {
    demand(d.snapshotId, 422, "SNAPSHOT_REQUIRED");
    const snapshot = await one<{
      id: string;
      payload: string;
      policy_version: number;
    }>(
      s.db,
      "SELECT id,payload,policy_version FROM result_snapshots WHERE id=?",
      d.snapshotId,
    );
    demand(
      snapshot && snapshot.policy_version === settings.version,
      409,
      "CURRENT_FROZEN_SNAPSHOT_REQUIRED",
    );
    const disclosure = settings.policy.scoringDisclosure;
    demand(
      disclosure?.confirmed &&
        disclosure.criteria.trim() &&
        disclosure.weightage.trim(),
      409,
      "SCORING_DISCLOSURE_UNCONFIRMED",
    );
    const result = JSON.parse(snapshot.payload) as {
      teamId: string;
      rank: number | null;
      components: { total: number } | null;
      eligibility: string;
    }[];
    for (const r of result.filter((r) => r.eligibility === "eligible")) {
      const p = await one<{ id: string; published_version_id: string }>(
        s.db,
        "SELECT id,published_version_id FROM projects WHERE team_id=?",
        r.teamId,
      );
      demand(
        p?.published_version_id &&
          Number.isFinite(r.components?.total) &&
          r.rank,
        409,
        "FINAL_PROJECT_COVERAGE_REQUIRED",
      );
      entries.push({
        projectId: p.id,
        versionId: p.published_version_id,
        teamId: r.teamId,
        score: r.components!.total,
        position: r.rank!,
      });
    }
    entries.sort((a, b) => a.position! - b.position!);
    demand(
      entries.length > 0 && entries.every((e, i) => e.position === i + 1),
      409,
      "FINAL_ORDER_INCOMPLETE",
    );
    sourceId = snapshot.id;
    criteria = JSON.stringify({
      criteria: disclosure.criteria,
      weightage: weightage(settings.policy.weights),
      policyVersion: settings.version,
    });
  }
  const releaseId = crypto.randomUUID();
  await s.mutate(
    actor.id,
    action,
    releaseId,
    [
      [
        "INSERT INTO score_releases SELECT ?,?,?,?,?,?,? WHERE (SELECT version FROM scoring_revision WHERE id=1)=? AND NOT EXISTS(SELECT 1 FROM score_releases WHERE stage='final')",
        releaseId,
        action === "reveal-ai-scores" ? "ai" : "final",
        sourceId,
        JSON.stringify(entries),
        criteria,
        s.now(),
        actor.id,
        revision,
      ],
      ...assertPreviousWrite(),
    ],
    {
      stage: action === "reveal-ai-scores" ? "ai" : "final",
      count: entries.length,
    },
    d.reason,
  );
  return {
    message:
      action === "reveal-ai-scores"
        ? "AI scores are now public."
        : "Final reveal started. Awards remain hidden until unveiled individually.",
    releaseId,
  };
}
