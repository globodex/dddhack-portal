import { dotColors, dotExpressions } from "../lib/avatar-contract";
export default function DotAvatar({
  color = "blue",
  expression = "squeezed",
  size = 64,
}: {
  color?: string;
  expression?: string;
  size?: number;
}) {
  const bg = dotColors[color as keyof typeof dotColors] || dotColors.blue,
    marks =
      dotExpressions[expression as keyof typeof dotExpressions] ||
      dotExpressions.squeezed;
  return (
    <svg
      role="img"
      aria-label={`${color} ${expression} avatar`}
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
        letterSpacing="5"
      >
        {marks}
      </text>
    </svg>
  );
}
