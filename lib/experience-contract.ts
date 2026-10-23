export const avatarPresets = ["initials"] as const;
export const teamPalettes = {
  forest: { label: "Forest", ink: "#006b43", wash: "#e8f7ef" },
  cobalt: { label: "Cobalt", ink: "#004fc0", wash: "#ecf2ff" },
  violet: { label: "Violet", ink: "#6832ad", wash: "#f2ecfc" },
  ember: { label: "Ember", ink: "#a63b0b", wash: "#fff0e8" },
  lagoon: { label: "Lagoon", ink: "#00666f", wash: "#e6f5f5" },
  rose: { label: "Rose", ink: "#a52259", wash: "#ffedf4" },
  graphite: { label: "Charcoal", ink: "#343434", wash: "#efefef" },
  yellow:{label:"Yellow",ink:"#745800",wash:"#fff7d6"},
  coral:{label:"Coral",ink:"#9a2038",wash:"#fff0f3"},
  grey:{label:"Grey",ink:"#424242",wash:"#f4f4f4"},
} as const;
export type Palette = keyof typeof teamPalettes;
export type AvatarPreset = (typeof avatarPresets)[number];
export const portalRoles = [
  "participant",
  "volunteer",
  "mentor",
  "judge",
  "admin",
] as const;
export const unresolvedEventDecisions = [
  "Diversity and Codex assessment criteria require documented owner confirmation; gender is not inferred or automatically scored.",
  "Vote normalization, feedback validity/targets, judging/appeal windows and tie handling remain unconfirmed.",
] as const;
export function readiness(total: number, approved: number) {
  return {
    total,
    approved,
    allApproved: total > 0 && approved === total,
    label:
      total > 0 && approved === total
        ? `${approved}/${total} individual approvals`
        : total
          ? `Waiting for approval · ${approved}/${total}`
          : "No team yet",
  };
}
export function participantStatus(input: {
  submitted?: boolean;
  checkedIn?: boolean;
  going?: boolean;
  approval?: string;
}) {
  if (input.submitted) return "Submitted";
  if (input.checkedIn) return "Checked in";
  if (input.approval === "approved") return "Going";
  if (input.approval === "rejected") return "Not approved";
  if (input.approval === "cancelled") return "Cancelled";
  return "Registered";
}
