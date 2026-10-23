export async function readPortalView(
  url: string,
  signal: AbortSignal,
  timeoutMs = 15_000,
) {
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) abort();
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    const response = await fetch(url, {
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
    });
    const body = (await response.json()) as Record<string, any>;
    return { response, body };
  } catch (error) {
    if (timedOut) throw new Error("Loading timed out. Try again.");
    throw error;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", abort);
  }
}
