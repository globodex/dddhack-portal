"use client";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { LockOpen, Pencil, Search, Trash2, UserRoundPlus, X } from "lucide-react";
import { ActionCancelled } from "../lib/action-confirmation";
import { readPortalView } from "../lib/portal-read";
import { portalErrorText } from "../lib/ui-feedback";
import { trapDialogFocus } from "./dialog-focus";
import { trackDialogHistory } from "./dialog-history";
import { useHydrated } from "./use-hydrated";

type Team = {
  id: string;
  name: string;
  members: unknown[];
  locked?: boolean;
  lockedAt?: string;
  unlockBlockedReason?: string;
};
type Candidate = {
  id: string;
  name: string;
  email: string;
  teamId: string | null;
  teamName: string | null;
  selectable: boolean;
  unavailableReason: string;
};
type Candidates = {
  items: Candidate[];
  page: number;
  pageSize: number;
  hasMore: boolean;
  totalRows: number;
  memberCount: number;
  maxMembers: number;
  canAdd: boolean;
  blockedReason: string;
};
export type AdminTeamRun = (
  action: string,
  values: Record<string, any>,
  options?: { errorFeedback?: "local" },
) => Promise<Record<string, any>>;

function TeamActionDialog({
  title,
  opener,
  busy,
  close,
  children,
}: {
  title: string;
  opener: HTMLElement | null;
  busy: boolean;
  close: () => void;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    closeRef = useRef(close),
    busyRef = useRef(busy),
    id = useId();
  closeRef.current = close;
  busyRef.current = busy;
  useEffect(() => {
    const popup = dialog.current;
    if (!popup) return;
    popup.showModal();
    const release = trackDialogHistory(() => {
      if (!busyRef.current) closeRef.current();
    }, opener);
    popup.querySelector<HTMLInputElement>("input")?.focus();
    return () => {
      release();
      popup.close();
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);
  return createPortal(
    <dialog
      ref={dialog}
      className="admin-team-action-dialog"
      data-action={title === "Add member" ? "add" : "rename"}
      aria-labelledby={id}
      onKeyDown={(event) => {
        event.stopPropagation();
        trapDialogFocus(event);
      }}
      onCancel={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!busyRef.current) closeRef.current();
      }}
    >
      <header>
        <h2 id={id}>{title}</h2>
        <button
          type="button"
          className="admin-toolbar-icon"
          aria-label={`Close ${title.toLowerCase()}`}
          onClick={() => {
            if (!busyRef.current) closeRef.current();
          }}
        >
          <X size={20} aria-hidden="true" />
        </button>
      </header>
      {children}
    </dialog>,
    document.body,
  );
}

export default function AdminTeamActions({
  team,
  run,
}: {
  team: Team;
  run: AdminTeamRun;
}) {
  const hydrated = useHydrated(),
    id = useId(),
    opener = useRef<HTMLElement | null>(null),
    pending = useRef(false),
    unlockButton = useRef<HTMLButtonElement>(null),
    restoreUnlockFocus = useRef(false);
  const unlockBlockedReason =
    team.unlockBlockedReason ||
    (team.locked && !team.lockedAt ? "Refresh to load this team's lock." : "");
  const [mode, setMode] = useState<"rename" | "add" | null>(null),
    [name, setName] = useState(team.name),
    [expectedName, setExpectedName] = useState(team.name),
    [query, setQuery] = useState(""),
    [page, setPage] = useState(0),
    [attempt, setAttempt] = useState(0),
    [data, setData] = useState<Candidates | null>(null),
    [loading, setLoading] = useState(false),
    [loadError, setLoadError] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState("");
  useEffect(() => {
    if (!busy && restoreUnlockFocus.current) {
      restoreUnlockFocus.current = false;
      if (unlockButton.current && !unlockButton.current.disabled)
        unlockButton.current.focus({ preventScroll: true });
    }
  }, [busy]);
  const open = (value: "rename" | "add", trigger: HTMLElement) => {
    opener.current = trigger;
    setError("");
    setLoadError("");
    setName(team.name);
    setExpectedName(team.name);
    setQuery("");
    setPage(0);
    setData(null);
    setMode(value);
  };
  useEffect(() => {
    if (mode !== "add") return;
    const controller = new AbortController();
    setLoading(true);
    setLoadError("");
    const timer = setTimeout(
      () => {
        const params = new URLSearchParams({
          view: `/admin/team-candidates/${encodeURIComponent(team.id)}`,
          q: query,
          page: String(page),
        });
        void (async () => {
          try {
            const { response, body } = await readPortalView(
              `/api/portal?${params}`,
              controller.signal,
            );
            if (!response.ok) throw new Error(portalErrorText(body));
            if (
              !Array.isArray(body.items) ||
              body.items.length > 25 ||
              typeof body.canAdd !== "boolean"
            )
              throw new Error("Participants could not be loaded. Try again.");
            if (!controller.signal.aborted) setData(body as Candidates);
          } catch (cause) {
            if (!controller.signal.aborted)
              setLoadError((cause as Error).message);
          } finally {
            if (!controller.signal.aborted) setLoading(false);
          }
        })();
      },
      query ? 200 : 0,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [mode, team.id, query, page, attempt]);
  const perform = async (
    target: string,
    action: string,
    values: Record<string, any>,
  ) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(target);
    setError("");
    try {
      await run(action, values, { errorFeedback: "local" });
      setMode(null);
    } catch (cause) {
      if (!(cause instanceof ActionCancelled))
        setError((cause as Error).message);
    } finally {
      pending.current = false;
      if (target === "unlock") restoreUnlockFocus.current = true;
      setBusy("");
    }
  };
  return (
    <>
      <div className="admin-team-menu-actions">
        <button
          type="button"
          className="button secondary"
          disabled={!hydrated || !!busy}
          onClick={(event) => open("rename", event.currentTarget)}
        >
          <Pencil size={18} aria-hidden="true" />
          Rename team
        </button>
        <button
          type="button"
          className="button secondary"
          disabled={!hydrated || !!busy}
          onClick={(event) => open("add", event.currentTarget)}
        >
          <UserRoundPlus size={18} aria-hidden="true" />
          Add member
        </button>
        {team.locked && (
          <>
            <button
              ref={unlockButton}
              type="button"
              className="button secondary"
              disabled={!hydrated || !!busy || !!unlockBlockedReason}
              aria-busy={busy === "unlock"}
              aria-describedby={unlockBlockedReason ? `${id}-unlock-blocked` : undefined}
              onClick={() => void perform("unlock", "admin-unlock-team", {
                teamId: team.id,
                expectedLockedAt: team.lockedAt,
                confirmation: "UNLOCK_TEAM",
              })}
            >
              <LockOpen size={18} aria-hidden="true" />
              {busy === "unlock" ? "Unlocking…" : "Unlock team"}
            </button>
            {unlockBlockedReason && (
              <p id={`${id}-unlock-blocked`} className="control-feedback">
                {unlockBlockedReason}
              </p>
            )}
          </>
        )}
        <button
          type="button"
          className="button secondary admin-icon-danger"
          disabled={!hydrated || !!busy}
          aria-busy={busy === "delete"}
          onClick={() => void perform("delete", "admin-delete-team", { teamId: team.id, confirmation: "DELETE_TEAM" })}
        >
          <Trash2 size={18} aria-hidden="true" />
          Delete team
        </button>
        {!mode && error && <p className="error-message" role="alert">{error}</p>}
      </div>
      {mode && (
        <TeamActionDialog
          title={mode === "rename" ? "Rename team" : "Add member"}
          opener={opener.current}
          busy={!!busy}
          close={() => setMode(null)}
        >
          <div className="admin-team-action-target">
            <strong>{team.name}</strong>
            {mode === "add" && (
              <span>
                {data?.memberCount ?? team.members.length} /{" "}
                {data?.maxMembers ?? 5} members
              </span>
            )}
          </div>
          {mode === "rename" ? (
            <form
              method="post"
              inert={!hydrated}
              onSubmit={(event) => {
                event.preventDefault();
                const value = name.trim();
                if (value.length < 2 || value.length > 80) {
                  setError("Enter a team name between 2 and 80 characters.");
                  return;
                }
                void perform("rename", "admin-rename-team", {
                  teamId: team.id,
                  name: value,
                  expectedName,
                  confirmation: "RENAME_TEAM",
                });
              }}
            >
              <label>
                <span>
                  Team name{" "}
                  <span className="required-mark" aria-hidden="true">
                    *
                  </span>
                </span>
                <input
                  autoComplete="off"
                  required
                  minLength={2}
                  maxLength={80}
                  value={name}
                  disabled={!!busy}
                  aria-invalid={!!error}
                  aria-describedby={error ? `${id}-error` : undefined}
                  onChange={(event) => {
                    setName(event.target.value);
                    setError("");
                  }}
                />
              </label>
              {error && (
                <p id={`${id}-error`} className="error-message" role="alert">
                  {error}
                </p>
              )}
              <div className="form-actions">
                <button
                  type="submit"
                  className="button"
                  disabled={
                    !hydrated ||
                    !!busy ||
                    name.trim().length < 2 ||
                    name.trim() === expectedName
                  }
                >
                  {busy ? "Renaming…" : "Rename"}
                </button>
              </div>
            </form>
          ) : (
            <>
              <label className="admin-team-candidate-search">
                <Search size={18} aria-hidden="true" />
                <span className="sr-only">Search registered participants</span>
                <input
                  type="search"
                  value={query}
                  maxLength={100}
                  placeholder="Search name or email"
                  disabled={!!busy}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setPage(0);
                  }}
                />
              </label>
              {loadError ? (
                <div role="alert" className="error-message">
                  <p>{loadError}</p>
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => setAttempt((value) => value + 1)}
                  >
                    Try again
                  </button>
                </div>
              ) : (
                <>
                  {data?.blockedReason && (
                    <p className="control-feedback" role="status">
                      {data.blockedReason}
                    </p>
                  )}
                  {loading && !data && (
                    <p className="admin-candidate-loading" role="status">
                      Loading participants…
                    </p>
                  )}
                  <ul
                    className="admin-team-candidates"
                    aria-label="Registered participants"
                    aria-busy={loading}
                  >
                    {data?.items.map((person) => (
                      <li key={person.id}>
                        <div>
                          <strong>{person.name}</strong>
                          <span>{person.email}</span>
                          <small>
                            {!data.canAdd
                              ? person.teamName || "No team"
                              : person.unavailableReason ||
                                person.teamName ||
                                "No team"}
                          </small>
                        </div>
                        <button
                          type="button"
                          className="button secondary"
                          aria-label={`Add ${person.name} to ${team.name}`}
                          disabled={
                            loading ||
                            !!busy ||
                            !data.canAdd ||
                            !person.selectable
                          }
                          onClick={() =>
                            void perform(person.id, "admin-add-team-member", {
                              teamId: team.id,
                              email: person.email,
                              confirmation: "ADD_TEAM_MEMBER",
                            })
                          }
                        >
                          {busy === person.id ? "Adding…" : "Add"}
                        </button>
                      </li>
                    ))}
                    {data && !data.items.length && !loading && (
                      <li className="admin-candidate-empty" role="status">
                        No matches
                      </li>
                    )}
                  </ul>
                  {data && (data.page > 0 || data.hasMore) && (
                    <nav
                      className="admin-team-candidate-pages"
                      aria-label="Participant pages"
                    >
                      <button
                        type="button"
                        className="button secondary"
                        disabled={loading || !!busy || !data.page}
                        onClick={() => setPage((value) => value - 1)}
                      >
                        Previous
                      </button>
                      <span>
                        {data.page * data.pageSize + 1}–
                        {Math.min(
                          (data.page + 1) * data.pageSize,
                          data.totalRows,
                        )}{" "}
                        of {data.totalRows}
                      </span>
                      <button
                        type="button"
                        className="button secondary"
                        disabled={loading || !!busy || !data.hasMore}
                        onClick={() => setPage((value) => value + 1)}
                      >
                        Next
                      </button>
                    </nav>
                  )}
                </>
              )}
              {error && (
                <p className="error-message" role="alert">
                  {error}
                </p>
              )}
            </>
          )}
        </TeamActionDialog>
      )}
    </>
  );
}
