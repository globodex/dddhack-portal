"use client";
import { useRef, useState } from "react";
import {
  BriefcaseBusiness,
  Clock3,
  Download,
  Ellipsis,
  ListFilter,
  Ticket,
  Trash2,
  Upload,
  UserPlus,
  Users,
} from "lucide-react";
import { ActionCancelled } from "../lib/action-confirmation";

export type AdminRow = Record<string, any>;
export type AdminRun = (action: string, values: AdminRow) => Promise<AdminRow>;

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
    filter: ListFilter,
    download: Download,
    users: Users,
    more: Ellipsis,
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
};
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
  const { busy, error, execute } = useAdminOperation();
  return (
    <form
      className={`admin-control admin-participant-action${compact ? " is-compact" : ""}`}
      onSubmit={(event) => {
        event.preventDefault();
        void execute(() =>
          run(
            participant.removed
              ? "participant-restore"
              : "participant-deactivate",
            participantActionValues(participant),
          ),
        );
      }}
    >
      <div className="admin-action-target">
        <strong>{participant.name}</strong>
        {participant.email && <span>{participant.email}</span>}
      </div>
      <button
        className={`button ${participant.removed ? "secondary" : "admin-icon-action admin-icon-danger"}`}
        aria-label={`${participant.removed ? "Restore participant" : "Remove participant"}: ${participant.name}${participant.email ? ` (${participant.email})` : ""}`}
        title={`${participant.removed ? "Restore" : "Remove"} ${participant.name}`}
        aria-busy={busy}
        type="submit"
        disabled={busy}
      >
        {participant.removed ? (
          busy ? (
            "Waiting…"
          ) : (
            "Restore"
          )
        ) : (
          <AdminIcon name="trash" />
        )}
      </button>
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
}: {
  value?: AdminParticipantFiltersValue;
  onChange: (value: AdminParticipantFiltersValue) => void;
  expanded?: boolean;
}) {
  const update = (patch: Partial<AdminParticipantFiltersValue>) =>
    onChange({ ...value, ...patch });
  return (
    <fieldset
      className={`admin-control admin-participant-filters${expanded ? " is-expanded" : ""}`}
    >
      <legend className="sr-only">Filter participants</legend>
      <label>
        Search
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
        Status
        <select
          value={value.status}
          onChange={(event) => update({ status: event.target.value })}
        >
          {["registered", "going", "checked in", "absent", "all"].map(
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
