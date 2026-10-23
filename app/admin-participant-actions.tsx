"use client";
import { useRef, useState, type ReactNode } from "react";
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
  name: "person" | "upload" | "project" | "clock";
}) {
  const paths: Record<typeof name, ReactNode> = {
    person: (
      <>
        <circle cx="12" cy="7" r="4" />
        <path d="M4 21v-2a8 8 0 0 1 16 0v2M19 3v6m-3-3h6" />
      </>
    ),
    upload: (
      <>
        <path d="M12 16V3m-5 5 5-5 5 5M4 15v5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5" />
      </>
    ),
    project: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M8 5V3h8v2M3 11h18M9 15h6" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
  };
  return (
    <svg
      className="admin-control-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
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
  reason: string,
) {
  if (!participant.id || !reason.trim())
    throw new Error("A participant and audit reason are required.");
  return {
    userId: participant.id,
    reason: reason.trim(),
    confirmation: participant.removed
      ? "RESTORE_PARTICIPANT"
      : "REMOVE_PARTICIPANT",
  };
}

export default function AdminParticipantActions({
  participant,
  run,
}: {
  participant: AdminParticipantTarget;
  run: AdminRun;
}) {
  const [reason, setReason] = useState("");
  const { busy, error, execute } = useAdminOperation();
  return (
    <form
      className="admin-control admin-participant-action"
      onSubmit={(event) => {
        event.preventDefault();
        void execute(() =>
          run(
            participant.removed
              ? "participant-restore"
              : "participant-deactivate",
            participantActionValues(participant, reason),
          ),
        );
      }}
    >
      <h3>
        <AdminIcon name="person" />
        {participant.removed ? "Restore participant" : "Remove participant"}
      </h3>
      <p>
        <strong>{participant.name}</strong>
        {participant.email && <> · {participant.email}</>}
      </p>
      <p className="admin-control-note">
        {participant.removed
          ? "Restore this account’s roster eligibility. History stays intact; the server rechecks team and access rules."
          : "Remove this person’s participation and revoke their sessions, private team access and credits access. History is preserved and removal is recoverable. Protected accounts and leadership dependencies may block removal."}
      </p>
      <fieldset disabled={busy}>
        <label>
          <span>
            Audit reason <span aria-hidden="true">*</span>
          </span>
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            required
            maxLength={1000}
            rows={2}
          />
        </label>
        <button
          className={`button ${participant.removed ? "secondary" : "admin-control-danger"}`}
          type="submit"
          disabled={!reason.trim() || busy}
        >
          {busy
            ? "Waiting…"
            : participant.removed
              ? "Review restoration"
              : "Review removal"}
        </button>
      </fieldset>
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

export type AdminParticipantFiltersValue = {
  status: string;
  team:
    | "locked"
    | "forming"
    | "not submitted"
    | "submitted"
    | "unlocked"
    | "none"
    | "all";
  individual: string;
  teamQuery: string;
};
export const defaultAdminParticipantFilters: AdminParticipantFiltersValue = {
  status: "registered",
  team: "locked",
  individual: "",
  teamQuery: "",
};
export type FilterableAdminParticipant = AdminParticipantTarget & {
  status?: string;
  teamId?: string | null;
  teamName?: string | null;
  teamLocked?: boolean;
  teamLockedAt?: string | null;
  teamStatus?: string | null;
};
export function filterAdminParticipants<T extends FilterableAdminParticipant>(
  rows: readonly T[],
  filters: AdminParticipantFiltersValue = defaultAdminParticipantFilters,
): T[] {
  const normalize = (value: string) => value.trim().toLocaleLowerCase("en");
  return rows
    .filter((row) => {
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
        ["forming", "not submitted", "submitted"].includes(filters.team) &&
        normalize(row.teamStatus || "") !== filters.team
      )
        return false;
      if (filters.team === "unlocked" && (!row.teamId || row.teamLocked))
        return false;
      if (filters.team === "none" && row.teamId) return false;
      if (
        filters.individual &&
        !normalize(`${row.name} ${row.email || ""}`).includes(
          normalize(filters.individual),
        )
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
      const time = (row: T) =>
        row.teamLockedAt && Number.isFinite(Date.parse(row.teamLockedAt))
          ? Date.parse(row.teamLockedAt)
          : Infinity;
      const delta = time(a) - time(b);
      return (
        (Number.isNaN(delta) ? 0 : delta) ||
        a.name.localeCompare(b.name) ||
        a.id.localeCompare(b.id)
      );
    });
}

export function AdminParticipantFilters({
  value = defaultAdminParticipantFilters,
  onChange,
}: {
  value?: AdminParticipantFiltersValue;
  onChange: (value: AdminParticipantFiltersValue) => void;
}) {
  const update = (patch: Partial<AdminParticipantFiltersValue>) =>
    onChange({ ...value, ...patch });
  return (
    <fieldset className="admin-control admin-participant-filters">
      <legend>Filter participants</legend>
      <label>
        Individual
        <input
          type="search"
          value={value.individual}
          onChange={(event) => update({ individual: event.target.value })}
          placeholder="Name or email"
        />
      </label>
      <label>
        Team name
        <input
          type="search"
          value={value.teamQuery}
          onChange={(event) => update({ teamQuery: event.target.value })}
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
        Team membership
        <select
          value={value.team}
          onChange={(event) =>
            update({
              team: event.target.value as AdminParticipantFiltersValue["team"],
            })
          }
        >
          <option value="locked">Locked teams</option>
          <option value="forming">Forming teams</option>
          <option value="not submitted">Not submitted teams</option>
          <option value="submitted">Submitted teams</option>
          <option value="unlocked">Unlocked teams</option>
          <option value="none">Not in a team</option>
          <option value="all">All people</option>
        </select>
      </label>
      <p className="admin-control-note">
        Filters combine. Ordered by earliest team lock; unknown lock times
        follow known times.
      </p>
    </fieldset>
  );
}
