/** Geometry shared by the public chapter stack and its agenda controls. */
export const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
/** Full-height chapters share one native sticky model at every breakpoint.
 * Tall content scrolls to its final line before pinning above the next card.
 */
export function viewportChapterGeometry(
  width: number,
  viewportHeight: number,
  headerHeight: number,
  naturalHeights: number[],
  disabled = false,
) {
  const header = Math.max(0, headerHeight);
  const step = width >= 1000 ? 14 : 8;
  return {
    enabled:
      !disabled &&
      width > 0 &&
      viewportHeight - header >= 240 &&
      naturalHeights.length > 0 &&
      naturalHeights.every((value) => Number.isFinite(value) && value > 0),
    tops: naturalHeights.map((natural, index) =>
      Math.min(header + 14 + index * step, viewportHeight - natural - 16),
    ),
    stages: naturalHeights.map((natural) => Math.max(viewportHeight, natural)),
  };
}
export function stackGeometry(
  width: number,
  height: number,
  naturalHeights: number[],
  disabled = false,
) {
  const gap = 14,
    step = width >= 1100 ? 14 : 10;
  const tops = naturalHeights.map((_, i) => gap + i * step);
  const stages = tops.map((top) => height - top - 24);
  return {
    tops,
    stages,
    enabled:
      !disabled &&
      width >= 768 &&
      stages.every((stage, i) => stage >= 520 && naturalHeights[i] <= stage),
  };
}
/** Desktop chapters fill their stage; oversized content scrolls before pinning. */
export function desktopChapterGeometry(
  width: number,
  height: number,
  naturalHeights: number[],
  disabled = false,
) {
  const layers = naturalHeights.map((_, index) => 14 + index * 14);
  return {
    enabled:
      !disabled &&
      width >= 1000 &&
      height >= 600 &&
      naturalHeights.length > 0 &&
      naturalHeights.every((value) => Number.isFinite(value) && value > 0),
    tops: naturalHeights.map((natural, index) =>
      Math.min(layers[index], height - natural - 24),
    ),
    stages: naturalHeights.map((natural, index) =>
      Math.max(height - layers[index] - 24, natural),
    ),
  };
}
/** Native mobile stacking lets long cards pass fully before their bottom pins. */
export function mobileStackGeometry(
  width: number,
  height: number,
  naturalHeights: number[],
  disabled = false,
) {
  return {
    enabled:
      !disabled &&
      width > 0 &&
      width <= 740 &&
      height >= 240 &&
      naturalHeights.every((value) => Number.isFinite(value) && value > 0),
    tops: naturalHeights.map((natural, index) =>
      Math.min(14 + index * 8, height - natural - 16),
    ),
    stages: naturalHeights,
  };
}
export function agendaGeometry(
  startY: number,
  distance: number,
  scrollY: number,
) {
  const travel = Math.max(0, distance);
  const progress = travel ? clamp01((scrollY - startY) / travel) : 0;
  return { travel, progress, translation: progress ? -progress * travel : 0 };
}
export function agendaDestination(
  startY: number,
  distance: number,
  itemOffset: number,
) {
  return startY + Math.max(0, Math.min(distance, itemOffset));
}
export function confirmedAgenda<T extends { time: string; title: string }>(
  items: T[],
) {
  return items.filter(
    (item) =>
      item.time.trim() &&
      item.title.trim() &&
      !/to follow|to be confirmed|schedule pending|agenda pending/i.test(
        `${item.time} ${item.title}`,
      ),
  );
}
