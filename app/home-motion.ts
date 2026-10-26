/** Public artwork motion only; no participant/avatar policy is defined here. */
export type PublicDot = {
  color: string;
  expression: string;
  fill: string;
  x: number;
  y: number;
  diameter: number;
  angle?: number;
};
export const desktopDots: PublicDot[] = [
  {
    color: "blue",
    expression: "squeezed",
    fill: "#006aff",
    x: 150,
    y: 220,
    diameter: 156,
  },
  {
    color: "green",
    expression: "plus",
    fill: "#00ab44",
    x: 280,
    y: 195,
    diameter: 132,
  },
  {
    color: "purple",
    expression: "round",
    fill: "#924ff7",
    x: 246,
    y: 309,
    diameter: 106,
  },
  {
    color: "orange",
    expression: "sleepy",
    fill: "#f26d00",
    x: 227,
    y: 102,
    diameter: 82,
  },
  {
    color: "charcoal",
    expression: "cheerful",
    fill: "#262626",
    x: 112,
    y: 329,
    diameter: 82,
  },
  {
    color: "grey",
    expression: "star",
    fill: "#dfdfdf",
    x: 335,
    y: 306,
    diameter: 58,
  },
  {
    color: "blue",
    expression: "sleepy",
    fill: "#006aff",
    x: 343,
    y: 113,
    diameter: 82,
  },
  {
    color: "green",
    expression: "plus",
    fill: "#00ab44",
    x: 352,
    y: 230,
    diameter: 58,
    angle: 24,
  },
];
// Keep the same eight-instance composition and five size tiers on compact stages.
export const mobileDots: PublicDot[] = desktopDots;
/** A narrow desktop rail uses the existing palette and expression assets. */
export const railDots: PublicDot[] = [
  { ...desktopDots[3], x: 130, y: 26, diameter: 102 },
  { ...desktopDots[0], x: 340, y: 58, diameter: 130 },
  { ...desktopDots[1], x: 180, y: 100, diameter: 116 },
  { ...desktopDots[5], x: 365, y: 134, diameter: 86 },
  { ...desktopDots[2], x: 100, y: 170, diameter: 128 },
  { ...desktopDots[4], x: 310, y: 206, diameter: 112 },
  { ...desktopDots[6], x: 165, y: 244, diameter: 98 },
  { ...desktopDots[7], x: 360, y: 278, diameter: 108 },
  { ...desktopDots[3], x: 115, y: 316, diameter: 92 },
  { ...desktopDots[2], x: 300, y: 350, diameter: 124 },
  { ...desktopDots[5], x: 145, y: 388, diameter: 88 },
  { ...desktopDots[1], x: 355, y: 420, diameter: 114 },
];
// The selected compact hero has a quiet centre for its actions and a separate
// bottom pile. Coordinates share a 480-unit horizontal stage, not desktop height.
export const compactSideDots: PublicDot[] = [
  { ...desktopDots[0], x: 35, y: 170, diameter: 114 },
  { ...desktopDots[3], x: 100, y: 138, diameter: 76 },
  { ...desktopDots[1], x: 450, y: 112, diameter: 108 },
  { ...desktopDots[2], x: 431, y: 180, diameter: 80 },
];
export const compactStripDots: PublicDot[] = [
  { ...desktopDots[0], x: -8, y: 12, diameter: 100 },
  { ...desktopDots[2], expression: "cheerful", x: 44, y: 36, diameter: 160 },
  { ...desktopDots[1], x: 150, y: 28, diameter: 128 },
  { ...desktopDots[5], x: 200, y: 12, diameter: 88 },
  { ...desktopDots[0], x: 292, y: 20, diameter: 160 },
  { ...desktopDots[3], x: 368, y: 72, diameter: 112 },
  { ...desktopDots[4], x: 430, y: 16, diameter: 160 },
  { ...desktopDots[6], x: 510, y: 64, diameter: 128 },
];
export const stripDots: PublicDot[] = [
  { ...desktopDots[6], diameter: 82 },
  { ...desktopDots[5], diameter: 56 },
  { ...desktopDots[2], expression: "mixed-slash", diameter: 88, angle: -14 },
  { ...desktopDots[7], diameter: 68, angle: 16 },
  { ...desktopDots[3], diameter: 52 },
  { ...desktopDots[1], diameter: 86, angle: 12 },
  { ...desktopDots[4], diameter: 56 },
  { ...desktopDots[4], expression: "mixed-slash", diameter: 86 },
  { ...desktopDots[2], diameter: 58 },
  { ...desktopDots[5], diameter: 74 },
  { ...desktopDots[3], diameter: 88 },
  { ...desktopDots[6], diameter: 58 },
  { ...desktopDots[7], diameter: 68, angle: -18 },
  { ...desktopDots[2], diameter: 88, angle: 14 },
  { ...desktopDots[5], diameter: 56 },
  { ...desktopDots[0], diameter: 82, angle: -10 },
  { ...desktopDots[3], diameter: 52 },
  { ...desktopDots[1], diameter: 86, angle: 18 },
];
export type DotState = {
  x: number;
  y: number;
  homeX: number;
  homeY: number;
  r: number;
  vx: number;
  vy: number;
};
const clamp = (value: number, low: number, high: number) =>
  Math.max(low, Math.min(high, value));
