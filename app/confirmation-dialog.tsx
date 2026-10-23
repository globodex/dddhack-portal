"use client";
import { useEffect, useRef } from "react";
import type { Confirmation } from "../lib/action-confirmation";
export default function ConfirmationDialog({
  value,
  decide,
}: {
  value: Confirmation;
  decide: (yes: boolean) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    cancel.current?.focus();
    return () => {
      dialog.current?.close();
      if (
        previous?.isConnected &&
        !(previous instanceof HTMLButtonElement && previous.disabled)
      )
        previous.focus();
      else document.getElementById("main")?.focus();
    };
  }, []);
  return (
    <dialog
      className="confirmation-dialog"
      ref={dialog}
      aria-labelledby="confirmation-title"
      aria-describedby={
        value.description
          ? "confirmation-target confirmation-description"
          : "confirmation-target"
      }
      onCancel={(e) => {
        e.preventDefault();
        decide(false);
      }}
    >
      <h2 id="confirmation-title">{value.title}</h2>
      <p id="confirmation-target">
        <strong>{value.target}</strong>
      </p>
      {value.description && (
        <p id="confirmation-description">{value.description}</p>
      )}
      <div className="form-actions">
        <button
          ref={cancel}
          autoFocus
          type="button"
          className="button secondary"
          onClick={() => decide(false)}
        >
          Cancel
        </button>
        <button type="button" className="button" onClick={() => decide(true)}>
          {value.confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
