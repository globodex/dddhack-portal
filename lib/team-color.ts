import { teamDotColors } from "./avatar-contract";
import { teamPalettes, type Palette } from "./experience-contract";

/** Current team identity colors only. No arbitrary style values or draft snapshots. */
export function resolveTeamColor(value: unknown) {
  const key: Palette = typeof value === "string" && Object.hasOwn(teamPalettes, value)
    ? value as Palette : "forest";
  const palette = teamPalettes[key];
  return { key, fill: teamDotColors[key] || palette.ink, wash: palette.wash, ink: palette.ink, label: palette.label };
}
