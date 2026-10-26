export const adminGenderChoices = [
  { value: "man", label: "Male" },
  { value: "woman", label: "Female" },
  { value: "non-binary", label: "Non-binary" },
] as const;
export const adminParticipantStatuses = [
  "Registered",
  "Going",
  "Checked in",
  "Absent",
] as const;
export const adminTeamStatuses = [
  "Forming",
  "Locked",
  "Approved",
  "Yet to submit",
  "Not submitted",
  "Submitted",
] as const;
export type AdminDemographics = {
  gender?: string;
  profession?: string;
  participantStatus?: string;
  teamStatus?: string;
};
