"use client";

import { useEffect, useRef, useState } from "react";

export type IncrementalPage<T> = {
  items?: T[];
  hasMore?: boolean;
  nextCursor?: string | null;
};

export function appendUniqueItems<T extends Record<string, any>>(
  before: T[],
  incoming: T[],
) {
  const seen = new Set(before.map((item) => item.id));
  return [
    ...before,
    ...incoming.filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    }),
  ];
}

export function useIncrementalPages<
  T extends Record<string, any>,
  P extends IncrementalPage<T>,
>({
  seed,
  queryKey,
  useSeed,
  enabled,
  read,
}: {
  seed: P;
  queryKey: string;
  useSeed: boolean;
  enabled: boolean;
  read: (cursor: string | null, signal: AbortSignal) => Promise<P>;
}) {
  const fromPage = (page: P, key: string) => ({
    key,
    page,
    items: appendUniqueItems<T>([], page.items || []),
    nextCursor: page.nextCursor || null,
    hasMore: page.hasMore === true && !!page.nextCursor,
    loading: false,
    error: "",
  });
  const empty = () => fromPage({} as P, queryKey);
  const [state, setState] = useState(() => fromPage(seed, queryKey));
  const generation = useRef(0);
  const active = useRef<AbortController | null>(null);
  const currentKey = useRef(queryKey);
  const stateRef = useRef(state);
  const reader = useRef(read);
  reader.current = read;
  if (currentKey.current !== queryKey) {
    currentKey.current = queryKey;
    generation.current++;
    active.current?.abort();
    active.current = null;
  }
  stateRef.current = state;

  useEffect(() => {
    const epoch = ++generation.current;
    active.current?.abort();
    active.current = null;
    if (!enabled) return;
    if (useSeed) {
      stateRef.current = fromPage(seed, queryKey);
      setState(stateRef.current);
      return;
    }
    stateRef.current = { ...empty(), loading: true };
    setState(stateRef.current);
    const controller = new AbortController();
    active.current = controller;
    const timer = window.setTimeout(async () => {
      try {
        const page = await reader.current(null, controller.signal);
        if (generation.current === epoch && !controller.signal.aborted) {
          stateRef.current = fromPage(page, queryKey);
          setState(stateRef.current);
        }
      } catch (error) {
        if (generation.current === epoch && !controller.signal.aborted) {
          stateRef.current = { ...empty(), error: (error as Error).message };
          setState(stateRef.current);
        }
      } finally {
        if (active.current === controller) active.current = null;
      }
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
      if (active.current === controller) active.current = null;
    };
  }, [enabled, queryKey, useSeed, seed.items, seed.hasMore, seed.nextCursor]);

  useEffect(
    () => () => {
      generation.current++;
      active.current?.abort();
      active.current = null;
    },
    [],
  );

  const loadMore = async () => {
    const before = stateRef.current;
    if (!enabled || active.current || before.key !== queryKey || before.loading)
      return;
    if (!before.hasMore && !before.error) return;
    const epoch = generation.current;
    const controller = new AbortController();
    active.current = controller;
    stateRef.current = { ...before, loading: true, error: "" };
    setState(stateRef.current);
    try {
      const page = await reader.current(before.nextCursor, controller.signal);
      if (generation.current !== epoch || controller.signal.aborted) return;
      stateRef.current = {
        ...fromPage(page, queryKey),
        items: appendUniqueItems(before.items, page.items || []),
      };
      setState(stateRef.current);
    } catch (error) {
      if (generation.current === epoch && !controller.signal.aborted) {
        stateRef.current = {
          ...before,
          loading: false,
          error: (error as Error).message,
        };
        setState(stateRef.current);
      }
    } finally {
      if (active.current === controller) active.current = null;
    }
  };
  const sentinel = useRef<HTMLDivElement>(null);
  const more = useRef(loadMore);
  more.current = loadMore;
  useEffect(() => {
    if (
      !enabled ||
      state.key !== queryKey ||
      state.loading ||
      state.error ||
      !state.hasMore ||
      !sentinel.current ||
      typeof IntersectionObserver === "undefined"
    )
      return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void more.current();
      },
      { rootMargin: "240px" },
    );
    observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [enabled, queryKey, state]);
  const current = state.key === queryKey;
  return {
    page: current ? state.page : ({} as P),
    items: current ? state.items : [],
    loading: enabled && (!current || state.loading),
    error: current ? state.error : "",
    hasMore: current && state.hasMore,
    loadMore,
    sentinel,
  };
}
