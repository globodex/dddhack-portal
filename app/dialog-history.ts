/** A browser Back dismisses the top dialog before it leaves its underlying route. */
const navigationClosers = new Map<string, () => void>();

/** Replace the menu's temporary entry with the destination, preserving one Back. */
export function consumeDialogHistoryForNavigation() {
  if (typeof window === "undefined") return false;
  const token = window.history.state?.portalDialog;
  const consume = navigationClosers.get(token);
  if (!consume) return false;
  consume();
  const { portalDialog: _marker, ...state } = window.history.state;
  window.history.replaceState(state, "", window.location.href);
  return true;
}

export function trackDialogHistory(onDismiss: () => void, opener?: HTMLElement | null) {
  if (typeof window === "undefined") return () => {};
  const token = `dialog-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let active = true;
  let pushed = false;
  const restoreFocus = () => {
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      const modal = document.querySelector("dialog:modal");
      if (opener?.isConnected && !opener.matches(":disabled") && (!modal || modal.contains(opener)))
        opener.focus({ preventScroll: true });
    }));
  };
  // React replays effects in development. The first cleanup cancels its marker.
  const timer = window.setTimeout(() => {
    if (!active) return;
    window.history.pushState({ ...window.history.state, portalDialog: token }, "", window.location.href);
    pushed = true;
    navigationClosers.set(token, () => { pushed = false; });
  }, 0);
  const back = () => {
    if (!active || !pushed || window.history.state?.portalDialog === token) return;
    pushed = false;
    onDismiss();
    restoreFocus();
  };
  window.addEventListener("popstate", back);
  return () => {
    active = false;
    navigationClosers.delete(token);
    window.clearTimeout(timer);
    window.removeEventListener("popstate", back);
    if (pushed && window.history.state?.portalDialog === token) {
      // Let native close and the owner's focus cleanup finish before Next restores
      // the same route's history entry. Restore the opener after that restoration.
      window.setTimeout(() => {
        if (window.history.state?.portalDialog !== token) return;
        window.addEventListener("popstate", restoreFocus, { once: true });
        window.history.back();
      }, 0);
    }
  };
}
