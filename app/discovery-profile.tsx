"use client";

import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";
import TeamAvatar from "./team-avatar";
import DotAvatar from "./dot-avatar";
import { trapDialogFocus } from "./dialog-focus";
import { trackDialogHistory } from "./dialog-history";

export type DiscoveryPerson = {
  name: string;
  bio: string;
  socials: string[];
  avatarColor: string;
  avatarExpression: string;
  team?: { name: string; palette?: string };
};

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
  });
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
  const links = discoverySocialLinks(person.socials);
  useEffect(() => {
    closeCallback.current = onClose;
  }, [onClose]);
  useEffect(() => {
    if (dialog.current)
      return openDiscoveryDialog(dialog.current, () => closeCallback.current());
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
