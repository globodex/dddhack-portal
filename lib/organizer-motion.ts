export type OrganizerOrigin = "bottom" | "left" | "right";

/** Move the complete measured unit beyond its originating scene edge. */
export function organizerEntry(
  portrait: boolean,
  index: number,
  width: number,
  height: number,
) {
  const origin: OrganizerOrigin = portrait
    ? index % 2 === 0
      ? "left"
      : "right"
    : "bottom";
  const distance = Math.max(0, origin === "bottom" ? height : width) + 24;
  return {
    origin,
    x: origin === "left" ? -distance : origin === "right" ? distance : 0,
    y: origin === "bottom" ? distance : 0,
    duration: portrait ? 600 : 700,
    delay: index * (portrait ? 80 : 40),
  };
}
