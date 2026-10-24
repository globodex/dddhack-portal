"use client";
import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import AdminImportControls from "./admin-import-controls";
import type { AdminRun } from "./admin-participant-actions";
import { trapDialogFocus } from "./dialog-focus";
import { trackDialogHistory } from "./dialog-history";

export default function AdminImportDialog({
  run,
  close,
}: {
  run: AdminRun;
  close: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const dismiss = useRef<HTMLButtonElement>(null);
  const onClose = useRef(close);
  onClose.current = close;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    dismiss.current?.focus();
    const stopHistory = trackDialogHistory(() => onClose.current(), previous);
    return () => {
      stopHistory();
      dialog.current?.close();
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      onKeyDown={trapDialogFocus}
      className="admin-import-dialog"
      aria-labelledby="admin-import-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <header>
        <h2 id="admin-import-title">Add participants</h2>
        <button
          ref={dismiss}
          type="button"
          className="admin-toolbar-icon"
          aria-label="Close add participants"
          onClick={close}
        >
          <X size={20} aria-hidden="true" />
        </button>
      </header>
      <AdminImportControls run={run} />
    </dialog>
  );
}
