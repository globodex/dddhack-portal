// Exact options verified from the user-supplied Luma registration question.
export const profileDescriptionChoices: readonly string[] = [
  "Startup Founder",
  "Working Professional",
  "Independent Developer",
  "College Student",
  "School Student",
  "Other (non-tech)",
];
export const profilePhonePattern = /^\+[1-9][0-9]{7,14}$/;
export function nameInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (
    (parts.length > 1 ? [parts[0], parts.at(-1)!] : parts)
      .map((p) => Array.from(p)[0])
      .join("")
      .toUpperCase() || "?"
  );
}
