"use client";

import { useIncrementalPages } from "./use-incremental-pages";

type Person = Record<string, any>;
type Page = {
  items?: Person[];
  hasMore?: boolean;
  nextCursor?: string | null;
  focusedPerson?: Person | null;
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

export async function readPeoplePage(
  url: string,
  signal: AbortSignal,
): Promise<Page> {
  const response = await fetch(url, {
    signal,
    cache: "no-store",
    credentials: "same-origin",
  });
  const body = (await response.json()) as Page & { message?: string };
  if (!response.ok)
    throw new Error(body.message || "People could not be loaded.");
  return body;
}

export function useDiscoverPeople(
  data: Page,
  search: string,
  membership: string,
  enabled: boolean,
) {
  const query = {
    search: search.trim().slice(0, 200),
    membership: membership || "all",
  };
  return useIncrementalPages<Person, Page>({
    seed: data,
    queryKey: JSON.stringify(query),
    useSeed: !query.search && query.membership === "all",
    enabled,
    read: (cursor, signal) =>
      readPeoplePage(
        peopleDirectoryUrl({ ...query, ...(cursor ? { cursor } : {}) }),
        signal,
      ),
  });
}
