import { dotColors, dotExpressions } from "../lib/avatar-contract";
export default function DotAvatar({
  color = "blue",
  expression = "squeezed",
  size = 64,
  decorative = false,
}: {
  color?: string;
  expression?: string;
  size?: number;
  decorative?: boolean;
}) {
  const bg = dotColors[color as keyof typeof dotColors] || dotColors.blue,
    marks =
      dotExpressions[expression as keyof typeof dotExpressions] ||
      dotExpressions.squeezed;
  return (
    <svg
      role={decorative ? undefined : "img"}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : `${color} ${expression} avatar`}
      focusable="false"
      width={size}
      height={size}
      viewBox="0 0 80 80"
    >
      <circle cx="40" cy="40" r="40" fill={bg} />
      <text
        x="40"
        y="43"
        dominantBaseline="middle"
        textAnchor="middle"
        fill={color === "charcoal" ? "white" : "#111"}
        fontFamily="Arial,sans-serif"
        fontWeight="700"
        fontSize="28"
      >
        <tspan x="28">{marks[0]}</tspan>
        <tspan x="52">{marks[1]}</tspan>
      </text>
    </svg>
  );
}
