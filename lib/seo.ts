// Pure route policy shared by metadata and the backend. No database/runtime import.
const protectedPath = (path: string) =>
  path === "/personal/credits" || /^\/(dashboard|admin|judge|teams|profile|submission|review|rules|project-history|discover)(\/|$)/.test(
    path,
  );
export function configuredSiteOrigin(
  value = process.env.APP_ORIGIN || "https://dddhack-portal.itsparam.in",
  development = process.env.NODE_ENV === "development",
) {
  const url = new URL(value);
  if (
    url.origin !== value ||
    url.username ||
    url.password ||
    (url.protocol !== "https:" &&
      !(
        development &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      ))
  )
    throw new Error("APP_ORIGIN_INVALID");
  return url.origin;
}
export const siteOrigin = configuredSiteOrigin();
export const eventTitle = "DevDay Exchange Community Hackathon: New Delhi";
export const eventShortTitle = "DevDay Exchange New Delhi";
export const publicPath = (path: string) =>
  path === "/" ||
  path === "/projects" ||
  path === "/leaderboard" ||
  /^\/projects\/[^/]+$/.test(path);
export const legalDraftPath = (path: string) =>
  path === "/privacy" || path === "/terms";

const routeCopy: Record<string, { title: string; description: string }> = {
  "/personal/credits": {
    title: `Your credits · ${eventShortTitle}`,
    description: "Your private credit allocations for DevDay Exchange New Delhi.",
  },
  "/": {
    title: `${eventTitle} · 1 November 2026`,
    description:
      "Join a community hackathon in New Delhi on 1 November 2026, hosted by Codex Ambassadors. Find event details, registration and published projects.",
  },
  "/projects": {
    title: `Projects · ${eventShortTitle}`,
    description:
      "Explore eligible published hackathon projects, team ideas brought to life and community feedback from DevDay Exchange New Delhi.",
  },
  "/leaderboard": {
    title: `Leaderboard · ${eventShortTitle}`,
    description:
      "View the public project leaderboard and organizer-released results for DevDay Exchange New Delhi.",
  },
  "/privacy": {
    title: `Privacy notice draft · ${eventShortTitle}`,
    description:
      "Draft privacy notice for the event portal operated by Parampreet Singh, including data use, retention and privacy contact information.",
  },
  "/terms": {
    title: `Terms draft · ${eventShortTitle}`,
    description:
      "Draft terms for using the DevDay Exchange New Delhi community event portal, submitting projects and contacting the organizer.",
  },
};

function metadataText(value: unknown, maxLength: number) {
  return typeof value === "string"
    ? value
        .replace(/[\u0000-\u001f\u007f]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, maxLength)
    : "";
}

function canonicalPath(path: string) {
  return (
    "/" + path.split("/").filter(Boolean).map(encodeURIComponent).join("/")
  );
}

/** Only the published public entry may reach metadata, never a private draft. */
export function publicProjectMetadataEntry(value: unknown) {
  if (!value || typeof value !== "object") return undefined;
  const row = value as Record<string, unknown>;
  return {
    projectName: metadataText(row.projectName, 120),
    problemSolution: metadataText(row.problemSolution, 170),
    banner:
      typeof row.banner === "string" &&
      /^\/api\/project-image\/[A-Za-z0-9_-]+\/banner\?version=[A-Za-z0-9_-]+$/.test(
        row.banner,
      )
        ? row.banner
        : undefined,
  };
}

export function pageMetadata(
  path: string,
  project?: { projectName?: string; problemSolution?: string; banner?: string },
) {
  const projectPath = /^\/projects\/[^/]+$/.test(path);
  const published = projectPath
    ? publicProjectMetadataEntry(project)
    : undefined;
  const index =
    publicPath(path) &&
    !protectedPath(path) &&
    (!projectPath || !!published?.projectName);
  const canonical = siteOrigin + canonicalPath(path);
  const copy = routeCopy[path];
  const title =
    projectPath && published?.projectName
      ? published.projectName + " · " + eventShortTitle
      : copy?.title || eventTitle;
  const description =
    projectPath && published?.projectName
      ? published.problemSolution ||
        `Explore ${published.projectName}, an eligible published project from ${eventShortTitle}.`
      : copy?.description ||
        "The private participant and organizer workspace for DevDay Exchange New Delhi.";
  const image =
    projectPath && published?.banner
      ? siteOrigin + published.banner
      : siteOrigin + "/art/delhi-v3/fallback-approved-v3.png";
  return {
    title,
    description,
    alternates: { canonical },
    robots: { index, follow: index },
    ...(index
      ? {
          openGraph: {
            title,
            description,
            url: canonical,
            type: "website",
            siteName: eventShortTitle,
            locale: "en_IN",
            images: [{ url: image, alt: published?.projectName || eventTitle }],
          },
          twitter: {
            card: "summary_large_image",
            title,
            description,
            images: [image],
          },
        }
      : {}),
  };
}
export const eventStructuredData = {
  "@context": "https://schema.org",
  "@type": "Event",
  name: eventTitle,
  url: siteOrigin + "/",
  startDate: "2026-11-01T08:00:00+05:30",
  endDate: "2026-11-01T20:00:00+05:30",
  eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
  eventStatus: "https://schema.org/EventScheduled",
  image: [siteOrigin + "/art/delhi-v3/fallback-approved-v3.png"],
  organizer: { "@type": "Person", name: "Parampreet Singh" },
  location: {
    "@type": "Place",
    name: "IIIT Delhi",
    address: {
      "@type": "PostalAddress",
      addressLocality: "New Delhi",
      addressCountry: "IN",
    },
  },
  description:
    "A community hackathon hosted by Codex Ambassadors in New Delhi. Individual attendance is subject to organizer approval on the portal.",
};
export const safeJSONLD = (value: unknown) =>
  JSON.stringify(value).replace(/</g, "\\u003c");
export const xmlEscape = (v: string) =>
  v.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[c]!,
  );
