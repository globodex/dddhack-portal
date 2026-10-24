"use client";

import { usePathname } from "next/navigation";
import RouteSkeleton from "../route-skeleton";

export default function Loading() {
  return (
    <main className="main">
      <RouteSkeleton path={usePathname()} />
    </main>
  );
}
