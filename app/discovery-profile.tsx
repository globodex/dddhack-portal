"use client";

import { useEffect, useId, useRef, useState } from "react";
import { BriefcaseBusiness, Building2, Copy, Phone, UserRound, X } from "lucide-react";
import TeamAvatar from "./team-avatar";
import DotAvatar from "./dot-avatar";
import { trapDialogFocus } from "./dialog-focus";
import { trackDialogHistory } from "./dialog-history";
const genderNames: Record<string, string> = { man: "Man", woman: "Woman", "non-binary": "Non-binary" };

export type DiscoveryPerson = {
  name: string;
  bio: string;
  socials: string[];
  avatarColor: string;
  avatarExpression: string;
  team?: { name: string; palette?: string };
  details?: {
    profession?: string; organization?: string; gender?: string; genderDescription?: string;
    openaiOrgId?: string; phone?: string; whatsappUrl?: string;
  };
};

export function discoveryDetailsProjection(value: unknown): DiscoveryPerson["details"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const row = value as Record<string, unknown>;
  const details: NonNullable<DiscoveryPerson["details"]> = {};
  for (const key of ["profession", "organization", "gender", "genderDescription"] as const)
    if (typeof row[key] === "string" && row[key].trim()) details[key] = row[key].trim();
  if (typeof row.openaiOrgId === "string" && /^org-[A-Za-z0-9_-]+$/.test(row.openaiOrgId)) details.openaiOrgId = row.openaiOrgId;
  if (typeof row.phone === "string" && /^\+[1-9][0-9]{7,14}$/.test(row.phone)) {
    details.phone = row.phone;
    if (row.whatsappUrl === `https://wa.me/${row.phone.slice(1)}`) details.whatsappUrl = row.whatsappUrl;
  }
  return details;
}

export function discoverySocialLinks(socials: string[]) {
  const seen = new Set<string>();
  return socials.flatMap((value) => {
    try {
      const url = new URL(value);
      if (url.protocol !== "https:" || url.username || url.password) return [];
      if (seen.has(url.href)) return [];
      seen.add(url.href);
      const host = url.hostname.replace(/^www\./, "");
      const platform = {
        "linkedin.com": ["linkedin", "LinkedIn"],
        "github.com": ["github", "GitHub"],
        "x.com": ["x", "X"],
        "twitter.com": ["x", "X"],
        "instagram.com": ["instagram", "Instagram"],
      }[host];
      return [
        {
          href: url.href,
          icon: platform?.[0] || "website",
          label: platform?.[1] || host,
        },
      ];
    } catch {
      return [];
    }
  });
}

/** Native modal lifecycle, including dismissal and return to its opening control. */
export function openDiscoveryDialog(
  dialog: HTMLDialogElement,
  onClose: () => void,
) {
  const trigger = dialog.ownerDocument.activeElement as HTMLElement | null;
  let closed = false;
  const restoreFocus = () => {
    if (trigger?.isConnected) trigger.focus({ preventScroll: true });
  };
  const finish = () => {
    // close() queues its native event. Strict Mode can reopen the same node
    // before that event arrives, so it must not dismiss the new modal lifetime.
    if (closed || dialog.open) return;
    closed = true;
    restoreFocus();
    onClose();
  };
  const cancel = (event: Event) => {
    event.preventDefault();
    dialog.close();
    finish();
  };
  dialog.addEventListener("close", finish);
  dialog.addEventListener("cancel", cancel);
  dialog.showModal();
  const releaseHistory = trackDialogHistory(() => {
    dialog.close();
    finish();
  }, trigger);
  return () => {
    releaseHistory();
    closed = true;
    dialog.removeEventListener("close", finish);
    dialog.removeEventListener("cancel", cancel);
    if (dialog.open) dialog.close();
    restoreFocus();
  };
}

