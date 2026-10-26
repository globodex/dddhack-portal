"use client";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ListFilter, X } from "lucide-react";
import {
  adminGenderChoices,
  adminParticipantStatuses,
  adminTeamStatuses,
  type AdminDemographics,
} from "../lib/admin-filter-options";
import { profileDescriptionChoices } from "../lib/profile-contract";
import { trapDialogFocus } from "./dialog-focus";
import { trackDialogHistory } from "./dialog-history";
import { useHydrated } from "./use-hydrated";
export type AdminDemographicControls = {
  value: AdminDemographics;
  onChange: (value: AdminDemographics) => void;
  pending?: boolean;
};
export const emptyAdminFilters: AdminDemographics = {
  participantStatus: "",
  teamStatus: "",
  gender: "",
  profession: "",
};
export default function AdminDemographicFilters({
  value,
  onChange,
  pending,
  participants = false,
}: AdminDemographicControls & { participants?: boolean }) {
  const hydrated = useHydrated(),
    id = useId(),
    trigger = useRef<HTMLButtonElement>(null),
    dialog = useRef<HTMLDialogElement>(null),
    applying = useRef(false),
    restoreAfterApply = useRef(false);
  const [open, setOpen] = useState(false),
    [draft, setDraft] = useState<AdminDemographics>(value);
  const count = [
    value.participantStatus,
    value.teamStatus,
    value.gender,
    value.profession,
  ].filter(Boolean).length;
  useEffect(() => {
    if (!open || !dialog.current) return;
    const popup = dialog.current,
      opener = trigger.current;
    const root = document.documentElement,
      body = document.body;
    const previous = {
      root: root.style.overflow,
      body: body.style.overflow,
      gutter: root.style.scrollbarGutter,
    };
    if (innerWidth > root.clientWidth) root.style.scrollbarGutter = "stable";
    root.style.overflow = "hidden";
    body.style.overflow = "hidden";
    popup.showModal();
    const position = () => {
      if (innerWidth <= 600) {
        popup.style.left = "";
        popup.style.top = "";
        return;
      }
      const anchor = opener!.getBoundingClientRect(),
        bounds = popup.getBoundingClientRect();
      popup.style.left = `${Math.max(16, Math.min(anchor.right - bounds.width, innerWidth - bounds.width - 16))}px`;
      popup.style.top = `${Math.max(16, Math.min(anchor.bottom + 8, innerHeight - bounds.height - 16))}px`;
    };
    position();
    window.addEventListener("resize", position);
    popup
      .querySelector<HTMLButtonElement>('[aria-label="Close filters"]')
      ?.focus();
    const stopHistory = trackDialogHistory(() => setOpen(false), opener);
    return () => {
      stopHistory();
      window.removeEventListener("resize", position);
      popup.close();
      root.style.overflow = previous.root;
      body.style.overflow = previous.body;
      root.style.scrollbarGutter = previous.gutter;
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [open]);
  useEffect(() => {
    if (
      restoreAfterApply.current &&
      !pending &&
      !open &&
      trigger.current &&
      !trigger.current.disabled
    ) {
      restoreAfterApply.current = false;
      trigger.current.focus({ preventScroll: true });
    }
  }, [pending, open]);
  function apply(next: AdminDemographics) {
    if (applying.current) return;
    applying.current = true;
    restoreAfterApply.current = true;
    onChange(next);
    setOpen(false);
  }
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="admin-filter-trigger"
        aria-label={`Filters${count ? ` (${count} active)` : ""}`}
        title="Filters"
        aria-haspopup="dialog"
        aria-controls={id}
        aria-expanded={open}
        disabled={!hydrated || pending}
        onClick={() => {
          setDraft({ ...emptyAdminFilters, ...value });
          applying.current = false;
          setOpen(true);
        }}
      >
        <ListFilter size={20} aria-hidden="true" />
        {count > 0 && <span aria-hidden="true">{count}</span>}
      </button>
      {open &&
        createPortal(
          <dialog
            ref={dialog}
            id={id}
            className="admin-filter-popover"
            aria-labelledby={`${id}-title`}
            onKeyDown={(event) => trapDialogFocus(event)}
            onCancel={(event) => {
              event.preventDefault();
              setOpen(false);
            }}
            onClick={(event) => {
              if (event.target !== event.currentTarget) return;
              const rect = event.currentTarget.getBoundingClientRect();
              if (
                event.clientX < rect.left ||
                event.clientX > rect.right ||
                event.clientY < rect.top ||
                event.clientY > rect.bottom
              )
                setOpen(false);
            }}
          >
            <header>
              <h2 id={`${id}-title`}>Filters</h2>
              <button
                type="button"
                aria-label="Close filters"
                onClick={() => setOpen(false)}
              >
                <X size={20} aria-hidden="true" />
              </button>
            </header>
            <div className="admin-filter-fields">
              <label>
                Participant status
                <select
                  aria-label="Participant status"
                  value={draft.participantStatus || ""}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      participantStatus: event.target.value,
                    })
                  }
                >
                  <option value="">All statuses</option>
                  {adminParticipantStatuses.map((status) => (
                    <option key={status} value={status}>
                      {status === "Checked in" ? "Checked-in" : status}
                    </option>
                  ))}
                  {participants && (
                    <option value="Not registered">Not registered</option>
                  )}
                </select>
              </label>
              <label>
                Team status
                <select
                  aria-label="Team status"
                  value={draft.teamStatus || ""}
                  onChange={(event) =>
                    setDraft({ ...draft, teamStatus: event.target.value })
                  }
                >
                  <option value="">All teams</option>
                  {adminTeamStatuses.map((status) => (
                    <option key={status}>{status}</option>
                  ))}
                  {participants && <option value="none">No team</option>}
                </select>
              </label>
              <label>
                Sex
                <select
                  aria-label="Sex"
                  value={draft.gender || ""}
                  onChange={(event) =>
                    setDraft({ ...draft, gender: event.target.value })
                  }
                >
                  <option value="">All</option>
                  {adminGenderChoices.map((choice) => (
                    <option key={choice.value} value={choice.value}>
                      {choice.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Profession
                <select
                  aria-label="Profession"
                  value={draft.profession || ""}
                  onChange={(event) =>
                    setDraft({ ...draft, profession: event.target.value })
                  }
                >
                  <option value="">All professions</option>
                  {profileDescriptionChoices.map((choice) => (
                    <option key={choice}>{choice}</option>
                  ))}
                </select>
              </label>
            </div>
            <footer>
              <button
                type="button"
                className="button secondary"
                onClick={() => apply({ ...emptyAdminFilters })}
              >
                Clear
              </button>
              <button
                type="button"
                className="button"
                onClick={() => apply(draft)}
              >
                Apply
              </button>
            </footer>
          </dialog>,
          document.body,
        )}
    </>
  );
}
