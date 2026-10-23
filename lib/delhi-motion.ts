/** Shared 2048×768 coordinate system. Only the overscanned interior fill moves. */
export function delhiOffset(
  x: number,
  y: number,
  width: number,
  height: number,
  enabled = true,
) {
  if (
    !enabled ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0 ||
    !Number.isFinite(x) ||
    !Number.isFinite(y)
  )
    return { x: 0, y: 0 };
  const clamp = (v: number) => Math.max(-1, Math.min(1, v));
  const scale = width / 2048;
  return {
    x: -6 * clamp((x / width) * 2 - 1) * scale,
    y: -4 * clamp((y / height) * 2 - 1) * scale,
  };
}
