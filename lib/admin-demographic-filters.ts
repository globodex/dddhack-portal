import { memberStatusSQL, teamStatusSQL } from "./admin-filter-status";
import { profileDescriptionChoices } from "./profile-contract";
import { demand } from "./security";
import { rows, type Database } from "./db";

import {
  adminGenderChoices,
  adminParticipantStatuses,
  adminTeamStatuses,
  type AdminDemographics,
} from "./admin-filter-options";
export {
  adminGenderChoices,
  adminParticipantStatuses,
  adminTeamStatuses,
} from "./admin-filter-options";
export type { AdminDemographics } from "./admin-filter-options";
export function adminDemographics(input: AdminDemographics): AdminDemographics {
  const gender = input.gender || "",
    profession = input.profession || "";
  demand(
    !gender || adminGenderChoices.some((choice) => choice.value === gender),
    422,
    "INVALID_GENDER_FILTER",
  );
  demand(
    !profession || profileDescriptionChoices.includes(profession),
    422,
    "INVALID_PROFESSION_FILTER",
  );
  const participantStatus = input.participantStatus || "",
    teamStatus = input.teamStatus || "";
  demand(
    !participantStatus ||
      [...adminParticipantStatuses, "Not registered"].includes(
        participantStatus,
      ),
    422,
    "INVALID_PARTICIPANT_STATUS_FILTER",
  );
  demand(
    !teamStatus || [...adminTeamStatuses, "none"].includes(teamStatus),
    422,
    "INVALID_TEAM_STATUS_FILTER",
  );
  const teamSize = input.teamSize || "";
  demand(!teamSize || /^[1-5]$/.test(teamSize), 422, "INVALID_TEAM_SIZE_FILTER");
  return { gender, profession, participantStatus, teamStatus, teamSize };
}
export const hasDemographics = (filters: AdminDemographics) =>
  !!(
    filters.gender ||
    filters.profession ||
    filters.participantStatus ||
    filters.teamStatus ||
    filters.teamSize
  );
/** One correlated member must satisfy every selected answer. No inference/prefill. */
export function demographicPredicate(
  kind: "person" | "team",
  expression: string,
  filters: AdminDemographics,
  windowOpened = false,
) {
  const conditions = [
    kind === "person"
      ? "u_demo.id=" + expression
      : "m_demo.team_id=" + expression,
  ];
  const args: (string | number)[] = [];
  if (filters.gender) {
    conditions.push("pp_demo.gender_confirmed=1 AND p_demo.gender=?");
    args.push(filters.gender);
  }
  if (filters.profession) {
    conditions.push("pd_demo.best_description=?");
    args.push(filters.profession);
  }
  if (filters.participantStatus) {
    conditions.push(
      filters.participantStatus === "Not registered"
        ? "1=0"
        : `${memberStatusSQL("u_demo.id")}=?`,
    );
    if (filters.participantStatus !== "Not registered")
      args.push(filters.participantStatus);
  }
  conditions.push(
    "NOT EXISTS(SELECT 1 FROM terminal_record_deletions td_demo WHERE td_demo.kind='participant' AND td_demo.target_id=u_demo.id)",
  );
  const memberFilters = !!(
    filters.gender ||
    filters.profession ||
    filters.participantStatus
  );
  const memberSQL = !memberFilters
    ? "1=1"
    : `EXISTS(SELECT 1 FROM users u_demo ${kind === "team" ? "JOIN memberships m_demo ON m_demo.user_id=u_demo.id" : ""}
    LEFT JOIN participant_profiles pp_demo ON pp_demo.user_id=u_demo.id
    LEFT JOIN profiles p_demo ON p_demo.user_id=u_demo.id
    LEFT JOIN profile_details pd_demo ON pd_demo.user_id=u_demo.id WHERE ${conditions.join(" AND ")})`;
  const teamId =
    kind === "team"
      ? expression
      : `(SELECT team_id FROM memberships WHERE user_id=${expression})`;
  const teamSQL = !filters.teamStatus
    ? "1=1"
    : filters.teamStatus === "none"
      ? `${teamId} IS NULL`
      : `${teamId} IS NOT NULL AND ${teamStatusSQL(teamId, windowOpened)}=?`;
  if (filters.teamStatus && filters.teamStatus !== "none")
    args.push(filters.teamStatus);
  const sizeSQL = filters.teamSize
    ? `(SELECT count(*) FROM memberships size_m JOIN users size_u ON size_u.id=size_m.user_id WHERE size_m.team_id=${teamId})=?`
    : "1=1";
  if (filters.teamSize) args.push(Number(filters.teamSize));
  return { sql: `(${memberSQL}) AND (${teamSQL}) AND (${sizeSQL})`, args };
}
export async function matchingDemographicPeople(
  db: Database,
  filters: AdminDemographics,
) {
  const predicate = demographicPredicate("person", "u.id", filters);
  return new Set(
    (
      await rows<{ id: string }>(
        db,
        `SELECT u.id FROM users u WHERE ${predicate.sql}`,
        ...predicate.args,
      )
    ).map((row) => row.id),
  );
}

/** Participant rows already carry authoritative statuses and include roster emails without accounts. */
export function matchesAdminParticipant(
  row: Record<string, any>,
  filters: AdminDemographics,
) {
  const teamId = row.team_id ?? row.teamId;
  return (
    (!filters.participantStatus || row.status === filters.participantStatus) &&
    (!filters.teamStatus ||
      (filters.teamStatus === "none"
        ? !teamId
        : row.teamStatus === filters.teamStatus))
  );
}
