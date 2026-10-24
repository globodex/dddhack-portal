/** Geometry shared by the public chapter stack and its agenda controls. */
export const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
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
