import {ownerScoreReveal} from "./owner-score-reveal";
import {type ReleasedScoreComponents} from "./released-score-components";
import type { PortalService } from "./service";
import { rows } from "./db";
import { demand } from "./security";
type Entry = {
  projectId: string;
  versionId: string;
  teamId: string;
  score: number;
  components?: ReleasedScoreComponents;
  position?: number;
};
type Release = {
  id: string;
  stage: "ai" | "final";
  source_id: string;
  payload: string;
  criteria: string | null;
  owner_combined?: number | boolean;
};
export async function scoreState(s: PortalService) {
  const releases = await rows<Release>(
    s.db,
    "SELECT sr.*,EXISTS(SELECT 1 FROM audit_logs a WHERE a.action='reveal-scores' AND a.entity_id=sr.id) owner_combined FROM score_releases sr ORDER BY CASE stage WHEN 'final' THEN 0 ELSE 1 END",
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
  const hiddenCount=Math.min(5,entries.length);
  const legacyPending=active?.stage==="final"&&!active.owner_combined&&entries.some(entry=>!Number.isInteger(entry.position)||entry.position!<=hiddenCount&&!unveiled.some(reveal=>reveal.position===entry.position&&reveal.project_id===entry.projectId));
  return {
    active,
    entries,
    unveiled,
    stage: active?.stage || "community",
    aiRevealed: releases.some(release => release.stage === "ai"),
    complete: active?.stage === "final" && !legacyPending,
    ownerCombined: !!active?.owner_combined,
    legacyPending,
    hiddenCount,
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
    valid.some((v) => v.id === e.projectId && v.versionId === e.versionId) && (state.ownerCombined || typeof e.position==='number' && (e.position>state.hiddenCount || state.unveiled.some(reveal=>reveal.position===e.position&&reveal.project_id===e.projectId))),
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
/** Old staged confirmations promise different disclosure. Never reinterpret them as combined consent. */
export async function revealCommand(s:PortalService,action:string,input:unknown){
 const combined=await ownerScoreReveal(s,action,input);if(combined!==null)return combined;
 if(!['reveal-ai-scores','reveal-final-scores','unveil-winner','publish-results'].includes(action))return null;
 await s.staff(true);
 demand(false,409,'USE_OWNER_SCORE_REVEAL','Refresh to the updated portal and use the owner score preview and confirmation. Historical staged releases require owner review.');
 return null;
}
