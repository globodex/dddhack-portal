import type { PortalService } from "./service";
import { one, rows } from "./db";
import { policyBlockers } from "./policy";
import { reportSchema } from "./evaluation";
import { scoreState } from "./score-release";
export async function resultControls(s: PortalService) {
  const actor = await s.staff(),
    settings = await s.settings(true),
    state = await scoreState(s);
  const deny = (reason: string) => ({ allowed: false, reason }),
    yes = { allowed: true, reason: "" };
  let ai =
    state.stage === "community"
      ? yes
      : deny("AI scores have already been revealed.");
  if (ai.allowed) {
    const projects = await rows<{ id: string; versionId: string }>(
      s.db,
      "SELECT p.id,p.published_version_id versionId FROM projects p WHERE p.published_version_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM record_removals rr WHERE rr.active=1 AND ((rr.kind='project' AND rr.target_id=p.id) OR (rr.kind='submission' AND rr.target_id=p.published_version_id))) AND COALESCE((SELECT status FROM project_eligibility e WHERE e.project_id=p.id AND e.version_id=p.published_version_id),(SELECT eligibility FROM reviews r WHERE r.team_id=p.team_id AND r.version_id=p.published_version_id),'needs_review')='eligible'",
    );
    if (!projects.length) ai = deny("Review project eligibility first.");
    for (const p of projects) {
      const run = await one<{ report: string; score: number }>(
        s.db,
        "SELECT report,score FROM evaluation_runs WHERE project_id=? AND version_id=? AND state='completed' AND provenance='provider' AND score IS NOT NULL ORDER BY updated_at DESC,id LIMIT 1",
        p.id,
        p.versionId,
      );
      let valid = false;
      try {
        const r = reportSchema.parse(JSON.parse(run?.report || "null"));
        valid =
          !!run &&
          Number.isFinite(run.score) &&
          run.score >= 0 &&
          run.score <= 30 &&
          r.versionId === p.versionId &&
          r.status === "finalized" &&
          !!r.dimensions &&
          !/disabled|mock|offline/i.test(r.model);
      } catch {}
      if (!valid) {
        ai = deny("Complete current-version provider evaluations.");
        break;
      }
    }
  }
  const snapshots = await rows<{ id: string; policy_version: number }>(
    s.db,
    "SELECT id,policy_version FROM result_snapshots ORDER BY created_at DESC",
  );
  const blockers = policyBlockers(settings.policy);
  let freeze = !actor.owner
    ? deny("Owner required.")
    : snapshots.length
      ? deny("A final snapshot is already frozen.")
      : blockers.length
        ? deny("Configure " + blockers[0] + ".")
        : yes;
  if (freeze.allowed) {
    try {
      const scores = await s.compute();
      if (!scores.length) freeze = deny("Complete eligible project reviews.");
    } catch {
      freeze = deny("Complete eligible project reviews and judge coverage.");
    }
  }
  const disclosure = settings.policy.scoringDisclosure;
  const final =
    state.stage === "final"
      ? deny("Final scores have already been revealed.")
      : !snapshots.some((p) => p.policy_version === settings.version)
        ? deny("Freeze the current final score snapshot first.")
        : !disclosure?.criteria.trim() || !disclosure?.weightage.trim()
          ? deny("Set scoring criteria and weightage.")
          : blockers.length
            ? deny("Configure " + blockers[0] + ".")
            : yes;
  return { ai, freeze, final };
}
