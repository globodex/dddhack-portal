/** A browser Back dismisses the top dialog before it leaves its underlying route. */
export function trackDialogHistory(onDismiss: () => void) {
  if (typeof window === "undefined") return () => {};
  const token = `dialog-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let active = true;
  let pushed = false;
  // React replays effects in development. The first cleanup cancels its marker.
  const timer = window.setTimeout(() => {
    if (!active) return;
    window.history.pushState({ ...window.history.state, portalDialog: token }, "", window.location.href);
    pushed = true;
  }, 0);
  const back = () => {
    if (!active || !pushed || window.history.state?.portalDialog === token) return;
    pushed = false;
    onDismiss();
  };
  window.addEventListener("popstate", back);
  return () => {
    active = false;
    window.clearTimeout(timer);
    window.removeEventListener("popstate", back);
    if (pushed && window.history.state?.portalDialog === token) window.history.back();
  };
}
