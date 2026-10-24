"use client";
import { useHydrated } from "./use-hydrated";
import { useRef, useState } from "react";
import {
  BriefcaseBusiness,
  Check,
  Clock3,
  Download,
  EllipsisVertical,
  ListFilter,
  Search,
  Ticket,
  Trash2,
  Upload,
  UserPlus,
  Users,
} from "lucide-react";
import { ActionCancelled } from "../lib/action-confirmation";

export type AdminRow = Record<string, any>;
export type AdminRun = (action: string, values: AdminRow, options?: { errorFeedback?: "local" }) => Promise<AdminRow>;

/** Shared by these controls; run owns confirmation, mutation outcome and reload. */
export function useAdminOperation() {
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function execute(operation: () => Promise<unknown>) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await operation();
    } catch (cause) {
      if (!(cause instanceof ActionCancelled))
        setError(
          cause instanceof Error ? cause.message : "The request failed.",
        );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return { busy, error, execute, clearError: () => setError("") };
}

export function AdminIcon({
  name,
}: {
  name:
    | "trash"
    | "person"
    | "upload"
    | "project"
    | "clock"
    | "check"
    | "filter"
    | "download"
    | "users"
    | "more"
    | "ticket";
}) {
  const Component = {
    trash: Trash2,
    person: UserPlus,
    upload: Upload,
    project: BriefcaseBusiness,
    clock: Clock3,
    check: Check,
    filter: ListFilter,
    download: Download,
    users: Users,
    more: EllipsisVertical,
    ticket: Ticket,
  }[name];
  return (
    <Component
      className="admin-control-icon"
      size={20}
      strokeWidth={1.8}
      aria-hidden="true"
      focusable="false"
    />
  );
}

export type AdminParticipantTarget = {
  id: string;
  name: string;
  email?: string;
  removed?: boolean;
  canDelete?: boolean;
  teamId?: string | null;
  teamName?: string | null;
  teamLeader?: boolean;
  leaderTeamIds?: string[];
  leaderTeamNames?: string[];
};
export function participantDeleteValues(participant: AdminParticipantTarget) {
  if (!participant.id) throw new Error("Choose a participant.");
  return {
    userId: participant.id,
    expectedLeaderTeamIds: participant.leaderTeamIds || (participant.teamLeader && participant.teamId ? [participant.teamId] : []),
    confirmation: "DELETE_PARTICIPANT",
  };
}
export function participantActionValues(
  participant: AdminParticipantTarget,
  reason = "",
) {
  if (!participant.id) throw new Error("Choose a participant.");
  return {
    userId: participant.id,
    ...(reason.trim() ? { reason: reason.trim() } : {}),
    confirmation: participant.removed
      ? "RESTORE_PARTICIPANT"
      : "REMOVE_PARTICIPANT",
  };
}

export default function AdminParticipantActions({
  participant,
  run,
  compact = false,
}: {
  participant: AdminParticipantTarget;
  run: AdminRun;
  compact?: boolean;
}) {
  const hydrated = useHydrated();
  const { busy, error, execute } = useAdminOperation();
  return (
    <form
      method="post"
      inert={!hydrated}
      data-hydrated={hydrated}
      className={`admin-control admin-participant-action${compact ? " is-compact" : ""}`}
      onSubmit={(event) => {
        event.preventDefault();
        if (participant.canDelete !== false) void execute(() => run("admin-delete-participant", {
          ...participantDeleteValues(participant),
          participantDeleteSummary: {
            teamCount: participant.leaderTeamIds?.length ?? (participant.teamLeader ? 1 : 0),
            teamNames: participant.leaderTeamNames || (participant.teamName && participant.teamLeader ? [participant.teamName] : []),
            memberTeamName: participant.teamName || "",
          },
        }, { errorFeedback: "local" }));
      }}
    >
      <div className="admin-action-target">
        <strong>{participant.name}</strong>
        {participant.email && <span>{participant.email}</span>}
      </div>
      {participant.removed && <button
        type="button"
        className="button secondary"
        disabled={busy || !hydrated}
        onClick={() => void execute(() => run("participant-restore", participantActionValues(participant), { errorFeedback: "local" }))}
      >Restore</button>}
      {participant.canDelete !== false && <button
        className="button admin-icon-action admin-icon-danger"
        aria-label={`Delete participant: ${participant.name}${participant.email ? ` (${participant.email})` : ""}`}
        title={`Delete ${participant.name}`}
        aria-busy={busy}
        type="submit"
        disabled={busy || !hydrated}
      >
        <AdminIcon name="trash" />
      </button>}
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

export {
  filterParticipants as filterAdminParticipants,
  defaultParticipantFilters as defaultAdminParticipantFilters,
} from "../lib/participant-filters";
export type {
  ParticipantFilters as AdminParticipantFiltersValue,
  ParticipantFilterRow as FilterableAdminParticipant,
} from "../lib/participant-filters";
import {
  defaultParticipantFilters as defaultAdminParticipantFilters,
  type ParticipantFilters as AdminParticipantFiltersValue,
} from "../lib/participant-filters";

export function AdminParticipantFilters({
  value = defaultAdminParticipantFilters,
  onChange,
  expanded = false,
  showUnregistered = false,
}: {
  value?: AdminParticipantFiltersValue;
  onChange: (value: AdminParticipantFiltersValue) => void;
  expanded?: boolean;
  showUnregistered?: boolean;
}) {
  const update = (patch: Partial<AdminParticipantFiltersValue>) =>
    onChange({ ...value, ...patch });
  return (
    <fieldset
      className={`admin-control admin-participant-filters${expanded ? " is-expanded" : ""}`}
    >
      <legend className="sr-only">Filter participants</legend>
      <label className="admin-filter-search">
        <span className="sr-only">Search</span>
        <Search size={20} aria-hidden="true" className="admin-search-glyph" />
        <input
          type="search"
          value={value.individual}
          onChange={(event) =>
            update({ individual: event.target.value, teamQuery: "" })
          }
          placeholder="Name, email or team"
        />
      </label>
      <label>
        Personal status
        <select
          aria-label="Personal status"
          value={value.status}
          onChange={(event) => update({ status: event.target.value, ...(event.target.value === "not registered" ? { team: "all" } : {}) })}
        >
          {[...(showUnregistered ? ["not registered"] : []), "registered", "going", "checked in", "absent", "all"].map(
            (status) => (
              <option key={status} value={status}>
                {status === "checked in"
                  ? "Checked in"
                  : status === "all"
                    ? "All statuses"
                    : status[0].toUpperCase() + status.slice(1)}
              </option>
            ),
          )}
        </select>
      </label>
      <label>
        Team status
        <select
          aria-label="Team status"
          value={value.team}
          onChange={(event) =>
            update({
              team: event.target.value as AdminParticipantFiltersValue["team"],
            })
          }
        >
          <option value="locked">Locked</option>
          <option value="forming">Forming</option>
          <option value="not submitted">Not submitted</option>
          <option value="submitted">Submitted</option>
          <option value="unlocked">Unlocked</option>
          <option value="none">Not in a team</option>
          <option value="all">All people</option>
        </select>
      </label>
    </fieldset>
  );
}
