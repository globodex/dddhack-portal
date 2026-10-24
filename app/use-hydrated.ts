"use client";
import { useEffect, useState } from "react";

/** Sensitive client forms stay inactive until their event handlers are attached. */
export function useHydrated() {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return hydrated;
}
