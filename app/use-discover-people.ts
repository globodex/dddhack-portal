"use client";

import { useEffect, useRef, useState } from "react";

type Person = Record<string, any>;
type Page = {
  items?: Person[];
  hasMore?: boolean;
  nextCursor?: string | null;
  focusedPerson?: Person | null;
};
type DirectoryState = {
  key: string;
  items: Person[];
  nextCursor: string | null;
  hasMore: boolean;
  loading: boolean;
  error: string;
};

export function peopleDirectoryUrl({
  search = "",
  membership = "all",
  cursor,
  person,
}: {
  search?: string;
  membership?: string;
  cursor?: string;
  person?: string;
} = {}) {
  const params = new URLSearchParams({
    view: "/discover/participants",
    q: search.trim().slice(0, 200),
    membership: membership || "all",
    limit: "24",
  });
  if (cursor) params.set("cursor", cursor);
  if (person) params.set("person", person);
  return `/api/portal?${params}`;
}

export async function readPeoplePage(url: string, signal: AbortSignal): Promise<Page> {
  const response = await fetch(url, {
    signal,
    cache: "no-store",
    credentials: "same-origin",
  });
  const body = await response.json() as Page & { message?: string };
  if (!response.ok)
    throw new Error(body.message || "People could not be loaded.");
  return body;
}

function fromPage(page: Page, key: string): DirectoryState {
  return {
    key,
    items: page.items || [],
    nextCursor: page.nextCursor || null,
    hasMore: page.hasMore === true && !!page.nextCursor,
    loading: false,
    error: "",
  };
}

export function useDiscoverPeople(data: Page, search: string, membership: string, enabled: boolean) {
  const query = { search: search.trim().slice(0, 200), membership: membership || "all" };
  const key = JSON.stringify(query);
  const [state, setState] = useState(() => fromPage(data, key));
  const generation = useRef(0);
  const active = useRef<AbortController | null>(null);
  const currentKey = useRef(key);
  const stateRef = useRef(state);
  // Invalidate immediately when inputs change, before the debounce completes.
  if (currentKey.current !== key) {
    currentKey.current = key;
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
    if (!query.search && query.membership === "all") {
      setState(fromPage(data, key));
      return;
    }
    setState({ ...fromPage({}, key), loading: true });
    const controller = new AbortController();
    active.current = controller;
    const timer = window.setTimeout(async () => {
      try {
        const page = await readPeoplePage(peopleDirectoryUrl(query), controller.signal);
        if (generation.current === epoch && !controller.signal.aborted)
          setState(fromPage(page, key));
      } catch (error) {
        if (generation.current === epoch && !controller.signal.aborted)
          setState({ ...fromPage({}, key), error: (error as Error).message });
      } finally {
        if (active.current === controller) active.current = null;
      }
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
      if (active.current === controller) active.current = null;
    };
  }, [enabled, key, data.items, data.hasMore, data.nextCursor]);

  useEffect(() => () => {
    generation.current++;
    active.current?.abort();
    active.current = null;
  }, []);

  const loadMore = async () => {
    const before = stateRef.current;
    if (!enabled || active.current || before.key !== key || before.loading) return;
    if (!before.hasMore && !before.error) return;
    const epoch = generation.current;
    const controller = new AbortController();
    active.current = controller;
    stateRef.current = { ...before, loading: true, error: "" };
    setState(stateRef.current);
    try {
      const page = await readPeoplePage(
        peopleDirectoryUrl({ ...query, ...(before.nextCursor ? { cursor: before.nextCursor } : {}) }),
        controller.signal,
      );
      if (generation.current !== epoch || controller.signal.aborted) return;
      const seen = new Set(before.items.map((person) => person.id));
      const added = (page.items || []).filter((person) => {
        if (seen.has(person.id)) return false;
        seen.add(person.id);
        return true;
      });
      stateRef.current = { ...fromPage(page, key), items: [...before.items, ...added] };
      setState(stateRef.current);
    } catch (error) {
      if (generation.current === epoch && !controller.signal.aborted) {
        stateRef.current = { ...before, loading: false, error: (error as Error).message };
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
    if (!enabled || state.key !== key || state.loading || state.error || !state.hasMore || !sentinel.current || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void more.current();
    }, { rootMargin: "240px" });
    observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [enabled, key, state]);
  const current = state.key === key;
  return {
    items: current ? state.items : [],
    loading: !current || state.loading,
    error: current ? state.error : "",
    hasMore: current && state.hasMore,
    loadMore,
    sentinel,
  };
}
