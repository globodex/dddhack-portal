import { teamPalettes, type Palette } from "../lib/experience-contract";
import { teamDotColors } from "../lib/avatar-contract";
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
  const p = teamPalettes[palette as Palette] || teamPalettes.forest,
    bg = teamDotColors[palette] || p.ink;
  return (
    <svg
      className="team-avatar"
      role="img"
      aria-label={`${name} team badge`}
      viewBox="0 0 80 80"
      width={size}
      height={size}
    >
      <circle cx="40" cy="40" r="40" fill={bg} />
      <text
        x="40"
        y="42"
        dominantBaseline="middle"
        textAnchor="middle"
        fill={palette === "graphite" ? "white" : "#111"}
        fontFamily="Arial,sans-serif"
        fontWeight="700"
        fontSize="25"
      >
        {nameInitials(name)}
      </text>
    </svg>
  );
}
