import { one } from "./db";
import { demand, sha256 } from "./security";
import type { PortalService } from "./service";

/** Same readiness is recomputed for preview and confirmation; no date closes judging. */
export async function freezeReadiness(service: PortalService) {
  const actor = await service.staff(true);
  await service.unfrozen();
  const settings = await service.live();
  const before = await one<{ version: number }>(service.db, "SELECT version FROM scoring_revision WHERE id=1");
  const result = await service.compute();
  demand(result.length > 0, 409, "NO_RESULTS");
  const after = await one<{ version: number }>(service.db, "SELECT version FROM scoring_revision WHERE id=1");
  demand(!!before && !!after && before.version === after.version, 409, "SCORING_CHANGED_RETRY", "Scores changed while preparing the preview. Preview again.");
  return { actor, settings, revision: before!.version, result };
}
export async function freezePreviewToken(state: Awaited<ReturnType<typeof freezeReadiness>>, expiresAt: string) {
  return sha256(JSON.stringify({actor:state.actor.id, policyVersion:state.settings.version, sourceRevision:state.revision, scores:state.result, expiresAt}));
}
export async function previewResultFreeze(service: PortalService) {
  const state = await freezeReadiness(service);
  const expiresAt = new Date(Date.parse(service.now()) + 5 * 60_000).toISOString();
  return {
    token: await freezePreviewToken(state, expiresAt), expiresAt,
    policyVersion: state.settings.version, sourceRevision: state.revision,
    projects: state.result.length,
    eligibleProjects: state.result.filter(entry => entry.eligibility === "eligible").length,
    warnings: ["Freezing ends judging, evaluation and submission edits even if the participant submission window is still open.", "Frozen scores cannot be edited. Later permitted community activity does not change this snapshot.", "This does not reveal results. Public reveal remains a separate action."],
    message: "Readiness preview only. Nothing was frozen or revealed.",
  };
}
