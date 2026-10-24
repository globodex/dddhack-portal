import { resolveTeamColor } from "../lib/team-color";
import { nameInitials } from "../lib/profile-contract";
export default function TeamAvatar({
  name = "Team",
  palette = "forest",
  size = 64,
}: {
  name?: string;
  palette?: string;
  size?: number;
  avatar?: string;
}) {
  const selected = resolveTeamColor(palette);
  return (
    <svg
      className="team-avatar"
      role="img"
      aria-label={`${name} team badge`}
      viewBox="0 0 80 80"
      width={size}
      height={size}
    >
      <circle cx="40" cy="40" r="40" fill={selected.fill} />
      <text
        x="40"
        y="42"
        dominantBaseline="middle"
        textAnchor="middle"
        fill={selected.key === "graphite" ? "white" : "#111"}
        fontFamily="Arial,sans-serif"
        fontWeight="700"
        fontSize="25"
      >
        {nameInitials(name)}
      </text>
    </svg>
  );
}
