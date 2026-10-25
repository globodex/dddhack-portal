import { httpsUrl } from "./security";

/** CSV website prefill only. Never fetches a URL or searches past a bad first value. */
export function rosterFirstWebsite(value: string): string | undefined {
  let source = value
    .trim()
    .replace(
      /^(?:(?:product\s*\/\s*)?portfolio(?:\s+website)?|website|product|url|link)\s*:\s*/i,
      "",
    );
  const wrappers: Record<string, string> = {
    '"': '"',
    "'": "'",
    "(": ")",
    "[": "]",
    "<": ">",
  };
  const closing: string[] = [];
  while (source && wrappers[source[0]]) {
    closing.push(wrappers[source[0]]);
    source = source.slice(1).trimStart();
  }
  let candidate = source.split(/\s/, 1)[0];
  const remainder = source.slice(candidate.length).trimStart();
  if (
    !candidate.includes("?") &&
    !candidate.includes("#") &&
    /[,;&]$/.test(candidate) &&
    /^(?:https?:\/\/|www\.|[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:[\/;?#,]|$))/i.test(
      remainder,
    )
  )
    candidate = candidate.slice(0, -1);
  // Unspaced list separators are unambiguous at the host, or before a new
  // explicit web scheme. Preserve path punctuation and every query ampersand.
  const schemeLength = candidate.match(/^https?:\/\//i)?.[0].length || 0;
  const query = candidate.indexOf("?");
  const path = candidate.indexOf("/", schemeLength);
  const fragment = candidate.indexOf("#");
  for (let i = schemeLength; i < candidate.length; i++) {
    if (!",;&".includes(candidate[i])) continue;
    if ((query >= 0 && i > query) || (fragment >= 0 && i > fragment)) continue;
    const following = candidate.slice(i + 1);
    const nextExplicit = /^https?:\/\//i.test(following);
    const atHost = path < 0 || i < path;
    const nextDomain =
      /^(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:[\/;?#,]|$)/i.test(following);
    if (nextExplicit || (atHost && nextDomain)) {
      candidate = candidate.slice(0, i);
      break;
    }
  }
  // A comma/full stop outside a wrapped or host-only address is punctuation.
  // Do not trim punctuation from an otherwise valid path/query/fragment.
  const hostOnly = !/[\/?#]/.test(candidate.slice(schemeLength));
  if (closing.length || hostOnly) candidate = candidate.replace(/[.,;]+$/, "");
  while (closing.length) {
    const end = closing.pop()!;
    if (!candidate.endsWith(end)) return undefined;
    candidate = candidate.slice(0, -1);
  }
  if (!candidate || /[\\\s\x00-\x1f\x7f]/.test(candidate)) return undefined;
  if (
    /^[a-z][a-z0-9+.-]*:/i.test(candidate) &&
    !/^https?:\/\//i.test(candidate)
  )
    return undefined;
  if (candidate.startsWith("//")) return undefined;
  const normalized = /^https?:\/\//i.test(candidate)
    ? candidate.replace(/^http:/i, "https:")
    : "https://" + candidate;
  try {
    const url = new URL(normalized);
    // Require a web domain, not credentials, custom ports, IPs or local names.
    if (
      !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]+)$/i.test(
        url.hostname,
      )
    )
      return undefined;
    const canonical = url.href.replace(
      /\/$/,
      url.pathname === "/" &&
        !url.search &&
        !url.hash &&
        !candidate.endsWith("/")
        ? ""
        : "/",
    );
    return httpsUrl.safeParse(canonical).success ? canonical : undefined;
  } catch {
    return undefined;
  }
}
