"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { trackDialogHistory } from "./dialog-history";

// Native showModal supplies the focus trap and makes the page behind it inert.
// Keep our scroll/focus cleanup paired with that same modal lifetime.
export function openMobileNavigation(
  node: HTMLDialogElement,
  onDesktop: () => void,
) {
  const doc = node.ownerDocument;
  const view = doc.defaultView!;
  const trigger = doc.activeElement as HTMLElement | null;
  const bodyOverflow = doc.body.style.overflow;
  const htmlOverflow = doc.documentElement.style.overflow;
  node.showModal();
  const releaseHistory = trackDialogHistory(onDesktop, trigger);
  doc.body.style.overflow = "hidden";
  doc.documentElement.style.overflow = "hidden";
  const resize = () => {
    if (view.innerWidth >= 1200) onDesktop();
  };
  view.addEventListener("resize", resize);
  return () => {
    releaseHistory();
    view.removeEventListener("resize", resize);
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
      <nav
        aria-label="Mobile navigation"
        onClick={(event) => {
          if ((event.target as HTMLElement).closest("a")) onClose();
        }}
      >
        {children}
      </nav>
    </dialog>
  );
}
