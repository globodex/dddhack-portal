/** Shared table/export semantics. Only names, email and team name are searchable. */
export type ParticipantFilters = {
  status: string;
  team:
    | "locked"
    | "forming"
    | "approved"
    | "yet to submit"
    | "not submitted"
    | "submitted"
    | "unlocked"
    | "none"
    | "all";
  individual: string;
  teamQuery: string;
};
export const defaultParticipantFilters: ParticipantFilters = {
  status: "registered",
  team: "locked",
  individual: "",
  teamQuery: "",
};
export type ParticipantFilterRow = {
  id: string;
  name: string;
  email?: string;
  status?: string;
  teamId?: string | null;
  teamName?: string | null;
  teamLocked?: boolean;
  teamLockedAt?: string | null;
  teamStatus?: string | null;
  removed?: boolean;
};
export type ParticipantRecordState = "active" | "removed" | "all";
const normalize = (value: string) => value.trim().toLocaleLowerCase("en");
export function filterParticipants<T extends ParticipantFilterRow>(
  data: readonly T[],
  filters: ParticipantFilters = defaultParticipantFilters,
  records: ParticipantRecordState = "all",
): T[] {
  return data
    .filter((row) => {
      if (
        records !== "all" &&
        (records === "removed" ? !row.removed : !!row.removed)
      )
        return false;
      if (
        filters.status !== "all" &&
        normalize(row.status || "") !== normalize(filters.status)
      )
        return false;
      if (
        filters.team === "locked" &&
        (!row.teamId ||
          (row.teamStatus
            ? normalize(row.teamStatus) !== "locked"
            : !row.teamLocked))
      )
        return false;
      if (
        ["forming", "approved", "yet to submit", "not submitted", "submitted"].includes(filters.team) &&
        normalize(row.teamStatus || "") !== filters.team
      )
        return false;
      if (filters.team === "unlocked" && (!row.teamId || row.teamLocked))
        return false;
      if (filters.team === "none" && row.teamId) return false;
      if (
        filters.individual &&
        !normalize(
          `${row.name} ${row.email || ""} ${row.teamName || ""}`,
        ).includes(normalize(filters.individual))
      )
        return false;
      if (
        filters.teamQuery &&
        !normalize(row.teamName || "").includes(normalize(filters.teamQuery))
      )
        return false;
      return true;
    })
    .sort((a, b) => {
      const time = (r: T) =>
        r.teamLockedAt && Number.isFinite(Date.parse(r.teamLockedAt))
          ? Date.parse(r.teamLockedAt)
          : Infinity;
      const delta = time(a) - time(b);
      return (
        (Number.isNaN(delta) ? 0 : delta) ||
        a.name.localeCompare(b.name) ||
        a.id.localeCompare(b.id) ||
        (a.email || "").localeCompare(b.email || "")
      );
    });
}
export function participantExportHref(
  filters: ParticipantFilters,
  recordState: ParticipantRecordState,
) {
  const params = new URLSearchParams({
    list: "participants",
    status: filters.status,
    team: filters.team,
    individual: filters.individual,
    teamQuery: filters.teamQuery,
    recordState,
    scope: "all",
  });
  return "/api/export?" + params.toString();
}
