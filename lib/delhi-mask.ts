/** A decoded mask shared by the preloader and CSS, without a second URL request. */
export async function loadDelhiMask(
  signal: AbortSignal,
  source = "/art/delhi-v3/text-mask-alpha.png",
) {
  const response = await fetch(source, { signal });
  if (!response.ok) throw new Error("Artwork unavailable");
  const blob = await response.blob();
  signal.throwIfAborted();
  const url = URL.createObjectURL(blob);
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    URL.revokeObjectURL(url);
    signal.removeEventListener("abort", dispose);
  };
  signal.addEventListener("abort", dispose, { once: true });
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    signal.throwIfAborted();
    return { url, dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}
