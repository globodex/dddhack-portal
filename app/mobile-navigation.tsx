"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import {
  consumeDialogHistoryForNavigation,
  trackDialogHistory,
} from "./dialog-history";

type MenuClick = Pick<
  MouseEvent,
  | "defaultPrevented"
  | "button"
  | "metaKey"
  | "ctrlKey"
  | "shiftKey"
  | "altKey"
  | "preventDefault"
>;

/** Release this menu's history entry without changing native top-frame sign-in. */
export function consumeMenuLinkNavigation(
  event: MenuClick,
  link: Pick<HTMLAnchorElement, "href" | "target" | "hasAttribute">,
) {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey ||
    link.hasAttribute("download")
  )
    return false;
  const sameFrame = !link.target || link.target === "_self";
  if (!sameFrame && link.target !== "_top") return false;
  const destination = new URL(link.href, window.location.href);
  if (
    destination.origin !== window.location.origin ||
    !consumeDialogHistoryForNavigation()
  )
    return false;
  if (sameFrame) {
    event.preventDefault();
    window.location.replace(destination.href);
  }
  return true;
}

// Native showModal supplies the focus trap and makes the page behind it inert.
// Keep our scroll/focus cleanup paired with that same modal lifetime.
export function openMobileNavigation(
  node: HTMLDialogElement,
  onDismiss: () => void,
) {
  const doc = node.ownerDocument;
  const trigger = doc.activeElement as HTMLElement | null;
  const bodyOverflow = doc.body.style.overflow;
  const htmlOverflow = doc.documentElement.style.overflow;
  node.showModal();
  const releaseHistory = trackDialogHistory(onDismiss, trigger);
  doc.body.style.overflow = "hidden";
  doc.documentElement.style.overflow = "hidden";
  return () => {
    releaseHistory();
    node.close();
    doc.body.style.overflow = bodyOverflow;
    doc.documentElement.style.overflow = htmlOverflow;
    if (trigger?.isConnected) trigger.focus({ preventScroll: true });
  };
}

export default function MobileNavigation({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const node = dialog.current;
    if (!node || !open) return;
    return openMobileNavigation(node, () => close.current());
  }, [open]);
  return (
    <dialog
      ref={dialog}
      id="mobile-navigation"
      className="mobile-navigation"
      aria-label="Navigation"
      onClose={onClose}
      onClick={(event) => {
        const link = (event.target as HTMLElement).closest<HTMLAnchorElement>(
          "a[href]",
        );
        if (!link) return;
        consumeMenuLinkNavigation(event, link);
        onClose();
      }}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const elements = [
          ...event.currentTarget.querySelectorAll<HTMLElement>(
            "a[href],button:not([disabled])",
          ),
        ].filter((element) => element.getClientRects().length > 0);
        const first = elements[0],
          last = elements.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="mobile-navigation-header">
        <a className="mobile-navigation-brand" href="/" onClick={onClose}>
          <img
            src="/brand/codex-user-supplied.svg"
            alt=""
            width={28}
            height={28}
          />
          <span>Codex Community New Delhi</span>
        </a>
        <button
          type="button"
          className="mobile-navigation-close"
          aria-label="Close navigation"
          onClick={onClose}
          autoFocus
        >
          <X size={24} aria-hidden="true" />
        </button>
      </div>
      <nav aria-label="Site navigation">{children}</nav>
    </dialog>
  );
}
