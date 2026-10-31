import { ExternalLink, Globe } from "lucide-react";

export function projectDestination(value: unknown, repository = false) {
  if (typeof value !== "string") return;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return;
    if (
      repository &&
      !["github.com", "www.github.com"].includes(url.hostname.toLowerCase())
    )
      return;
    const parts = url.pathname.split("/").filter(Boolean);
    const repo = parts[1]?.replace(/\.git$/i, "");
    return {
      href: url.href,
      label:
        repository && parts[0] && repo
          ? `${parts[0]}/${repo}`
          : url.hostname.replace(/^www\./i, ""),
    };
  } catch {
    return;
  }
}

export default function ProjectDestinationLinks({
  github,
  demo,
}: {
  github?: unknown;
  demo?: unknown;
}) {
  const repository = projectDestination(github, true),
    website = projectDestination(demo);
  return (
    <>
      {repository && (
        <a
          className="button secondary project-destination-link"
          href={repository.href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`GitHub repository ${repository.label} (opens in a new tab)`}
        >
          <img src="/icons/social/github.svg" width={20} height={20} alt="" />
          <span className="project-link-label">{repository.label}</span>
          <ExternalLink size={15} aria-hidden="true" />
        </a>
      )}
      {website && (
        <a
          className="button secondary project-destination-link"
          href={website.href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Project website ${website.label} (opens in a new tab)`}
        >
          <Globe size={20} aria-hidden="true" />
          <span className="project-link-label">{website.label}</span>
          <ExternalLink size={15} aria-hidden="true" />
        </a>
      )}
    </>
  );
}
