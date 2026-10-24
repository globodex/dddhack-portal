"use client";

import { useRef } from "react";
import { portalErrorText } from "../lib/ui-feedback";
import { readPortalView } from "../lib/portal-read";
import {
  useIncrementalPages,
  type IncrementalPage,
} from "./use-incremental-pages";

type Project = Record<string, any>;
type ProjectPage = IncrementalPage<Project> & Record<string, any>;
export function projectPageUrl(search = "", cursor: string | null = null) {
  const page = cursor === null ? 0 : Number(cursor);
  if (!Number.isSafeInteger(page) || page < 0)
    throw new Error("Invalid project page.");
  return `/api/portal?${new URLSearchParams({ view: "/projects", q: search.trim().slice(0, 200), page: String(page) })}`;
}

export function projectFeedPage(page: ProjectPage): ProjectPage {
  const current =
    Number.isSafeInteger(page.page) && page.page >= 0 ? page.page : 0;
  return { ...page, nextCursor: page.hasMore ? String(current + 1) : null };
}

export async function readProjectPage(
  url: string,
  signal: AbortSignal,
): Promise<ProjectPage> {
  const { response, body } = await readPortalView(url, signal);
  if (!body || typeof body !== "object")
    throw new Error("Projects could not be loaded. Try again.");
  if (!response.ok)
    throw new Error(
      response.status >= 500
        ? "Projects could not be loaded. Try again."
        : portalErrorText(body),
    );
  const requested = Number(
    new URL(url, "https://portal.test").searchParams.get("page"),
  );
  if (
    !Array.isArray(body.items) ||
    body.items.length > 24 ||
    body.page !== requested ||
    body.items.some((p: Project) => typeof p.id !== "string")
  )
    throw new Error("Projects could not be loaded. Try again.");
  return projectFeedPage(body);
}

export function useProjectFeed(
  data: ProjectPage,
  search: string,
  enabled: boolean,
) {
  const query = search.trim().slice(0, 200);
  const source = useRef(data.items);
  const searched = useRef(false);
  if (source.current !== data.items) {
    source.current = data.items;
    searched.current = false;
  }
  if (query) searched.current = true;
  return useIncrementalPages<Project, ProjectPage>({
    seed: projectFeedPage(data),
    queryKey: JSON.stringify({ search: query }),
    // Returning from search must read current counts/capabilities, since a vote
    // deliberately leaves the expanded feed in place instead of reloading it.
    useSeed: !query && !searched.current,
    enabled,
    read: (cursor, signal) =>
      readProjectPage(projectPageUrl(query, cursor), signal),
  });
}

export type ProjectVote = {
  upvoted: boolean;
  upvotes: number;
  canUpvote: boolean;
};
export async function readProjectVote(
  id: string,
  slug: string,
  signal: AbortSignal,
): Promise<ProjectVote> {
  const url = `/api/portal?${new URLSearchParams({ view: `/projects/${encodeURIComponent(slug)}` })}`;
  const { response, body } = await readPortalView(url, signal);
  if (!body || typeof body !== "object")
    throw new Error("The vote count could not be refreshed.");
  if (!response.ok) throw new Error(portalErrorText(body));
  const project = body.items?.find((p: Project) => p.id === id);
  if (
    !project ||
    !Number.isSafeInteger(project.upvotes) ||
    project.upvotes < 0 ||
    typeof project.upvoted !== "boolean" ||
    typeof project.canUpvote !== "boolean"
  )
    throw new Error("The vote count could not be refreshed.");
  return {
    upvoted: project.upvoted,
    upvotes: project.upvotes,
    canUpvote: project.canUpvote,
  };
}