export default function DiscoveryProfile({
  person,
  onClose,
}: {
  person: DiscoveryPerson;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const closeCallback = useRef(onClose);
  const titleId = useId();
  const bioId = useId();
  const orgInput = useRef<HTMLInputElement>(null);
  const [copyNotice, setCopyNotice] = useState("");
  const details = discoveryDetailsProjection(person.details);
  const links = discoverySocialLinks(person.socials);
  useEffect(() => {
    closeCallback.current = onClose;
  }, [onClose]);
  useEffect(() => {
    if (!dialog.current) return;
    const overflow = document.body.style.overflow;
    const gutter = document.documentElement.style.scrollbarGutter;
    document.body.style.overflow = "hidden";
    document.documentElement.style.scrollbarGutter = "stable";
    const release = openDiscoveryDialog(dialog.current, () => closeCallback.current());
    return () => {
      release();
      document.body.style.overflow = overflow;
      document.documentElement.style.scrollbarGutter = gutter;
    };
  }, []);

  return (
    <dialog
      ref={dialog}
      onKeyDown={trapDialogFocus}
      className="discovery-profile discovery-profile-v6"
      aria-labelledby={titleId}
      aria-describedby={person.bio ? bioId : undefined}
    >
      <button
        type="button"
        className="discovery-profile-close"
        autoFocus
        onClick={() => dialog.current?.close()}
        aria-label="Close profile"
      >
        <X size={22} aria-hidden="true" />
      </button>
      <div className="discovery-profile-identity-v6">
        <DotAvatar
          color={person.avatarColor}
          expression={person.avatarExpression}
          size={80}
          decorative
        />
        <h2 id={titleId}>{person.name}</h2>
        {person.bio && (
          <p id={bioId} className="discovery-profile-bio">
            {person.bio}
          </p>
        )}
        {links.length > 0 && (
          <nav className="discovery-profile-socials" aria-label="Social links">
            <ul>
              {links.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`${link.label}: ${link.href} (opens in a new tab)`}
                  >
                    <img
                      src={`/icons/social/${link.icon}.svg`}
                      width={26}
                      height={26}
                      alt=""
                    />
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </div>
      {details && Object.keys(details).length > 0 && (
        <section className="discovery-profile-details" aria-label="Profile details">
          {details.profession && <div className="discovery-profile-fact"><BriefcaseBusiness size={20} aria-hidden="true" /><span>{details.profession}</span></div>}
          {details.organization && <div className="discovery-profile-fact"><Building2 size={20} aria-hidden="true" /><span>{details.organization}</span></div>}
          {details.gender && <div className="discovery-profile-fact"><UserRound size={20} aria-hidden="true" /><span><span className="sr-only">Gender: </span>{genderNames[details.gender] || details.gender}{details.genderDescription && <small>{details.genderDescription}</small>}</span></div>}
          {details.phone && <div className="discovery-profile-contact"><a href={`tel:${details.phone}`}><Phone size={20} aria-hidden="true" />{details.phone}</a>{details.whatsappUrl && <a href={details.whatsappUrl} target="_blank" rel="noopener noreferrer" aria-label="Open WhatsApp (opens in a new tab)"><img src="/icons/social/whatsapp.svg" width={22} height={22} alt="" /><span className="sr-only">WhatsApp</span></a>}</div>}
          {details.openaiOrgId && <div className="discovery-profile-org"><label htmlFor={`${titleId}-org`}>OpenAI organization ID</label><div><input id={`${titleId}-org`} ref={orgInput} readOnly value={details.openaiOrgId} onFocus={event => event.currentTarget.select()} /><button type="button" aria-label="Copy OpenAI organization ID" onClick={async () => { try { if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable"); await navigator.clipboard.writeText(details.openaiOrgId!); setCopyNotice("Copied."); } catch { orgInput.current?.focus(); orgInput.current?.select(); setCopyNotice("Could not copy. The ID is selected for manual copying."); } }}><Copy size={18} aria-hidden="true" /></button></div><p role="status">{copyNotice}</p></div>}
        </section>
      )}
      {person.team && (
        <section className="discovery-profile-team-v6" aria-label="Team">
          <h3>Team</h3>
          <div>
            <TeamAvatar
              name={person.team.name}
              palette={person.team.palette}
              size={52}
            />
            <h4>{person.team.name}</h4>
            <span>In a team</span>
          </div>
        </section>
      )}
    </dialog>
  );
}
