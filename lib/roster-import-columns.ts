/** Shared import-column policy. No CSV rows, PII storage, or server dependencies. */
export function normalizedRosterHeader(header: string) {
  return header
    .replace(/\uFEFF/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function rosterEmailColumns(headers: readonly string[]) {
  return headers.filter((header) =>
    /(^|[^a-z0-9])email(?=$|[^a-z0-9])/.test(normalizedRosterHeader(header)),
  );
}

const aliases: Record<string, readonly string[]> = {
  displayName: ["name", "full name"],
  phone: ["phone number", "phone"],
  bestDescription: ["What best describes you?"],
  organization: ["Organization"],
  openaiOrgId: [
    "Please share your OpenAI org ID (Find: https://platform.openai.com/settings/organization/general)",
  ],
  linkedin: ["What is your LinkedIn profile?", "linkedin"],
  github: ["What is your GitHub username?", "github"],
  website: ["Product / Portfolio website", "website"],
};
const aliasKey = (header: string) =>
  normalizedRosterHeader(header).replace(/_/g, " ");
export function rosterPrefillColumns(headers: readonly string[]) {
  return Object.fromEntries(
    Object.entries(aliases).flatMap(([field, names]) => {
      for (const name of names) {
        const matches = headers.filter(
          (header) => aliasKey(header) === aliasKey(name),
        );
        if (matches.length === 1) return [[field, matches[0]]];
        if (matches.length > 1) return [];
      }
      return [];
    }),
  );
}

export function rosterNameParts(headers: readonly string[]) {
  const find = (name: string) => {
    const matches = headers.filter((header) => aliasKey(header) === name);
    return matches.length === 1 ? matches[0] : undefined;
  };
  return { firstName: find("first name"), lastName: find("last name") };
}

export function rosterGitHubURL(value: string) {
  const username = value.trim().replace(/^@/, "");
  return /^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$/i.test(username)
    ? "https://github.com/" + username
    : value;
}
