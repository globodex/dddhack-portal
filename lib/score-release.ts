import { auditReason } from "./security";
import { z } from "zod";
import type { PortalService } from "./service";
import { one, rows, assertPreviousWrite } from "./db";
import { demand } from "./security";
import { weightage } from "./policy-controls";
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
  return {
    active,
    entries,
    unveiled,
    stage: active?.stage || "community",
    aiRevealed: releases.some(release => release.stage === "ai"),
    complete: active?.stage === "final",
  };
}
export async function publicScores(s: PortalService) {
  const state = await scoreState(s);
  // A historical AI-only release must never disclose marks under the owner-reveal policy.
  if (state.stage !== "final") return {stage:"community" as const,complete:false,scores:[] as Entry[],criteria:undefined};
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
  return {
    stage: state.stage,
    complete: state.complete,
    scores: current,
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
  const actor = await s.staff(true);
  demand(action === "reveal-final-scores", 409, "USE_OWNER_SCORE_REVEAL", "Only the owner can reveal the combined project scores.");
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
  demand(d.confirmation === "PUBLIC_FINAL",422,"EXPLICIT_REVEAL_CONFIRMATION_REQUIRED");
  const existing = await one<Release>(
    s.db,
    "SELECT * FROM score_releases WHERE stage=?",
    "final",
  );
  if (existing) {
    demand(
      existing.source_id === d.snapshotId,
      409,
      "FINAL_RELEASE_CHANGED",
    );
    return { message: "This score stage was already revealed." };
  }
  {
    const disclosure = (await s.settings(true)).policy.scoringDisclosure;
    demand(
      disclosure && disclosure.criteria.trim() && disclosure.weightage.trim(),
      409,
      "SCORING_DISCLOSURE_UNCONFIRMED",
      "Set scoring criteria and weightage before revealing final scores.",
    );
  }
  const settings = await s.live();
  const revision = (await one<{ version: number }>(
    s.db,
    "SELECT version FROM scoring_revision WHERE id=1",
  ))!.version;
  let entries: Entry[] = [],
    sourceId = "",
    criteria: string | null = null;
  {
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
      disclosure && disclosure.criteria.trim() && disclosure.weightage.trim(),
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
        "final",
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
      stage: "final",
      count: entries.length,
    },
    d.reason,
  );
  return {
    message: "Project scores are now public.",
    releaseId,
  };
}
