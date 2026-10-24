// Pure route policy shared by metadata and the backend. No database/runtime import.
const protectedPath = (path: string) =>
  /^\/(dashboard|admin|judge|teams|profile|submission|review|rules|project-history|discover)(\/|$)/.test(
    path,
  );
function configuredSiteOrigin() {
  const value = process.env.APP_ORIGIN || "https://dddhack-portal.vercel.app";
  const url = new URL(value);
  if (
    url.origin !== value ||
    url.username ||
    url.password ||
    (url.protocol !== "https:" &&
      !(
        process.env.NODE_ENV === "development" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      ))
  )
    throw new Error("APP_ORIGIN_INVALID");
  return url.origin;
}
export const siteOrigin = configuredSiteOrigin();
export const eventTitle = "DevDay Exchange Community Hackathon: New Delhi";
export const publicPath = (path: string) =>
  path === "/" ||
  path === "/projects" ||
  path === "/leaderboard" ||
  /^\/projects\/[^/]+$/.test(path);
export function pageMetadata(
  path: string,
  project?: { projectName?: string; problemSolution?: string; banner?: string },
) {
  const index = publicPath(path) && !protectedPath(path),
    canonical = siteOrigin + (path === "/" ? "/" : path);
  const title = project?.projectName
    ? project.projectName + " · " + eventTitle
    : path === "/projects"
      ? "Projects · " + eventTitle
      : path === "/leaderboard"
        ? "Leaderboard · " + eventTitle
        : eventTitle;
  const description = (
    project?.problemSolution ||
    "A community hackathon in New Delhi on 1 November 2026. Explore submitted projects and join the community."
  ).slice(0, 300);
  const image = project?.banner?.startsWith("/api/project-image/")
    ? siteOrigin + project.banner
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
            images: [{ url: image, alt: project?.projectName || eventTitle }],
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
    "A community hackathon in New Delhi. Individual attendance is subject to organizer approval on the portal.",
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
