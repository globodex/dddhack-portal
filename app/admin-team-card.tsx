"use client";
import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { useHydrated } from "./use-hydrated";

export default function AdminTeamCard({
  name,
  avatar,
  caption,
  menu,
  defaultOpen,
  children,
}: {
  name: string;
  avatar: ReactNode;
  caption: ReactNode;
  menu: ReactNode;
  defaultOpen: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  const hydrated = useHydrated();
  return (
    <li className="admin-team-card" data-expanded={open} data-hydrated={hydrated}>
      <header className="admin-team-card-header">
        <button
          type="button"
          className="admin-team-card-toggle"
          aria-label={`Toggle ${name} details`}
          aria-expanded={open}
          aria-controls={id}
          disabled={!hydrated}
          onClick={() => setOpen((value) => !value)}
        >
          {avatar}
          <span className="admin-team-card-identity">
            <strong>{name}</strong>
            <small>{caption}</small>
          </span>
          <ChevronDown
            className="admin-team-card-chevron"
            size={20}
            aria-hidden="true"
          />
        </button>
        <div className="admin-team-card-menu" inert={!hydrated}>{menu}</div>
      </header>
      <div id={id} className="admin-team-card-body" hidden={!open}>
        {children}
      </div>
    </li>
  );
}
