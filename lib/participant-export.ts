import { z } from "zod";
import { csvCell, demand } from "./security";
import {
  filterParticipants,
  type ParticipantFilterRow,
} from "./participant-filters";
const parameters = z.object({
  status: z
    .enum(["all", "registered", "going", "checked in", "absent"])
    .default("all"),
  team: z
    .enum([
      "all",
      "locked",
      "forming",
      "not submitted",
      "submitted",
      "unlocked",
      "none",
    ])
    .default("all"),
  individual: z.string().trim().max(200).default(""),
  teamQuery: z.string().trim().max(200).default(""),
  recordState: z.enum(["all", "active", "removed"]).default("all"),
  scope: z.enum(["all", "page"]).default("all"),
  page: z.coerce.number().int().min(0).max(1000000).default(0),
  pageSize: z.coerce.number().int().min(1).max(250).default(50),
});
export type ParticipantExportRow = ParticipantFilterRow & {
  email: string;
  checkedIn: boolean;
  checkedInAt: string;
  submissionCount: number;
  recordState: "active" | "removed";
};
export const participantExportColumns = [
  "id",
  "name",
  "email",
  "status",
  "teamId",
  "teamName",
  "teamStatus",
  "teamLocked",
  "teamLockedAt",
  "checkedIn",
  "checkedInAt",
  "submissionCount",
  "recordState",
] as const;
/** A positive projection: never serialize the management row or nested values. */
export function exportParticipant(
  row: Record<string, unknown>,
): ParticipantExportRow {
  const text = (key: string, legacy?: string) =>
    typeof row[key] === "string"
      ? (row[key] as string)
      : legacy && typeof row[legacy] === "string"
        ? (row[legacy] as string)
        : "";
  return {
    id: text("id"),
    name: text("name") || text("email") || "Not signed in yet",
    email: text("email"),
    status: text("status"),
    teamId: text("teamId", "team_id"),
    teamName: text("teamName", "team_name"),
    teamStatus: text("teamStatus"),
    teamLocked: row.teamLocked === true,
    teamLockedAt: text("teamLockedAt"),
    checkedIn: text("status").toLowerCase() === "checked in",
    checkedInAt:
      /^\d{4}-\d{2}-\d{2}T/.test(text("checkedInAt", "checked_in")) &&
      Number.isFinite(Date.parse(text("checkedInAt", "checked_in")))
        ? new Date(text("checkedInAt", "checked_in")).toISOString()
        : "",
    submissionCount:
      typeof row.submitted === "number" &&
      Number.isSafeInteger(row.submitted) &&
      row.submitted >= 0
        ? row.submitted
        : 0,
    recordState: row.deactivated_at ? "removed" : "active",
    removed: !!row.deactivated_at,
  };
}
export function participantExportSelection(
  raw: readonly Record<string, unknown>[],
  params: URLSearchParams,
) {
  const unique = [
    "status",
    "team",
    "individual",
    "teamQuery",
    "recordState",
    "scope",
    "page",
    "pageSize",
  ];
  for (const key of unique)
    demand(params.getAll(key).length <= 1, 422, "DUPLICATE_EXPORT_FILTER");
  const value = Object.fromEntries(
    unique
      .filter((key) => params.has(key))
      .map((key) => [key, params.get(key)!]),
  );
  if (typeof value.status === "string")
    value.status = value.status.toLocaleLowerCase("en").trim();
  if (typeof value.team === "string")
    value.team = value.team.toLocaleLowerCase("en").trim();
  // Retain the old q/teamStatus/lock links only as explicit, narrow aliases.
  if (!params.has("individual") && params.has("q"))
    value.individual = params.get("q")!;
  if (!params.has("team") && params.has("teamStatus"))
    value.team = params.get("teamStatus")!.toLocaleLowerCase("en").trim();
  if (!params.has("team") && !params.has("teamStatus") && params.has("lock"))
    value.team = params.get("lock")!;
  const filters = parameters.parse(value),
    all = filterParticipants(
      raw.map(exportParticipant),
      filters,
      filters.recordState,
    );
  const offset = filters.scope === "page" ? filters.page * filters.pageSize : 0;
  const rows =
    filters.scope === "page"
      ? all.slice(offset, offset + filters.pageSize)
      : all;
  return {
    rows,
    total: all.length,
    exported: rows.length,
    scope: filters.scope,
    page: filters.page,
    pageSize: filters.pageSize,
    filters,
  };
}
export function participantCSV(rows: readonly ParticipantExportRow[]) {
  return [
    participantExportColumns.map(csvCell).join(","),
    ...rows.map((row) =>
      participantExportColumns.map((key) => csvCell(row[key])).join(","),
    ),
  ].join("\r\n");
}
