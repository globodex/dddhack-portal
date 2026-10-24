"use client";

import { useState, useTransition, type ComponentProps } from "react";
import { useRouter } from "next/navigation";
import Portal from "../portal";

type PortalProps = Omit<
  ComponentProps<typeof Portal>,
  "pendingPath" | "onNavigate"
>;

// Keep Next's router integration at the boundary so the presentation can also be
// rendered independently in the existing SSR/accessibility regression tests.
export default function PortalClient(props: PortalProps) {
  const router = useRouter();
  const [pending, startNavigation] = useTransition();
  const [destination, setDestination] = useState<string | null>(null);
  return (
    <Portal
      {...props}
      pendingPath={pending ? destination : null}
      onNavigate={(event, path, options) => {
        event.preventDefault();
        setDestination(path);
        startNavigation(() => options?.replace ? router.replace(path) : router.push(path));
      }}
    />
  );
}
