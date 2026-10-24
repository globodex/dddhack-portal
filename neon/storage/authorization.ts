import { one } from "../../lib/db";
import type { PortalService } from "../../lib/service";
import { demand } from "../../lib/security";
import { requireSubmissionAccess } from "../../lib/team-access";
import type { MediaAuthorizer } from "./types";

/** Uses the same participant / leader / checked-in gates as project save and submit. */
export function createPortalMediaAuthorizer(
  service: PortalService,
): MediaAuthorizer {
  return async (actorId, { teamId, revision }) => {
    const { u, t } = await service.lead();
    demand(u.id === actorId && t.id === teamId, 403, "LEADER_REQUIRED");
    demand(
      u.canParticipate && !u.deactivated,
      403,
      "PARTICIPANT_PROFILE_REQUIRED",
    );
    await service.unfrozen();
    const access = await requireSubmissionAccess(service, teamId);
    demand(!access.locked, 409, "PROJECT_LOCKED_AFTER_THIRD_SUBMISSION");
    const project = await one<{ revision: number }>(
      service.db,
      "SELECT revision FROM projects WHERE team_id=?",
      teamId,
    );
    demand(
      (project?.revision ?? 0) === revision,
      409,
      "PROJECT_CHANGED_RELOAD",
    );
  };
}
