"use client";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { EllipsisVertical, X } from "lucide-react";
import { trapDialogFocus } from "./dialog-focus";
import { trackDialogHistory } from "./dialog-history";

export default function AdminStatusMenu({
  name,
  children,
}: {
  name: string;
  children: ReactNode;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open || !dialog.current || !trigger.current) return;
    const popup = dialog.current;
    const button = trigger.current;
    const position = () => {
      const anchor = button.getBoundingClientRect();
      const bounds = popup.getBoundingClientRect();
      const gap = 8;
      popup.style.left = `${Math.max(16, Math.min(anchor.right - bounds.width, innerWidth - bounds.width - 16))}px`;
      popup.style.top = `${Math.max(16, Math.min(anchor.bottom + gap + bounds.height <= innerHeight - 16 ? anchor.bottom + gap : anchor.top - bounds.height - gap, innerHeight - bounds.height - 16))}px`;
    };
    popup.showModal();
    const stopHistory = trackDialogHistory(() => setOpen(false), button);
    position();
    popup
      .querySelector<HTMLElement>("select,button,input")
      ?.focus({ preventScroll: true });
    // Block background scrolling without removing its scrollbar or moving the table.
    const preventBackgroundScroll = (event: Event) => {
      const modal = (event.target as Element).closest?.("dialog:modal");
      if (!modal || event.target === modal) event.preventDefault();
    };
    document.addEventListener("wheel", preventBackgroundScroll, {
      passive: false,
    });
    document.addEventListener("touchmove", preventBackgroundScroll, {
      passive: false,
    });
    window.addEventListener("resize", position);
    return () => {
      stopHistory();
      document.removeEventListener("wheel", preventBackgroundScroll);
      document.removeEventListener("touchmove", preventBackgroundScroll);
      window.removeEventListener("resize", position);
      popup.close();
      if (button.isConnected) button.focus({ preventScroll: true });
    };
  }, [open]);

  return (
    <div className="admin-status-menu">
      <button
        ref={trigger}
        type="button"
        title={`Change ${name} status`}
        aria-label={`Change ${name} status`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(true)}
      >
        <EllipsisVertical
          className="admin-control-icon"
          size={20}
          aria-hidden="true"
        />
      </button>
      <dialog
        ref={dialog}
        id={id}
        className="admin-status-popover"
        aria-label={`Change ${name} status`}
        onKeyDown={trapDialogFocus}
        onCancel={(event) => {
          event.preventDefault();
          setOpen(false);
        }}
        onClick={(event) => {
          if (event.target !== event.currentTarget) return;
          const bounds = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < bounds.left ||
            event.clientX > bounds.right ||
            event.clientY < bounds.top ||
            event.clientY > bounds.bottom
          )
            setOpen(false);
        }}
      >
        <button
          className="admin-toolbar-icon admin-status-close"
          type="button"
          aria-label="Close status menu"
          onClick={() => setOpen(false)}
        >
          <X size={20} aria-hidden="true" />
        </button>
        {children}
      </dialog>
    </div>
  );
}
