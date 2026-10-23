// Await the host's exact list; no participant categories are invented.
export const profileDescriptionChoices: readonly string[] = [];
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