/** A proximity field affects a cluster, with substantial but stage-bounded travel. */
export function airblowerTarget(
  dot: DotState,
  pointer: { x: number; y: number } | null,
  width: number,
  height: number,
  bottom: boolean,
  edgeBleed = false,
  contained = false,
) {
  if (!pointer) return { x: dot.homeX, y: dot.homeY };
  const dx = dot.homeX - pointer.x,
    dy = dot.homeY - pointer.y;
  const distance = Math.hypot(dx, dy);
  const scale = Math.min(1, width / (bottom ? 900 : 480));
  const range = (bottom ? 310 : 255) * Math.max(0.65, scale);
  if (distance >= range) return { x: dot.homeX, y: dot.homeY };
  const force =
    (bottom ? 200 : 145) * scale * Math.pow(1 - distance / range, 0.65);
  const nx = distance > 0.1 ? dx / distance : 0,
    ny = distance > 0.1 ? dy / distance : -1;
  return {
    x: clamp(
      dot.homeX + nx * force,
      edgeBleed && !contained ? -dot.r * 0.35 : dot.r,
      Math.max(
        dot.r,
        edgeBleed && !contained ? width + dot.r * 0.35 : width - dot.r,
      ),
    ),
    y: clamp(
      dot.homeY + ny * force,
      dot.r,
      Math.max(dot.r, height - dot.r * (bottom && !contained ? 0.65 : 1)),
    ),
  };
}
export function advanceDot(
  dot: DotState,
  target: { x: number; y: number },
  dt: number,
  width: number,
  height: number,
  bottom: boolean,
  edgeBleed = false,
  contained = false,
) {
  const step = clamp(dt, 0.1, 2);
  dot.vx = (dot.vx + (target.x - dot.x) * 0.045 * step) * Math.pow(0.77, step);
  dot.vy = (dot.vy + (target.y - dot.y) * 0.045 * step) * Math.pow(0.77, step);
  dot.x = clamp(
    dot.x + dot.vx * step,
    edgeBleed && !contained ? -dot.r * 0.35 : dot.r,
    Math.max(
      dot.r,
      edgeBleed && !contained ? width + dot.r * 0.35 : width - dot.r,
    ),
  );
  dot.y = clamp(
    dot.y + dot.vy * step,
    dot.r,
    Math.max(dot.r, height - dot.r * (bottom && !contained ? 0.65 : 1)),
  );
  return (
    Math.abs(dot.vx) +
      Math.abs(dot.vy) +
      Math.abs(target.x - dot.x) +
      Math.abs(target.y - dot.y) >
    0.12
  );
}
