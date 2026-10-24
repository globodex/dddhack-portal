import type { KeyboardEvent } from "react";

// Keep Tab cycling through the visible controls of the current top-layer dialog.
export function trapDialogFocus(event: KeyboardEvent<HTMLDialogElement>) {
  if (event.key !== "Tab") return;
  const controls = [
    ...event.currentTarget.querySelectorAll<HTMLElement>(
      "a[href],button:enabled,input:enabled,select:enabled,textarea:enabled,[tabindex]:not([tabindex='-1'])",
    ),
  ].filter((node) => node.getClientRects().length > 0);
  const first = controls[0],
    last = controls.at(-1);
  if (
    event.shiftKey &&
    event.currentTarget.ownerDocument.activeElement === first
  ) {
    event.preventDefault();
    last?.focus({ preventScroll: true });
  } else if (
    !event.shiftKey &&
    event.currentTarget.ownerDocument.activeElement === last
  ) {
    event.preventDefault();
    first?.focus({ preventScroll: true });
  }
}
