import { dotColors, dotExpressions } from "./avatar-contract";

const colors = Object.keys(dotColors) as (keyof typeof dotColors)[];
const expressions = Object.keys(
  dotExpressions,
) as (keyof typeof dotExpressions)[];
const clamp = (n: number, low: number, high: number) =>
  Math.max(low, Math.min(high, n));

/** A stable pool shared by SSR and the browser. No random work during motion. */
export const portraitDotPool = Array.from({ length: 36 }, (_, index) => {
  let seed = Math.imul(index + 1, 0x45d9f3b) >>> 0;
  const next = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return (seed >>> 0) / 0xffffffff;
  };
  return {
    color: colors[index % colors.length],
    expression: expressions[(index * 3) % expressions.length],
    size: 0.76 + next() * 0.48,
    jitter: next() - 0.5,
    angle: (next() - 0.5) * 40,
    verticalJitter: next() - 0.5,
  };
});

export function portraitPile(width: number, height: number, progress: number) {
  const p = clamp(Number.isFinite(progress) ? progress : 0, 0, 1);
  const count = 4 + Math.round(32 * p);
  const columns = 4;
  const rows = Math.ceil(count / columns);
  const fillHeight = Math.max(0, height) * (0.14 + 0.66 * p);
  const base = clamp(width * 0.19, 42, 88);
  const largest = Math.min((width / columns) * 1.12, base * 1.24);
  const step = rows > 1 ? Math.max(0, fillHeight - largest) / (rows - 1) : 0;
  return {
    count,
    fillHeight,
    progress: p,
    dots: portraitDotPool.map((dot, index) => {
      const diameter = Math.min((width / columns) * 1.12, base * dot.size);
      const radius = diameter / 2;
      const row = Math.floor(index / columns);
      // Alternating row offsets and bounded seeded jitter break up visible lanes.
      // Keep the pile inside its viewport jar and retain the same fill envelope.
      const stagger = row % 2 === 0 ? -0.22 : 0.22;
      return {
        ...dot,
        diameter,
        active: index < count,
        x: clamp(
          (((index % columns) + 0.5 + stagger + dot.jitter * 0.62) * width) /
            columns,
          radius,
          Math.max(radius, width - radius),
        ),
        y: clamp(
          height - radius - row * step + dot.verticalJitter * step * 0.8,
          Math.max(radius, height - fillHeight + radius),
          Math.max(radius, height - radius),
        ),
      };
    }),
  };
}

export function backdropRepulsion(
  x: number,
  y: number,
  pointer: { x: number; y: number } | null,
) {
  if (!pointer) return { x: 0, y: 0 };
  const dx = x - pointer.x,
    dy = y - pointer.y,
    distance = Math.hypot(dx, dy);
  if (distance >= 140) return { x: 0, y: 0 };
  const force = Math.min(24, (1 - distance / 140) * 24);
  return {
    x: distance > 0.1 ? (dx / distance) * force : 0,
    y: distance > 0.1 ? (dy / distance) * force : -force,
  };
}
