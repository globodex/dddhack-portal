import { profileDescriptionChoices } from "./profile-contract";
import { demand } from "./security";
import { rows, type Database } from "./db";

export const adminGenderChoices = [
  { value: "man", label: "Male" },
  { value: "woman", label: "Female" },
  { value: "non-binary", label: "Non-binary" },
] as const;
export type AdminDemographics = { gender?: string; profession?: string };
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
  return { gender, profession };
}
export const hasDemographics = (filters: AdminDemographics) =>
  !!(filters.gender || filters.profession);
/** One correlated member must satisfy every selected answer. No inference/prefill. */
export function demographicPredicate(
  kind: "person" | "team",
  expression: string,
  filters: AdminDemographics,
) {
  const conditions = [
    kind === "person"
      ? "u_demo.id=" + expression
      : "m_demo.team_id=" + expression,
  ];
  const args: string[] = [];
  if (filters.gender) {
    conditions.push("pp_demo.gender_confirmed=1 AND p_demo.gender=?");
    args.push(filters.gender);
  }
  if (filters.profession) {
    conditions.push("pd_demo.best_description=?");
    args.push(filters.profession);
  }
  conditions.push(
    "NOT EXISTS(SELECT 1 FROM terminal_record_deletions td_demo WHERE td_demo.kind='participant' AND td_demo.target_id=u_demo.id)",
  );
  return {
    sql: !hasDemographics(filters)
      ? "1=1"
      : `EXISTS(SELECT 1 FROM users u_demo ${kind === "team" ? "JOIN memberships m_demo ON m_demo.user_id=u_demo.id" : ""}
      LEFT JOIN participant_profiles pp_demo ON pp_demo.user_id=u_demo.id
      LEFT JOIN profiles p_demo ON p_demo.user_id=u_demo.id
      LEFT JOIN profile_details pd_demo ON pd_demo.user_id=u_demo.id WHERE ${conditions.join(" AND ")})`,
    args,
  };
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
