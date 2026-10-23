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
  name: "person" | "upload" | "project" | "clock" | "trash";
}) {
  // Trash paths copied unchanged from the approved local Lucide source pack:
  // github.com/lucide-icons/lucide/blob/main/icons/trash.svg (Lucide / Feather).
  // Copyright (c) 2026 Lucide Icons and Contributors; 2013-present Cole Bemis.
  // Permission is hereby granted, free of charge, to any person obtaining a copy
  // of this software and associated documentation files (the "Software"), to deal
  // in the Software without restriction, including without limitation the rights
  // to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
  // copies of the Software, and to permit persons to whom the Software is
  // furnished to do so, subject to the following conditions:
  // The above copyright notice and this permission notice shall be included in
  // all copies or substantial portions of the Software.
  // THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
  // IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
  // FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
  // AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
  // LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
  // OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
  // THE SOFTWARE.
  const paths: Record<typeof name, ReactNode> = {
    trash: (
      <>
        <path d="M10 11v6" />
        <path d="M14 11v6" />
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
        <path d="M3 6h18" />
        <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      </>
    ),
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
}: {
  value?: AdminParticipantFiltersValue;
  onChange: (value: AdminParticipantFiltersValue) => void;
}) {
  const update = (patch: Partial<AdminParticipantFiltersValue>) =>
    onChange({ ...value, ...patch });
  return (
    <fieldset className="admin-control admin-participant-filters">
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
