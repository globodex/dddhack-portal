export const projectShareCaption =
  "Check out this hackathon project, built at DevDay Exchange Community Hackathon New Delhi";
export const projectShareHashtags = [
  "DevDayCommunity",
  "DevDayCommunityDelhi",
] as const;

// This checks the route shape, not eligibility. Callers must supply the public
// path granted by the server; a draft slug is never sufficient authorization.
export function validProjectPublicPath(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\/projects\/[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(value)
  );
}

export function projectShareUrl(
  publicPath: unknown,
  origin: string,
): string | null {
  if (!validProjectPublicPath(publicPath)) return null;
  try {
    const base = new URL(origin);
    if (
      base.username ||
      base.password ||
      base.pathname !== "/" ||
      base.search ||
      base.hash
    )
      return null;
    if (
      base.protocol !== "https:" &&
      !(
        base.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname)
      )
    )
      return null;
    return new URL(publicPath, base.origin).href;
  } catch {
    return null;
  }
}

export function projectShareText(url: string) {
  return `${projectShareCaption}\n\n${projectShareHashtags.map((tag) => `#${tag}`).join(" ")}\n${url}`;
}

export function projectShareIntents(url: string) {
  const x = new URL("https://x.com/intent/tweet");
  x.search = new URLSearchParams({
    text: projectShareCaption,
    hashtags: projectShareHashtags.join(","),
    url,
  }).toString();
  const facebook = new URL("https://www.facebook.com/sharer/sharer.php");
  facebook.search = new URLSearchParams({ u: url }).toString();
  const linkedin = new URL("https://www.linkedin.com/sharing/share-offsite/");
  linkedin.search = new URLSearchParams({ url }).toString();
  return [
    { id: "x", name: "X", href: x.href },
    { id: "facebook", name: "Facebook", href: facebook.href },
    { id: "linkedin", name: "LinkedIn", href: linkedin.href },
  ] as const;
}

export type SubmissionSuccessState = {
  attempt: number;
  publicPath: string | null;
};
export function submittedProjectSuccess(
  result: Record<string, any>,
  fresh?: Record<string, any>,
): SubmissionSuccessState | null {
  // A successful commit receipt is required. Neither an old page nor a draft
  // save can produce a celebration or an additional committed-attempt chip.
  if (typeof result.versionId !== "string" || !result.versionId) return null;
  // The receipt identifies this commit even if a later version is visible by
  // the time the page refreshes (or this request is an idempotent retry).
  const attempt = Number.isInteger(result.attemptsUsed)
    ? result.attemptsUsed
    : fresh?.submissionAccess?.attemptsUsed;
  if (!Number.isInteger(attempt) || attempt < 1 || attempt > 3) return null;
  return {
    attempt,
    publicPath:
      fresh?.project?.published_version_id === result.versionId &&
      validProjectPublicPath(fresh?.projectPublicPath)
        ? fresh!.projectPublicPath
        : null,
  };
}
