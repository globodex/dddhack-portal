// Participant-facing choices from the confirmed master specification.
// This is a declaration, not automatic evidence of tool usage or a score.
export const submissionToolChoices = [
  "ChatGPT",
  "ChatGPT Work",
  "ChatGPT Dots",
  "Codex CLI",
  "Codex IDE Extension",
  "Codex Cloud / delegated tasks",
  "OpenAI API / models",
  "Other OpenAI tools",
] as const;

export function selectedSubmissionTools(value: unknown): string[] {
  if (typeof value !== "string") return [];
  const selected = value.split(/[\n,]/).map((item) => item.trim());
  return submissionToolChoices.filter((choice) => selected.includes(choice));
}
