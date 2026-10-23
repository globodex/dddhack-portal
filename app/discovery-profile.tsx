"use client";

import { useEffect, useId, useRef } from "react";
import { ExternalLink } from "lucide-react";
import DotAvatar from "./dot-avatar";

export type DiscoveryPerson = {
  name: string;
  bio: string;
  socials: string[];
  avatarColor: string;
  avatarExpression: string;
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
    if (trigger?.isConnected) trigger.focus();
  };
  const finish = () => {
    if (closed) return;
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
  return () => {
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
      className="discovery-profile"
      aria-labelledby={titleId}
      aria-describedby={person.bio ? bioId : undefined}
    >
      <div className="discovery-profile-top">
        <DotAvatar
          color={person.avatarColor}
          expression={person.avatarExpression}
          size={72}
          decorative
        />
        <button
          type="button"
          className="discovery-profile-close"
          autoFocus
          onClick={() => dialog.current?.close()}
          aria-label="Close profile"
        >
          Close
        </button>
      </div>
      <h2 id={titleId}>{person.name}</h2>
      {person.bio && (
        <p id={bioId} className="discovery-profile-bio">
          {person.bio}
        </p>
      )}
      {links.length > 0 && (
        <section
          className="discovery-profile-socials"
          aria-label="Social links"
        >
          <h3>Social links</h3>
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
                    width={22}
                    height={22}
                    alt=""
                  />
                  <span>{link.label}</span>
                  <ExternalLink
                    className="discovery-profile-external"
                    size={18}
                    aria-hidden="true"
                  />
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </dialog>
  );
}
