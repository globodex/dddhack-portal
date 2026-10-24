"use client";

import { useEffect, useState } from "react";
import {
  BriefcaseBusiness,
  FileText,
  House,
  LayoutDashboard,
  Menu,
  ShieldCheck,
} from "lucide-react";
import MobileNavigation from "./mobile-navigation";

export default function InformationNavigation({ path }: { path: string }) {
  const [open, setOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const destinations = [
    { href: "/", label: "Home", Icon: House },
    { href: "/projects", label: "Projects", Icon: BriefcaseBusiness },
    { href: "/dashboard", label: "Dashboard", Icon: LayoutDashboard },
    { href: "/privacy", label: "Privacy", Icon: ShieldCheck },
    { href: "/terms", label: "Terms", Icon: FileText },
  ];
  return (
    <>
      <button
        type="button"
        className="information-menu-button"
        aria-label="Open navigation"
        aria-expanded={open}
        aria-controls="mobile-navigation"
        aria-haspopup="dialog"
        disabled={!hydrated}
        onClick={(event) => {
          event.currentTarget.focus();
          setOpen(true);
        }}
      >
        <Menu size={22} aria-hidden="true" />
      </button>
      <MobileNavigation open={open} onClose={() => setOpen(false)}>
        {destinations.map(({ href, label, Icon }) => (
          <a
            key={href}
            href={href}
            aria-current={path === href ? "page" : undefined}
          >
            <Icon size={24} aria-hidden="true" />
            <span>{label}</span>
          </a>
        ))}
      </MobileNavigation>
    </>
  );
}
