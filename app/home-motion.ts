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
    x: 106,
    y: 158,
    diameter: 136,
  },
  {
    color: "green",
    expression: "plus",
    fill: "#00ab44",
    x: 365,
    y: 171,
    diameter: 136,
  },
  {
    color: "purple",
    expression: "round",
    fill: "#924ff7",
    x: 242,
    y: 282,
    diameter: 130,
  },
  {
    color: "orange",
    expression: "sleepy",
    fill: "#f26d00",
    x: 250,
    y: 76,
    diameter: 98,
  },
  {
    color: "charcoal",
    expression: "cheerful",
    fill: "#262626",
    x: 98,
    y: 345,
    diameter: 88,
  },
  {
    color: "grey",
    expression: "star",
    fill: "#dfdfdf",
    x: 348,
    y: 360,
    diameter: 88,
  },
  {
    color: "blue",
    expression: "sleepy",
    fill: "#006aff",
    x: 248,
    y: 403,
    diameter: 68,
  },
  {
    color: "green",
    expression: "plus",
    fill: "#00ab44",
    x: 420,
    y: 286,
    diameter: 64,
    angle: 24,
  },
];
export const mobileDots: PublicDot[] = [
  { ...desktopDots[0], x: 165, y: 174, diameter: 190 },
  { ...desktopDots[1], x: 355, y: 235, diameter: 164 },
  { ...desktopDots[2], x: 130, y: 332, diameter: 174 },
  { ...desktopDots[3], x: 310, y: 100, diameter: 140 },
  { ...desktopDots[4], x: 294, y: 320, diameter: 116 },
  { ...desktopDots[5], x: 365, y: 397, diameter: 120 },
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
) {
  if (!pointer) return { x: dot.homeX, y: dot.homeY };
  const dx = dot.homeX - pointer.x,
    dy = dot.homeY - pointer.y;
  const distance = Math.hypot(dx, dy);
  const scale = Math.min(1, width / (bottom ? 900 : 480));
  const range = (bottom ? 270 : 255) * Math.max(0.65, scale);
  if (distance >= range) return { x: dot.homeX, y: dot.homeY };
  const force =
    (bottom ? 150 : 110) * scale * Math.pow(1 - distance / range, 0.65);
  const nx = distance > 0.1 ? dx / distance : 0,
    ny = distance > 0.1 ? dy / distance : -1;
  return {
    x: clamp(dot.homeX + nx * force, dot.r, Math.max(dot.r, width - dot.r)),
    y: clamp(
      dot.homeY + ny * force,
      dot.r,
      Math.max(dot.r, height - dot.r * (bottom ? 0.65 : 1)),
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
) {
  const step = clamp(dt, 0.1, 2);
  dot.vx = (dot.vx + (target.x - dot.x) * 0.045 * step) * Math.pow(0.77, step);
  dot.vy = (dot.vy + (target.y - dot.y) * 0.045 * step) * Math.pow(0.77, step);
  dot.x = clamp(dot.x + dot.vx * step, dot.r, Math.max(dot.r, width - dot.r));
  dot.y = clamp(
    dot.y + dot.vy * step,
    dot.r,
    Math.max(dot.r, height - dot.r * (bottom ? 0.65 : 1)),
  );
  return (
    Math.abs(dot.vx) +
      Math.abs(dot.vy) +
      Math.abs(target.x - dot.x) +
      Math.abs(target.y - dot.y) >
    0.12
  );
}
