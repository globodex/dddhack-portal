"use client";
import { useEffect, useRef } from "react";
import type { Confirmation } from "../lib/action-confirmation";
import { trapDialogFocus } from "./dialog-focus";
import { trackDialogHistory } from "./dialog-history";
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
    const popup = dialog.current;
    if (!popup) return;
    const previous =
      value.opener || (document.activeElement as HTMLElement | null);
    const bodyOverflow = document.body.style.overflow;
    const documentOverflow = document.documentElement.style.overflow;
    const parentDialog =
      previous?.closest<HTMLDialogElement>("dialog:modal") ||
      [...document.querySelectorAll<HTMLDialogElement>("dialog:modal")]
        .filter((node) => node !== popup)
        .at(-1);
    popup.showModal();
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    const releaseHistory = trackDialogHistory(() => decide(false), previous);
    cancel.current?.focus();
    return () => {
      releaseHistory();
      // React clears refs before the passive unmount cleanup. Close the node
      // captured by this effect so its top-layer focus lock is released before
      // restoring focus to the still-open parent, including Strict Mode replay.
      popup.close();
      document.body.style.overflow = bodyOverflow;
      document.documentElement.style.overflow = documentOverflow;
      const restoreFocus = () => {
        if (
          previous?.isConnected &&
          previous.tabIndex >= 0 &&
          !previous.matches(":disabled")
        )
          previous.focus({ preventScroll: true });
        else {
          const target =
            (parentDialog?.open &&
              parentDialog.querySelector<HTMLElement>(
                "button:enabled,select:enabled,input:enabled",
              )) ||
            document.getElementById("main");
          target?.focus({ preventScroll: true });
        }
      };
      // Pending state is released after the confirmation promise settles.
      requestAnimationFrame(() => requestAnimationFrame(restoreFocus));
    };
  }, []);
  return (
    <dialog
      className="confirmation-dialog"
      data-tone={value.tone || "default"}
      ref={dialog}
      onKeyDown={trapDialogFocus}
      aria-labelledby="confirmation-title"
      aria-describedby={[
        "confirmation-target",
        value.badge && "confirmation-badge",
        value.description && "confirmation-description",
        value.note && "confirmation-note",
      ]
        .filter(Boolean)
        .join(" ")}
      onCancel={(e) => {
        e.preventDefault();
        decide(false);
      }}
    >
      <h2 id="confirmation-title">{value.title}</h2>
      <p id="confirmation-target">
        <strong>{value.target}</strong>
      </p>
      {value.badge && (
        <span id="confirmation-badge" className="confirmation-badge">
          {value.badge}
        </span>
      )}
      {value.description && (
        <p id="confirmation-description">{value.description}</p>
      )}
      {value.note && (
        <p id="confirmation-note" className="confirmation-note">
          {value.note}
        </p>
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
        <button
          type="button"
          className="button confirmation-accept"
          onClick={() => decide(true)}
        >
          {value.confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
