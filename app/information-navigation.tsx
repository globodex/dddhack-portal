"use client";

import { useEffect, useState } from "react";
import {
  BriefcaseBusiness,
  FileText,
  House,
  LayoutDashboard,
  ShieldCheck,
} from "lucide-react";
import MobileNavigation from "./mobile-navigation";
import NavigationHeader, { NavigationControls } from "./navigation-header";

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
      <NavigationControls
        open={open}
        hydrated={hydrated}
        onOpen={() => setOpen(true)}
      />
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

// No identity read is added to these static legal/auth/access documents.
export function InformationHeader({ path }: { path: string }) {
  return (
    <NavigationHeader>
      <InformationNavigation path={path} />
    </NavigationHeader>
  );
}
